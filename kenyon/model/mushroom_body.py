"""The fly's own mushroom body as a feedforward circuit, with plastic Kenyon-cell -> MBON synapses.

Structure from the MaleCNS connectome, read from the full-connectome wiring cache (connectome/mb_build.py) or from
a weight-thresholded subgraph: excitatory uniglomerular olfactory projection neurons (PN) -> Kenyon cells (KC)
-> mushroom body output neurons (MBON), plus the dopaminergic PPL1 (punishment) and PAM (reward) -> MBON wiring
that says which MBON compartment each reinforcement reaches. With modality="visual" the visual projection neurons
that reach Kenyon cells take the place of the PNs.

Physiology (disclosed, grounded in measured KC properties): Kenyon cells are feedforward coincidence detectors
with a high threshold, and APL feedback keeps only the most strongly driven ~5 % active (k-winners-take-all).
The uniform recurrent rate model erases this code (experiments/sparse.py); the connectome's PN->KC wiring
alone produces it.

Learning rule (Gkanias, McCurdy, Nitabach & Webb, eLife 2022) on KC->MBON synapses only:
    dW_ij = -lr * delta_j * (k_i + W_ij - 1),   W in [0, w_max]
delta_j >= 0 is the dopamine MBON j receives (from the connectome's DAN -> MBON synapse counts), k_i the KC
activity. For an active KC this depresses the synapse; for a silent KC it relaxes a depressed synapse back
toward 1 ("dopamine alone restores"). Reward is also depression, in the PAM compartments (Owald et al. 2015).
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import torch
from scipy import sparse

PN_SUFFIX = {"adPN", "lPN", "ilPN", "l2PN", "il2PN"}   # excitatory uniglomerular olfactory PN classes (MaleCNS names)
W_REST = 1.0
HIGE_CHARGE_DROP = 0.9


def is_olfactory_pn(t: str) -> bool:
    """<glomerulus>_<class>PN: excitatory, uniglomerular, olfactory. Multiglomerular types carry '+', the VP
    glomeruli are thermo/hygrosensory, and vPNs are GABAergic; all excluded."""
    if "_" not in t:
        return False
    g, s = t.rsplit("_", 1)
    return s in PN_SUFFIX and "+" not in g and not g.startswith("VP")


class MushroomBody:
    """Feedforward PN -> KC(kWTA) -> MBON circuit from the connectome, with plastic KC->MBON synapses."""

    def __init__(self, subgraph: Path | None = None, neurons: Path | None = None, sparsity: float = 0.05, punish=("PPL101",),
                 reward=("PAM",), lr: float = 0.9, w_max: float = 2.0, shuffle: str | None = None, seed: int = 0,
                 binary: bool = False, recover_rate: float = 1.0, wiring: Path | None = None, modality: str = "olfactory"):
        self.binary, self.sparsity, self.lr, self.w_max, self.recover_rate = binary, sparsity, lr, w_max, recover_rate
        self.modality = modality
        rng = np.random.default_rng(seed)
        if wiring is not None:                                               # full-connectome cache (connectome/mb_build.py)
            self._load_from_wiring(wiring, modality)
        else:                                                               # weight-thresholded Doom subgraph
            self._load_from_subgraph(subgraph, neurons)
        self.glom_names = self.channel_names; self.glom = self.channel      # backward-compatible aliases
        n_kc = self._Wpk.shape[0]
        self._tiebreak = rng.random(n_kc)                                    # fixed random order for kWTA ties
        W_pk = self._Wpk
        if shuffle == "pn_kc":                                               # degree-preserving: permute input identity
            W_pk = W_pk[:, rng.permutation(W_pk.shape[1])]
        self.W_pk = W_pk.tocsr()
        W_km = self._Wkm
        if shuffle == "kc_mbon":                                             # degree-preserving: permute KC identity
            W_km = sparse.coo_matrix((W_km.data, (W_km.row, rng.permutation(W_km.col))), shape=W_km.shape)
        self.e_mbon = torch.as_tensor(W_km.row, dtype=torch.long); self.e_kc = torch.as_tensor(W_km.col, dtype=torch.long)
        self.e_base = torch.as_tensor(W_km.data, dtype=torch.float32)       # synapse counts (KCs are excitatory)
        self.n_edges = len(self.e_base)
        self.W = torch.ones(self.n_edges)
        self.delta_punish = self._dan_template(punish)
        self.delta_reward = self._dan_template(reward)
        self.n_input = self.W_pk.shape[1]; self.n_kc = self.W_pk.shape[0]; self.n_mbon = len(self.mbon_type)
        self.n_drivable_kc = int((np.asarray((self.W_pk != 0).sum(axis=1)).ravel() > 0).sum())   # KCs this pathway can drive
        self.n_punish_dan = int(sum(any(tp.startswith(p) for p in punish) for tp in self._dan_type))
        self.n_reward_dan = int(sum(any(tp.startswith(p) for p in reward) for tp in self._dan_type))
        if shuffle == "dan_mbon":                                            # informative control: scramble the compartment map
            self.delta_punish = self._permute_types(self.delta_punish, rng)
            self.delta_reward = self._permute_types(self.delta_reward, rng)

    def _load_from_subgraph(self, subgraph, neurons):
        import pandas as pd

        from kenyon.model.core import load_subgraph
        sub = load_subgraph(subgraph); body = np.asarray(sub["bodyId"]); m = len(body)
        n = pd.read_parquet(neurons, columns=["bodyId", "type"]).drop_duplicates("bodyId").set_index("bodyId")
        t = n["type"].reindex(body).fillna("").astype(str).to_list()
        A = sparse.csr_matrix((np.asarray(sub["weight"], np.float64), np.asarray(sub["indices_pre"], np.int64),
                               np.asarray(sub["indptr_post"], np.int64)), shape=(m, m))
        sel = lambda f: np.flatnonzero(np.array([f(x) for x in t]))
        pn = sel(is_olfactory_pn); kc = sel(lambda x: x.startswith("KC")); mbon = sel(lambda x: x.startswith("MBON"))
        dan = sel(lambda x: x.startswith(("PPL1", "PAM")))
        self.pn, self.kc, self.mbon = pn, kc, mbon                           # subgraph-body indices (behaviour readout uses these)
        self.mbon_type = [t[i] for i in mbon]; self._dan_type = [t[i] for i in dan]
        ch = {}
        for j, i in enumerate(pn):
            ch.setdefault(t[i].split("_")[0], []).append(j)
        self.channel_names = sorted(ch); self.channel = ch
        self._Wpk = A[kc][:, pn].tocsr(); self._Wkm = A[mbon][:, kc].tocoo()
        self._dan_dense = np.asarray(A[mbon][:, dan].todense())
        self._mbon_in_total = np.asarray(A[mbon].sum(axis=1)).ravel()   # total input per MBON within the subgraph
        self.input_totals_source = "Doom subgraph (weight-thresholded)"
        self.kc_body = body[kc]

    def _load_from_wiring(self, wiring, modality):
        z = np.load(wiring, allow_pickle=False)
        self.mbon_type = [str(x) for x in z["mbon_type"]]; self._dan_type = [str(x) for x in z["dan_type"]]
        pre = "vk" if modality == "visual" else "pk"
        self._Wpk = sparse.csr_matrix((z[f"{pre}_data"], z[f"{pre}_indices"], z[f"{pre}_indptr"]), shape=tuple(z[f"{pre}_shape"]))
        self._Wkm = sparse.coo_matrix((z["km_data"], (z["km_row"], z["km_col"])), shape=tuple(z["km_shape"]))
        self._dan_dense = z["dan_mbon"]
        labels = [str(x) for x in (z["vpn_type"] if modality == "visual" else z["opn_glom"])]
        ch = {}
        for j, name in enumerate(labels):
            ch.setdefault(name, []).append(j)
        self.channel_names = sorted(ch); self.channel = ch
        self._mbon_in_total = z["mbon_in_total"] if "mbon_in_total" in z.files else None   # whole-connectome input per MBON
        self.input_totals_source = "full connectome (mb_build cache)"
        self.kc_body = z["kc_body"] if "kc_body" in z.files else None
        self.wiring_build = {k: str(z[k]) for k in ("build_time", "build_source_sha") if k in z.files}

    def mbon_input_frac_from_kc(self, type_name: str = "MBON11") -> float | None:
        """Share of the summed synaptic input onto the MBONs of `type_name` that arrives from Kenyon cells
        (unshuffled wiring); the denominator is every input the source table records for those cells."""
        if self._mbon_in_total is None:
            return None
        mask = np.array([tp == type_name for tp in self.mbon_type])
        kc_in = np.asarray(self._Wkm.tocsr().sum(axis=1)).ravel()
        tot = float(self._mbon_in_total[mask].sum())
        return round(float(kc_in[mask].sum()) / tot, 4) if tot > 0 else None

    def _dan_template(self, prefixes) -> torch.Tensor:
        """Per-MBON reinforcement strength (0..1) from DAN -> MBON synapse counts of the DAN types matching
        `prefixes`, pooled over the hemispheric copies of each MBON type (so reconstruction asymmetry cannot give
        one copy of a compartment a different dose), then normalised to max 1."""
        cols = [k for k, tp in enumerate(self._dan_type) if any(tp.startswith(p) for p in prefixes)]
        d = np.zeros(len(self.mbon_type))
        if cols:
            raw = self._dan_dense[:, cols].sum(axis=1)
            for tp in set(self.mbon_type):
                idx = [i for i, x in enumerate(self.mbon_type) if x == tp]
                d[idx] = raw[idx].mean()
        return torch.as_tensor(d / d.max() if d.max() > 0 else d, dtype=torch.float32)

    def _permute_types(self, delta: torch.Tensor, rng) -> torch.Tensor:
        tps = sorted(set(self.mbon_type)); val = {tp: float(delta[self.mbon_type.index(tp)]) for tp in tps}
        perm = dict(zip(tps, [val[x] for x in np.array(tps)[rng.permutation(len(tps))]]))
        return torch.as_tensor([perm[tp] for tp in self.mbon_type], dtype=torch.float32)

    def type_mask(self, name: str) -> torch.Tensor:
        return torch.as_tensor([tp == name for tp in self.mbon_type])

    def compartment_mask(self, us: str = "punish", thr: float = 0.5) -> torch.Tensor:
        """MBONs whose type receives at least `thr` of the maximal DAN dose: the compartment(s) the chosen DANs
        really innervate (PPL101 -> MBON11 in the real wiring). Falls back to MBON11 if nothing qualifies."""
        d = {"punish": self.delta_punish, "reward": self.delta_reward}[us]
        m = d >= thr
        return m if bool(m.any()) else self.type_mask("MBON11")

    # -- circuit --------------------------------------------------------------------------------
    def odour(self, gloms, strength: float = 1.0) -> np.ndarray:
        v = np.zeros(self.W_pk.shape[1])
        for g in gloms:
            v[self.glom[self.glom_names[g]]] = strength
        return v

    def kc_code(self, pn_vec: np.ndarray) -> torch.Tensor:
        """Feedforward drive through the real PN->KC wiring, then APL-style k-winners-take-all: exactly the top
        `sparsity` fraction of driven Kenyon cells fire (ties broken in a fixed random order); graded rates are
        normalised to max 1, or read as fire / not fire with binary=True."""
        drive = np.asarray(self.W_pk @ pn_vec).ravel()
        k = max(1, round(self.sparsity * self.n_drivable_kc))                # top `sparsity` of the KCs this pathway can drive
        order = np.lexsort((self._tiebreak, -drive))                         # strongest drive first
        win = order[:k]; win = win[drive[win] > 0]
        code = np.zeros_like(drive); code[win] = drive[win]
        if self.binary:
            code = (code > 0).astype(np.float64)
        elif code.max() > 0:
            code = code / code.max()
        return torch.as_tensor(code, dtype=torch.float32)

    def _sum_to_mbon(self, per_edge: torch.Tensor) -> torch.Tensor:
        return torch.zeros(self.n_mbon).index_add_(0, self.e_mbon, per_edge)

    def mbon_response(self, kc: torch.Tensor) -> torch.Tensor:
        """Summed plastic synaptic drive from the active KCs onto each MBON (Hige's EPSC-charge analogue)."""
        return self._sum_to_mbon(self.e_base * self.W * kc[self.e_kc])

    # -- learning -------------------------------------------------------------------------------
    def reinforce(self, kc: torch.Tensor, us: str, strength: float = 1.0) -> None:
        delta = {"punish": self.delta_punish, "reward": self.delta_reward}[us][self.e_mbon] * strength
        k = kc[self.e_kc]
        dW = -self.lr * delta * (k + self.recover_rate * (self.W - W_REST))   # recover_rate 1 = the published rule
        self.W = torch.clamp(self.W + dW, 0.0, self.w_max)

    def reset(self) -> None:
        self.W = torch.ones(self.n_edges)

    # -- closed forms (exact for recover_rate 1, lr*delta <= 1) ---------------------------------
    def calibrate_lr(self, kc: torch.Tensor, mask: torch.Tensor, target: float = HIGE_CHARGE_DROP,
                     us: str = "punish", strength: float = 1.0) -> float:
        """Set lr so that ONE pairing of `kc` drops the (response-weighted) drive of the MBONs in `mask` by
        `target`. After one pairing from W = 1 the drop at MBON j is lr*delta_j*S2_j/S1_j with
        S1 = sum e*k, S2 = sum e*k^2 (S2/S1 = 1 for a binary code)."""
        delta = {"punish": self.delta_punish, "reward": self.delta_reward}[us] * strength
        k = kc[self.e_kc]; ek = self.e_base * k
        S1, S2 = self._sum_to_mbon(ek), self._sum_to_mbon(ek * k)
        denom = float((delta[mask] * S2[mask]).sum()); dmax = float(delta[mask].max()) if bool(mask.any()) else 0.0
        if denom == 0.0 or dmax == 0.0:
            raise ValueError("calibrate_lr: no reinforcement reaches the masked compartment (delta[mask] all zero); "
                             "check the punish/reward DAN selection and the mask")
        lr = target * float(S1[mask].sum()) / denom
        cap = 1.0 / dmax                                  # lr*delta > 1 makes the rule overshoot and oscillate: never exceed it
        self.lr_capped = lr > cap
        self.lr = min(lr, cap)
        return self.lr

    def analytic_drop(self, kc_train: torch.Tensor, kc_probe: torch.Tensor, mask: torch.Tensor, p: int,
                      us: str = "punish", strength: float = 1.0) -> float:
        """Published rule, p pairings of kc_train, then probe with kc_probe: drop over `mask` =
        sum_j S12_j (1 - (1 - lr delta_j)^p) / sum_j S1_j, S12 = sum e*k_probe*k_train."""
        delta = {"punish": self.delta_punish, "reward": self.delta_reward}[us] * strength
        kt, kp = kc_train[self.e_kc], kc_probe[self.e_kc]
        S1, S12 = self._sum_to_mbon(self.e_base * kp), self._sum_to_mbon(self.e_base * kp * kt)
        f = 1 - (1 - self.lr * delta).clamp(0.0, 1.0) ** p
        return float((S12[mask] * f[mask]).sum() / S1[mask].sum())

    def overlap(self, kc_train: torch.Tensor, kc_probe: torch.Tensor, mask: torch.Tensor) -> float:
        """Fraction of the probe odour's drive onto `mask` that passes through synapses of KCs active for the
        trained odour (the wiring quantity that sets cross-odour generalisation)."""
        kt, kp = kc_train[self.e_kc], kc_probe[self.e_kc]
        S1, S12 = self._sum_to_mbon(self.e_base * kp), self._sum_to_mbon(self.e_base * kp * kt)
        return float(S12[mask].sum() / S1[mask].sum())


def drop(before: torch.Tensor, after: torch.Tensor, mask: torch.Tensor) -> float:
    """Response-weighted fractional drop over the MBONs in `mask` (silent MBONs carry no weight)."""
    sb = float(before[mask].sum())
    return float(1 - after[mask].sum() / sb) if sb > 0 else float("nan")


def json_safe(o):
    """Replace non-finite floats with None so every output is strict JSON (a masked compartment with no drive
    gives a nan drop, e.g. the dopamine-map shuffle on the visual pathway)."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [json_safe(v) for v in o]
    return o


def per_type(before: torch.Tensor, after: torch.Tensor, mb: MushroomBody, top: int = 8) -> dict:
    """Drop per MBON type plus each type's share of the total lost drive."""
    lost = (before - after); total = float(lost.sum())
    rows = []
    for tp in sorted(set(mb.mbon_type)):
        mk = mb.type_mask(tp); b = float(before[mk].sum())
        if b > 0:
            rows.append((tp, round(1 - float(after[mk].sum()) / b, 4), round(float(lost[mk].sum()) / total, 4) if total else None))
    rows.sort(key=lambda r: -(r[2] or 0))
    return {tp: {"drop": d, "share_of_total_depression": s} for tp, d, s in rows[:top]}

