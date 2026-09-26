#!/usr/bin/env python3
"""Export the data the Kenyon website needs, computed by the real kenyon code.

The website runs the feedforward mushroom body of sections 1 and 2 of docs/RESULTS.md in the browser. This script
writes everything that engine needs, and the golden fixtures it must reproduce:

  web/public/data/circuit.json   every cell the feedforward circuit uses (projection neurons, visual projection
                                 neurons, Kenyon cells, MBONs, PPL1/PAM dopamine neurons, APL) with its soma
                                 position, the PN->KC, VPN->KC, KC->MBON and DAN->MBON synapse counts as sparse
                                 arrays, and the model constants, each labelled with where it comes from
  web/public/data/fixtures.json  golden scenarios run through kenyon.model.mushroom_body.MushroomBody (torch,
                                 float32): the exact Kenyon-cell sets, MBON drives before and after, the drop at
                                 MBON11 and the choices, for exact-parity tests of the browser engine
  web/public/data/manifest.json  provenance (input hashes, wiring build), sizes and hashes of the two files above,
                                 and the checks this script ran

Run from anywhere, with the data in place (README, "How to run it"); nothing under $KENYON_DATA or $KENYON_OUT
is written:

    python web/scripts/export_web_data.py                 # writes web/public/data/
    python web/scripts/export_web_data.py --crosscheck    # also re-runs the result modules and compares with results/

Inputs: $KENYON_OUT/mb/mb_wiring.npz (the circuit), $KENYON_OUT/graph/neurons.parquet (MBON transmitters), and
$KENYON_DATA/malecns_v1/ body-annotations-...feather (soma positions, cell identity) and connectome-weights-...
feather (only to prove that the cell order recovered from the annotations is the order the wiring cache used).

The wiring cache stores body IDs only for the Kenyon cells, so every other population is recovered by repeating
mb_build.py's selection on the annotations, and then proved by rebuilding every cached submatrix from the weights
table in that order and requiring exact equality. A position is never attached to a cell without that proof.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import time
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import pandas as pd  # noqa: E402
import torch  # noqa: E402
from scipy import sparse  # noqa: E402

from kenyon import MALECNS_DIR, OUT_DIR  # noqa: E402
from kenyon.experiments.behaviour import build_valence  # noqa: E402
from kenyon.model.mushroom_body import HIGE_CHARGE_DROP, W_REST, MushroomBody, drop, is_olfactory_pn  # noqa: E402

ANN_FILE = "body-annotations-male-cns-v1.0-minconf-0.5.feather"
WEIGHTS_FILE = "connectome-weights-male-cns-v1.0-minconf-0.5.feather"

# the settings every result in sections 1 and 2 uses (olfactory.py / behaviour.py defaults with --binary-code)
SPARSITY, LR0, W_MAX, SEED, RECOVER = 0.05, 0.9, 2.0, 0, 1.0
PUNISH, REWARD = ("PPL101",), ("PAM",)
GLOM_PER_ODOUR = 6
BETAS = [1, 2, 4, 8, 11, 16, 32]            # behaviour.py's sweep plus 11, the gain the walkthrough and video use
LETTERS = "ABCDEFGH"


# ------------------------------------------------------------------------------------------------ small helpers
def f32(x) -> float | None:
    """A float32 result as a decimal that round-trips to the same float32 (9 significant digits always do)."""
    x = float(x)
    return float(f"{x:.9g}") if math.isfinite(x) else None


def vec(t) -> list:
    """A float32 vector; integer-valued entries (every untrained drive) are written as integers."""
    a = np.asarray(t.detach().numpy() if isinstance(t, torch.Tensor) else t, dtype=np.float64)
    if np.all(a == np.round(a)) and np.all(np.abs(a) < 2 ** 31):
        return [int(v) for v in a]
    return [f32(v) for v in a]


def ints(a) -> list:
    return [int(v) for v in np.asarray(a).ravel()]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def greek(comp: str | None) -> str | None:
    """MaleCNS instance compartment text (y5B'2a, y1pedc>a/B, b'2d) -> Greek label (γ5β'2a, γ1pedc>α/β, β'2d).
    y/a/B/b name a lobe when a prime or a digit follows, or when they stand alone between >, <, / and the ends;
    otherwise the letter is a sub-compartment (the final a of β'2a) or part of a word (calyx)."""
    if comp is None:
        return None
    head, sep, tail = comp.partition("_")                        # "B'2mp_bilateral": only convert the part before _
    out, lob = [], {"y": "γ", "a": "α", "B": "β", "b": "β"}
    for i, ch in enumerate(head):
        nxt = head[i + 1] if i + 1 < len(head) else ""
        prv = head[i - 1] if i > 0 else ""
        alone = (prv in "><" or prv == "/") and (nxt in ("", "/", ">", "<"))
        out.append(lob[ch] if ch in lob and (nxt == "'" or nxt.isdigit() or alone) else ch)
    return "".join(out) + sep + tail


def compartment_of(instance) -> str | None:
    m = re.search(r"\(([^)]*)\)", str(instance)) if isinstance(instance, str) else None
    return m.group(1) if m else None


# ---------------------------------------------------------------------------- cell identity and soma positions
def load_annotations(path: Path) -> pd.DataFrame:
    import pyarrow.feather as feather
    cols = ["bodyId", "type", "instance", "superclass", "somaSide", "somaLocation", "tosomaLocation"]
    a = feather.read_table(path, columns=cols).to_pandas()
    a["type"] = a["type"].fillna("").astype(str)                  # exactly as mb_build.py
    a["superclass"] = a["superclass"].fillna("").astype(str)
    return a


def recover_populations(ann: pd.DataFrame) -> dict:
    """Repeat mb_build.py's selections (same rules, same annotation row order)."""
    by = ann.set_index("bodyId")
    t = ann["type"]
    pop = {"kc": ann.bodyId[t.str.startswith("KC")].to_numpy(),
           "mbon": ann.bodyId[t.str.startswith("MBON")].to_numpy(),
           "pn": ann.bodyId[t.map(is_olfactory_pn)].to_numpy(),
           "vpn_all": ann.bodyId[ann.superclass == "visual_projection"].to_numpy(),
           "apl": ann.bodyId[t.str.startswith("APL")].to_numpy()}
    pop["dan"] = np.concatenate([ann.bodyId[t.str.startswith("PPL1")].to_numpy(), ann.bodyId[t.str.startswith("PAM")].to_numpy()])
    pop["type"] = lambda ids: by["type"].reindex(ids).fillna("").astype(str).to_numpy()
    return pop


def verify_order(weights: Path, pop: dict, z) -> dict:
    """Rebuild every cached submatrix from the weights table in the recovered cell order; exact equality proves
    the order (a swapped pair of cells would move their rows or columns). Also yields the VPN order, which
    mb_build.py filtered by 'reaches any Kenyon cell'."""
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.feather as feather
    t0 = time.time()
    tbl = feather.read_table(weights, columns=["body_pre", "body_post", "weight"])
    n_rows = tbl.num_rows
    pre_ids = np.unique(np.concatenate([pop[k] for k in ("pn", "vpn_all", "kc", "dan", "apl")]))
    post_ids = np.unique(np.concatenate([pop[k] for k in ("kc", "mbon", "apl")]))
    m = pc.and_(pc.is_in(tbl["body_pre"], value_set=pa.array(pre_ids)), pc.is_in(tbl["body_post"], value_set=pa.array(post_ids)))
    w = tbl.filter(m).to_pandas(); del tbl

    def submat(pre, post):                                          # mb_build.py's submat, verbatim
        s = w[w.body_post.isin(set(post)) & w.body_pre.isin(set(pre))]
        pi = {b: i for i, b in enumerate(pre)}; qi = {b: i for i, b in enumerate(post)}
        return sparse.csr_matrix((s.weight.to_numpy(float), ([qi[b] for b in s.body_post], [pi[b] for b in s.body_pre])),
                                 shape=(len(post), len(pre)))

    def same(A, B) -> bool:
        A, B = sparse.csr_matrix(A), sparse.csr_matrix(B)
        return A.shape == B.shape and (A != B).nnz == 0

    kc, mbon, pn, dan, apl = pop["kc"], pop["mbon"], pop["pn"], pop["dan"], pop["apl"]
    W_vk_all = submat(pop["vpn_all"], kc)
    conn = np.flatnonzero(np.asarray((W_vk_all > 0).sum(0)).ravel() > 0)
    vpn = pop["vpn_all"][conn]
    cache = {"pk": sparse.csr_matrix((z["pk_data"], z["pk_indices"], z["pk_indptr"]), shape=tuple(z["pk_shape"])),
             "vk": sparse.csr_matrix((z["vk_data"], z["vk_indices"], z["vk_indptr"]), shape=tuple(z["vk_shape"])),
             "km": sparse.coo_matrix((z["km_data"], (z["km_row"], z["km_col"])), shape=tuple(z["km_shape"]))}
    checks = {"pn_kc": same(submat(pn, kc), cache["pk"]),
              "vpn_kc": same(W_vk_all[:, conn], cache["vk"]),
              "kc_mbon": same(submat(kc, mbon), cache["km"]),
              "dan_mbon": same(submat(dan, mbon), z["dan_mbon"]),
              "kc_apl": same(submat(kc, apl), z["kc_apl"]),
              "apl_kc": same(submat(apl, kc), z["apl_kc"])}
    return {"vpn": vpn, "checks": checks, "weights_rows_read": int(n_rows), "seconds": round(time.time() - t0, 1)}


def soma_positions(ann: pd.DataFrame, body: np.ndarray, population_mean: np.ndarray | None = None):
    """Per cell: (x, y, z) in MaleCNS voxels and a flag. 0 = the annotation's somaLocation; 1 = its
    tosomaLocation (a scanned point on the neurite toward a soma the reconstruction does not include);
    2 = mean soma of the other cells of the same type on the same side; 3 = mean soma of the same type;
    4 = mean soma of the population. Flags 2 to 4 are stand-ins for display, not scanned positions."""
    ok = lambda v: v is not None and not isinstance(v, float) and len(v) == 3
    good = ann[ann.somaLocation.map(ok)]
    xyz_good = np.array([list(v) for v in good.somaLocation], float)
    g = pd.DataFrame(xyz_good, columns=["x", "y", "z"]).assign(type=good["type"].to_numpy(), side=good["somaSide"].fillna("").to_numpy())
    by_ts = g.groupby(["type", "side"])[["x", "y", "z"]].mean(); by_t = g.groupby("type")[["x", "y", "z"]].mean()
    rows = ann.set_index("bodyId").reindex(body)
    pos, flag = np.zeros((len(body), 3)), np.zeros(len(body), np.int8)
    for i, (_, r) in enumerate(rows.iterrows()):
        side = r["somaSide"] if isinstance(r["somaSide"], str) else ""
        if ok(r["somaLocation"]):
            pos[i], flag[i] = list(r["somaLocation"]), 0
        elif ok(r["tosomaLocation"]):
            pos[i], flag[i] = list(r["tosomaLocation"]), 1
        elif (r["type"], side) in by_ts.index:
            pos[i], flag[i] = by_ts.loc[(r["type"], side)].to_numpy(), 2
        elif r["type"] in by_t.index:
            pos[i], flag[i] = by_t.loc[r["type"]].to_numpy(), 3
        else:
            flag[i] = 4
    if (flag == 4).any():
        pos[flag == 4] = pos[flag == 0].mean(0) if (flag == 0).any() else population_mean
    return np.round(pos).astype(np.int64), flag


def axis_evidence(ann: pd.DataFrame) -> dict:
    """Measure what each MaleCNS axis means from annotated cells, instead of assuming it."""
    ok = ann.somaLocation.map(lambda v: v is not None and not isinstance(v, float) and len(v) == 3)
    a = ann[ok]; xyz = np.array([list(v) for v in a.somaLocation], float)
    d = pd.DataFrame(xyz, columns=["x", "y", "z"]).assign(side=a["somaSide"].fillna("").to_numpy(), sc=a["superclass"].to_numpy(),
                                                          type=a["type"].to_numpy())
    mean = lambda m, c: round(float(d.loc[m, c].mean()), 1)
    vnc = d.sc.str.startswith("vnc_")
    brain = d.sc.str.startswith(("cb_", "ol_", "visual_"))
    ev = {"x_mean_somaSide_L": mean(d.side == "L", "x"), "x_mean_somaSide_R": mean(d.side == "R", "x"),
          "y_mean_KC_somata": mean(d.type.str.startswith("KC"), "y"), "y_mean_olfactory_PN_somata": mean(d.type.map(is_olfactory_pn), "y"),
          "y_mean_brain_superclasses": mean(brain, "y"), "y_mean_vnc_superclasses": mean(vnc, "y"),
          "z_mean_PAM_somata": mean(d.type.str.startswith("PAM"), "z"), "z_mean_PPL1_somata": mean(d.type.str.startswith("PPL1"), "z"),
          "z_mean_brain_superclasses": mean(brain, "z"), "z_mean_vnc_superclasses": mean(vnc, "z"),
          "bbox_min_all_somata": [int(v) for v in xyz.min(0)], "bbox_max_all_somata": [int(v) for v in xyz.max(0)]}
    ev["x_increases_toward_fly_left"] = ev["x_mean_somaSide_L"] > ev["x_mean_somaSide_R"]
    ev["y_increases_dorsal_to_ventral"] = ev["y_mean_KC_somata"] < ev["y_mean_olfactory_PN_somata"] and ev["y_mean_brain_superclasses"] < ev["y_mean_vnc_superclasses"]
    ev["z_increases_anterior_to_posterior"] = ev["z_mean_PAM_somata"] < ev["z_mean_PPL1_somata"]
    return ev


# ---------------------------------------------------------------------------------------------- circuit export
def build_circuit(z, ann, pop, vpn, neurons: Path, wiring: Path) -> tuple[dict, dict]:
    t = pop["type"]
    mb = make_mb(wiring, neurons)                                  # the real model: its deltas, k and tiebreak are exported
    mbv = make_mb(wiring, neurons, modality="visual")
    val, counts = build_valence(mb, neurons)

    kc_type = np.array([str(x) for x in z["kc_type"]]); mbon_type = np.array([str(x) for x in z["mbon_type"]])
    dan_type = np.array([str(x) for x in z["dan_type"]]); opn_glom = np.array([str(x) for x in z["opn_glom"]])
    vpn_type = np.array([str(x) for x in z["vpn_type"]])
    # the recovered order must reproduce every cached label, not just the matrices
    assert np.array_equal(pop["kc"], z["kc_body"]), "Kenyon-cell body order differs from the cache"
    assert np.array_equal(t(pop["kc"]), kc_type) and np.array_equal(t(pop["mbon"]), mbon_type) and np.array_equal(t(pop["dan"]), dan_type)
    assert np.array_equal(np.array([s.split("_")[0] for s in t(pop["pn"])]), opn_glom)
    assert np.array_equal(t(vpn), vpn_type)
    assert mb.glom_names == sorted(set(opn_glom.tolist())) and mbv.channel_names == sorted(set(vpn_type.tolist()))

    by = ann.set_index("bodyId")
    side = lambda ids: [s if isinstance(s, str) else "" for s in by["somaSide"].reindex(ids)]
    inst = lambda ids: [s if isinstance(s, str) else "" for s in by["instance"].reindex(ids)]
    positions, fallback = {}, {}
    for name, ids in (("pn", pop["pn"]), ("vpn", vpn), ("kc", pop["kc"]), ("mbon", pop["mbon"]), ("dan", pop["dan"]), ("apl", pop["apl"])):
        p, fl = soma_positions(ann, ids)
        positions[name] = (p, fl)
        fallback[name] = {"n": int(len(ids)), "somaLocation": int((fl == 0).sum()), "tosomaLocation": int((fl == 1).sum()),
                          "type_side_mean": int((fl == 2).sum()), "type_mean": int((fl == 3).sum()), "population_mean": int((fl == 4).sum())}
    for ids in (pop["pn"], vpn, pop["kc"], pop["mbon"], pop["dan"], pop["apl"]):
        assert int(np.max(ids)) < 2 ** 53, "a body ID would lose precision in JavaScript"

    # CSR over KC rows for the inputs, CSR over MBON rows for the plastic synapses, in the model's own edge order
    pk = sparse.csr_matrix((z["pk_data"], z["pk_indices"], z["pk_indptr"]), shape=tuple(z["pk_shape"]))
    vk = sparse.csr_matrix((z["vk_data"], z["vk_indices"], z["vk_indptr"]), shape=tuple(z["vk_shape"]))
    km_row, km_col, km_data = np.asarray(z["km_row"]), np.asarray(z["km_col"]), np.asarray(z["km_data"])
    assert np.array_equal(km_row, mb.e_mbon.numpy()) and np.array_equal(km_col, mb.e_kc.numpy())
    assert np.all(np.diff(km_row) >= 0), "KC->MBON edges are not grouped by MBON; CSR would reorder the model's edges"
    for arr in (pk.data, vk.data, km_data, np.asarray(z["dan_mbon"])):
        assert np.all(arr == np.round(arr)) and np.all(arr >= 0), "synapse counts must be non-negative integers"
    km_indptr = np.searchsorted(km_row, np.arange(len(mbon_type) + 1)).astype(np.int64)
    dm = sparse.coo_matrix(np.asarray(z["dan_mbon"]))

    tb = np.asarray(mb._tiebreak)
    assert len(np.unique(tb)) == len(tb)
    tiebreak_rank = np.empty(len(tb), np.int64); tiebreak_rank[np.argsort(tb, kind="stable")] = np.arange(len(tb))

    kc_types = sorted(set(kc_type.tolist())); kc_type_idx = [kc_types.index(x) for x in kc_type]
    smell = (np.diff(pk.indptr) > 0).astype(int); vision = (np.diff(vk.indptr) > 0).astype(int)
    assert int(smell.sum()) == mb.n_drivable_kc and int(vision.sum()) == mbv.n_drivable_kc

    # transmitters: per cell as recorded, per type as build_valence reads them
    n = pd.read_parquet(neurons, columns=["bodyId", "consensus_nt"]).drop_duplicates("bodyId").set_index("bodyId")
    mbon_nt = [x if isinstance(x, str) else "" for x in n["consensus_nt"].reindex(pop["mbon"])]
    mbon_comp = [compartment_of(s) for s in inst(pop["mbon"])]
    dan_comp = [compartment_of(s) for s in inst(pop["dan"])]

    # which MBON types each DAN type reaches, by synapse count (the dopamine-to-compartment map, summarised)
    dan_targets = {}
    D = np.asarray(z["dan_mbon"])
    for tp in sorted(set(dan_type.tolist())):
        cols = dan_type == tp
        per = pd.Series(D[:, cols].sum(1), index=mbon_type).groupby(level=0).sum()
        per = per[per > 0].sort_values(ascending=False)
        dan_targets[tp] = [[k, int(v)] for k, v in per.items()]

    pos = lambda k: ints(positions[k][0]); flg = lambda k: ints(positions[k][1])
    m11 = [int(i) for i in np.flatnonzero(mb.type_mask("MBON11").numpy())]
    circuit = {
        "format": "kenyon-web-circuit/1",
        "what": "The feedforward mushroom body of docs/RESULTS.md sections 1 and 2, from the MaleCNS v1.0 connectome "
                "(minconf 0.5, no synapse threshold). A model of the wiring, not a recording of a fly.",
        "source": {"connectome": "MaleCNS v1.0 (HHMI Janelia Research Campus and Google Research), CC BY 4.0",
                   "wiring_cache": "mb_wiring.npz from kenyon/connectome/mb_build.py",
                   "wiring_build": {k: str(z[k]) for k in ("build_time", "build_source_sha") if k in z.files}},
        "coords": {"units": "MaleCNS voxels (integers, as in the annotation table's somaLocation)",
                   "axes": {"x": "fly right to fly left (x increases toward the fly's left)",
                            "y": "dorsal to ventral (y increases ventrally)",
                            "z": "anterior to posterior (z increases posteriorly; the ventral nerve cord lies at large z)"},
                   "front_view": "plot x to the right and y downward: the brain seen from the front, the fly's left on the viewer's right",
                   "normalisation": "none; positions are raw voxel coordinates",
                   "position_flag": {"0": "somaLocation (scanned soma)", "1": "tosomaLocation (scanned point on the neurite toward a missing soma)",
                                     "2": "stand-in: mean soma of the same type and side", "3": "stand-in: mean soma of the same type",
                                     "4": "stand-in: mean soma of the population"},
                   "fallback_counts": fallback},
        "constants": {
            "sparsity": {"value": SPARSITY, "status": "set by hand: top 5% of the drivable Kenyon cells fire (k-winners-take-all), a stand-in for APL inhibition"},
            "kwta_k": {"olfactory": int(max(1, round(SPARSITY * mb.n_drivable_kc))), "visual": int(max(1, round(SPARSITY * mbv.n_drivable_kc))),
                       "rule": "k = max(1, round(sparsity * n_drivable)); winners with zero drive are dropped"},
            "n_drivable_kc": {"olfactory": int(mb.n_drivable_kc), "visual": int(mbv.n_drivable_kc)},
            "binary_code": {"value": True, "status": "set by hand: a Kenyon cell fires (1) or not (0); the main condition of every result"},
            "odour_strength": 1.0, "channels_per_odour": GLOM_PER_ODOUR,
            "odour_status": "synthetic: six random glomeruli (or six visual projection types), the antennal lobe bypassed",
            "lr": {"value": LR0, "status": "CALIBRATION, not a result: set once so one pairing drops odour A's drive onto MBON11 by 0.90 "
                                            "(Hige et al. 2015). With a binary code the calibration returns 0.9 (to floating-point rounding) for any odour; "
                                            "each fixture records the exact value it used",
                   "target_drop": HIGE_CHARGE_DROP, "cap": "lr * max(delta in the compartment) <= 1"},
            "w_rest": W_REST, "w_init": 1.0, "w_min": 0.0, "w_max": W_MAX,
            "recover_rate": {"value": RECOVER, "status": "1 = the published rule (Gkanias et al. 2022). Lower values are a rule change; "
                                                        "they fix same-compartment coexistence but are not the published rule"},
            "rule": "dW = -lr * delta[mbon] * strength * (code[kc] + recover_rate * (W - w_rest)); W = clamp(W + dW, w_min, w_max)",
            "punish_dans": list(PUNISH), "reward_dans": list(REWARD),
            "delta_rule": "per MBON: sum of synapses from the chosen DAN types, averaged over the cells of that MBON type, divided by the maximum",
            "compartment_threshold": 0.5,
            "punish_compartment_types": sorted({mbon_type[i] for i in np.flatnonzero(mb.compartment_mask("punish").numpy())}),
            "reward_compartment_types": sorted({mbon_type[i] for i in np.flatnonzero(mb.compartment_mask("reward").numpy())}),
            "mbon11_index": m11,
            "valence": {"status": "rule of thumb (Aso et al. 2014): GABA or acetylcholine MBON = approach (+1), glutamate = avoid (-1)",
                        "counts": counts},
            "beta": {"values": BETAS, "tables": 8, "walkthrough_and_video": 11,
                     "status": "FITTED motor gain: one number, fitted so the T-maze index lands in the wild-type range (0.44 to 0.53 is met near 10 to 11)"},
            "choice": "score(X) = sum(valence * drive(X)) / N, N = mean over the odour set of sum(|drive|) on the untrained circuit; "
                      "P(X over Y) = 1 / (1 + exp(-beta * (score(X) - score(Y))))",
            "model_seed": {"value": SEED, "status": "seeds the fixed random order that breaks ties in the k-winners-take-all (kc.tiebreak_rank)"},
        },
        "glomeruli": list(mb.glom_names),
        "visual_channels": list(mbv.channel_names),
        "pn": {"n": int(len(pop["pn"])), "body": ints(pop["pn"]), "type": list(t(pop["pn"])),
               "glomerulus": [mb.glom_names.index(g) for g in opn_glom], "side": side(pop["pn"]), "pos": pos("pn"), "pos_flag": flg("pn")},
        "vpn": {"n": int(len(vpn)), "body": ints(vpn), "channel": [mbv.channel_names.index(x) for x in vpn_type],
                "side": side(vpn), "pos": pos("vpn"), "pos_flag": flg("vpn")},
        "kc": {"n": int(len(pop["kc"])), "body": ints(pop["kc"]), "type_names": kc_types, "type": kc_type_idx,
               "smell_drivable": ints(smell), "vision_drivable": ints(vision), "tiebreak_rank": ints(tiebreak_rank),
               "side": side(pop["kc"]), "pos": pos("kc"), "pos_flag": flg("kc")},
        "mbon": {"n": int(len(pop["mbon"])), "body": ints(pop["mbon"]), "type": mbon_type.tolist(), "instance": inst(pop["mbon"]),
                 "compartment": mbon_comp, "compartment_label": [greek(c) for c in mbon_comp], "side": side(pop["mbon"]),
                 "nt": mbon_nt, "valence": vec(val), "delta_punish": vec(mb.delta_punish), "delta_reward": vec(mb.delta_reward),
                 "input_from_kc": vec(np.asarray(mb._Wkm.tocsr().sum(axis=1)).ravel()),
                 "input_total_whole_connectome": vec(np.asarray(z["mbon_in_total"])) if "mbon_in_total" in z.files else None,
                 "pos": pos("mbon"), "pos_flag": flg("mbon")},
        "dan": {"n": int(len(pop["dan"])), "body": ints(pop["dan"]), "type": dan_type.tolist(),
                "family": ["PPL1" if x.startswith("PPL1") else "PAM" for x in dan_type],
                "instance": inst(pop["dan"]), "compartment": dan_comp, "compartment_label": [greek(c) for c in dan_comp],
                "is_punish": [int(any(x.startswith(p) for p in PUNISH)) for x in dan_type],
                "is_reward": [int(any(x.startswith(p) for p in REWARD)) for x in dan_type],
                "targets_by_type": dan_targets, "side": side(pop["dan"]), "pos": pos("dan"), "pos_flag": flg("dan")},
        "apl": {"n": int(len(pop["apl"])), "body": ints(pop["apl"]), "side": side(pop["apl"]), "pos": pos("apl"), "pos_flag": flg("apl"),
                "note": "shown for anatomy; the model replaces its feedback with the k-winners-take-all (RESULTS 4.5 tests the real loop)"},
        "weights": {
            "pn_kc": {"layout": "CSR, rows = Kenyon cells, columns = projection neurons; values = synapse counts",
                      "shape": [int(s) for s in pk.shape], "indptr": ints(pk.indptr), "indices": ints(pk.indices), "counts": ints(pk.data)},
            "vpn_kc": {"layout": "CSR, rows = Kenyon cells, columns = visual projection neurons; values = synapse counts",
                       "shape": [int(s) for s in vk.shape], "indptr": ints(vk.indptr), "indices": ints(vk.indices), "counts": ints(vk.data)},
            "kc_mbon": {"layout": "CSR, rows = MBONs, columns = Kenyon cells; values = synapse counts. Edge e (0..nnz-1) in this order is "
                                  "the model's plastic synapse e: one weight W[e] per entry",
                        "shape": [int(s) for s in z["km_shape"]], "indptr": ints(km_indptr), "kc": ints(km_col), "counts": ints(km_data)},
            "dan_mbon": {"layout": "COO, rows = MBONs, columns = DANs; values = synapse counts",
                         "shape": [int(s) for s in dm.shape], "mbon": ints(dm.row), "dan": ints(dm.col), "counts": ints(dm.data)},
        },
    }
    return circuit, {"mb": mb, "kc_type": kc_type}


# -------------------------------------------------------------------------------------------------- fixtures
def make_mb(wiring, neurons, modality="olfactory", sparsity=SPARSITY, shuffle=None, recover_rate=RECOVER):
    return MushroomBody(None, neurons, sparsity=sparsity, punish=PUNISH, reward=REWARD, lr=LR0, w_max=W_MAX, shuffle=shuffle,
                        seed=SEED, binary=True, recover_rate=recover_rate, wiring=wiring, modality=modality)


class Fixtures:
    def __init__(self, wiring: Path, neurons: Path, kc_type: np.ndarray):
        self.wiring, self.neurons, self.kc_type = wiring, neurons, kc_type
        base, vis = make_mb(wiring, neurons), make_mb(wiring, neurons, modality="visual")
        self.names = {"olfactory": list(base.glom_names), "visual": list(vis.channel_names)}
        self.lib, self.scenarios = {}, []

        def draw(n_ch, seed, n=8):
            rng = np.random.default_rng(seed)
            return [rng.choice(n_ch, size=GLOM_PER_ODOUR, replace=False) for _ in range(n)]
        # the seed-0 draws ARE odours A..H of olfactory.py / behaviour.py / demo.py / lesion.py --seed 0
        for L, o in zip(LETTERS, draw(len(base.glom_names), 0)):
            self.add(L, o, "olfactory", f"seed-0 draw, odour {L} of olfactory.py and behaviour.py --seed 0 (A to D are the walkthrough's and lesion.py's)")
        for L, o in zip(LETTERS, draw(len(base.glom_names), 1)):
            self.add(f"{L}_s1", o, "olfactory", f"seed-1 draw, odour {L} (a second, independent odour set)")
        for L, o in zip(LETTERS, draw(len(vis.channel_names), 0)):
            self.add(f"v{L}", o, "visual", f"seed-0 draw, visual object {L} of olfactory.py --modality visual --seed 0")
        A = [int(x) for x in self.lib["A"]["channels"]]; pool = [g for g in range(len(base.glom_names)) if g not in A]
        rng = np.random.default_rng(20260926)                        # the generalisation odours (olfactory.py's procedure)
        self.ladder = {}
        for s in (5, 4, 3, 1, 0):
            keep = list(rng.choice(A, size=s, replace=False)); new = list(rng.choice(pool, size=GLOM_PER_ODOUR - s, replace=False))
            self.add(f"A_share{s}", keep + new, "olfactory", f"shares {s} of odour A's 6 glomeruli")
        for s in (5, 4, 3, 1, 0):
            self.ladder[s] = [sorted(int(x) for x in list(rng.choice(A, size=s, replace=False)) + list(rng.choice(pool, size=GLOM_PER_ODOUR - s, replace=False)))
                              for _ in range(20)]
        rng = np.random.default_rng(20260927)                        # partial cues (recall.py's procedure)
        self.partial = {}
        for keep in (5, 4, 3, 2, 1):
            self.add(f"A_part{keep}", list(rng.choice(A, size=keep, replace=False)), "olfactory", f"{keep} of odour A's 6 glomeruli only (a partial cue)")
        for keep in (5, 4, 3, 2, 1):
            self.partial[keep] = [sorted(int(x) for x in rng.choice(A, size=keep, replace=False)) for _ in range(20)]

    def add(self, name, channels, modality, note):
        ch = sorted(int(x) for x in channels)
        self.lib[name] = {"modality": modality, "channels": ch, "names": [self.names[modality][c] for c in ch], "note": note}

    # -- one model per scenario, exactly as the experiment modules build it
    def model(self, modality="olfactory", sparsity=SPARSITY, shuffle=None, recover_rate=RECOVER):
        mb = make_mb(self.wiring, self.neurons, modality, sparsity, shuffle, recover_rate)
        val, _ = build_valence(mb, self.neurons)
        return mb, val

    def silence_mask(self, prefixes):
        if not prefixes:
            return None
        m = np.zeros(len(self.kc_type), bool)
        for p in prefixes:
            m |= np.char.startswith(self.kc_type.astype(str), p)
        return torch.as_tensor(m)

    def code(self, mb, name, silence=None):
        c = mb.kc_code(mb.odour(self.lib[name]["channels"]))
        if silence is not None:
            c = c.clone(); c[silence] = 0.0
        return c

    @staticmethod
    def w_summary(mb) -> dict:
        W = mb.W.numpy().astype(np.float64)
        return {"sum": float(W.sum()), "min": f32(W.min()), "max": f32(W.max()), "n_changed": int((W != 1.0).sum()),
                "n_below_0.99": int((W < 0.99).sum())}

    def lr_for(self, mb, codes, calibrate_on, lr_fixed, modality):
        if lr_fixed == "intact":                                     # lesion.py: calibrate once on the intact circuit, keep it
            im = make_mb(self.wiring, self.neurons, modality)
            mb.lr = im.calibrate_lr(self.code(im, calibrate_on), im.compartment_mask("punish"), HIGE_CHARGE_DROP, "punish")
            return
        mb.calibrate_lr(codes[calibrate_on], mb.compartment_mask("punish"), HIGE_CHARGE_DROP, "punish")

    def train_probe(self, sid, title, status, shows, train, probes, *, modality="olfactory", sparsity=SPARSITY, shuffle=None,
                    recover_rate=RECOVER, calibrate_on=None, lr_fixed=None, silence=(), checkpoints=None, pairs=(),
                    betas=(8, 11), closed_form=False, overlap_with=None, extra=None, refs=()):
        mb, val = self.model(modality, sparsity, shuffle, recover_rate)
        sil = self.silence_mask(silence)
        names = list(dict.fromkeys(list(probes) + [o for o, _, _ in train if o] + ([calibrate_on] if calibrate_on else [])))
        codes = {n: self.code(mb, n, sil) for n in names}
        calibrate_on = calibrate_on or next((o for o, _, _ in train if o), probes[0])
        self.lr_for(mb, codes, calibrate_on, lr_fixed, modality)
        m11, cp, cr = mb.type_mask("MBON11"), mb.compartment_mask("punish"), mb.compartment_mask("reward")
        mb.reset()
        before = {p: mb.mbon_response(codes[p]) for p in probes}
        B = torch.stack([before[p] for p in probes]); norm = float(B.abs().sum(1).mean())

        def scores(R):
            return (torch.stack([R[p] for p in probes]) * val).sum(1) / norm
        s0 = scores(before)
        ov_ref = overlap_with or next((o for o, _, _ in train if o), None)

        def pc(sx, sy, beta):
            return float(torch.sigmoid(beta * (sx - sy)))

        def snap(step, R):
            s = scores(R)
            ix = {p: i for i, p in enumerate(probes)}
            rec = {"after_steps": step,
                   "mbon_after": {p: vec(R[p]) for p in probes},
                   "drop_MBON11": {p: f32(drop(before[p], R[p], m11)) for p in probes},
                   "drop_punish_compartment": {p: f32(drop(before[p], R[p], cp)) for p in probes},
                   "drop_reward_compartment": {p: f32(drop(before[p], R[p], cr)) for p in probes},
                   "share_of_lost_drive_in_MBON11": {}, "scores_after": {p: f32(s[ix[p]]) for p in probes},
                   "choices": [{"x": x, "y": y, "beta": b, "P_before": f32(pc(s0[ix[x]], s0[ix[y]], b)), "P_after": f32(pc(s[ix[x]], s[ix[y]], b))}
                               for (x, y) in pairs for b in betas],
                   "W": self.w_summary(mb)}
            for p in probes:
                lost = before[p] - R[p]; tot = float(lost.sum())
                rec["share_of_lost_drive_in_MBON11"][p] = f32(float(lost[m11].sum()) / tot) if tot > 1e-6 else None
            if closed_form and ov_ref:
                rec["closed_form_MBON11"] = {p: f32(mb.analytic_drop(codes[ov_ref], codes[p], m11, step, "punish")) for p in probes}
            return rec

        steps = [(o, us, st) for o, us, st in train]
        cps = checkpoints or [len(steps)]
        records = []
        if 0 in cps:
            records.append(snap(0, {p: mb.mbon_response(codes[p]) for p in probes}))
        for i, (o, us, st) in enumerate(steps, 1):
            mb.reinforce(codes[o] if o else torch.zeros(mb.n_kc), us, st)
            if i in cps:
                records.append(snap(i, {p: mb.mbon_response(codes[p]) for p in probes}))
        sc = {"id": sid, "kind": "train_probe", "title": title, "status": status, "shows": shows,
              "model": {"modality": modality, "sparsity": sparsity, "k": int(max(1, round(sparsity * mb.n_drivable_kc))),
                        "binary": True, "recover_rate": recover_rate, "w_max": W_MAX, "seed": SEED,
                        "silenced_kc_type_prefixes": list(silence), "lr": mb.lr,
                        "lr_source": (f"calibrate_lr on odour {calibrate_on} in the INTACT circuit, then kept for the lesion (as lesion.py)"
                                      if lr_fixed == "intact" else f"calibrate_lr on odour {calibrate_on}, punish compartment, target 0.9")},
              "train": [{"odour": o, "us": us, "strength": st} for o, us, st in steps],
              "probes": list(probes), "norm_odours": list(probes), "norm": f32(norm),
              "kc": {p: ints(np.flatnonzero(codes[p].numpy() > 0)) for p in probes},
              "mbon_before": {p: vec(before[p]) for p in probes},
              "scores_before": {p: f32(s0[i]) for i, p in enumerate(probes)},
              "checkpoints": records}
        if shuffle == "dan_mbon":
            sc["model"]["delta_punish_override"] = vec(mb.delta_punish); sc["model"]["delta_reward_override"] = vec(mb.delta_reward)
            sc["model"]["note"] = "dopamine-to-MBON map shuffled across MBON types (MushroomBody shuffle='dan_mbon', seed 0); use these deltas"
            sc["model"]["punish_compartment_types"] = sorted({mb.mbon_type[i] for i in np.flatnonzero(cp.numpy())})
            sc["model"]["reward_compartment_types"] = sorted({mb.mbon_type[i] for i in np.flatnonzero(cr.numpy())})
        if ov_ref:
            sc["overlap_MBON11_with"] = ov_ref
            sc["overlap_MBON11"] = {p: f32(mb.overlap(codes[ov_ref], codes[p], m11)) for p in probes}
        if extra:
            sc.update(extra(mb, codes, m11))
        sc["refs"] = list(refs)
        self.scenarios.append(sc)
        return sc

    def tmaze(self, sid, title, status, shows, odours, *, betas=BETAS, shuffle=None, refs=()):
        """behaviour.py's reciprocal T-maze on the pair (odours[0], odours[1]), normalised over `odours`, mirrored line
        for line (behaviour.py lines 103-128); lr calibrated on odours[0] as behaviour.run does."""
        mb, val = self.model(shuffle=shuffle)
        cs = [self.code(mb, o) for o in odours]
        mb.calibrate_lr(cs[0], mb.compartment_mask("punish"), HIGE_CHARGE_DROP, "punish")
        mb.reset()
        R0 = torch.stack([mb.mbon_response(c) for c in cs]); nrm = float(R0.abs().sum(1).mean())

        def sc_(R):
            return (R * val).sum(1) / nrm

        def after(idx):
            mb.reset(); mb.reinforce(cs[idx], "punish", 1.0)
            return sc_(torch.stack([mb.mbon_response(c) for c in cs]))

        def p(sx, sy, beta):
            return float(torch.sigmoid(beta * (sx - sy)))
        s0, sA, sB = sc_(R0), after(0), after(1)
        by_beta = {}
        for beta in betas:
            h1 = p(sA[1], sA[0], beta) - p(sA[0], sA[1], beta)
            h2 = p(sB[0], sB[1], beta) - p(sB[1], sB[0], beta)
            by_beta[str(beta)] = {"PI": f32(0.5 * (h1 + h2)), "innate_bias_A_vs_B": f32(p(s0[0], s0[1], beta) - 0.5),
                                  "P_choose_punished_A_vs_B": f32(p(sA[0], sA[1], beta))}
        rec = {"id": sid, "kind": "tmaze", "title": title, "status": status, "shows": shows,
               "model": {"modality": "olfactory", "sparsity": SPARSITY, "k": int(max(1, round(SPARSITY * mb.n_drivable_kc))), "binary": True,
                         "recover_rate": RECOVER, "w_max": W_MAX, "seed": SEED, "lr": mb.lr,
                         "lr_source": f"calibrate_lr on odour {odours[0]}, punish compartment, target 0.9"},
               "pair": [odours[0], odours[1]], "norm_odours": list(odours), "norm": f32(nrm), "pairings": 1,
               "protocol": "reset, punish pair[0] once, score all norm_odours; reset, punish pair[1] once, score again. "
                           "PI = 0.5*[P(B>A) - P(A>B) | A punished] + 0.5*[P(A>B) - P(B>A) | B punished]",
               "scores_naive": {o: f32(s0[i]) for i, o in enumerate(odours)},
               "scores_after_punishing_pair0": {o: f32(sA[i]) for i, o in enumerate(odours)},
               "scores_after_punishing_pair1": {o: f32(sB[i]) for i, o in enumerate(odours)},
               "learned_score_shift": {"pair0": f32(s0[0] - sA[0]), "pair1": f32(s0[1] - sB[1])},
               "by_beta": by_beta, "refs": list(refs)}
        if shuffle == "dan_mbon":
            rec["model"]["delta_punish_override"] = vec(mb.delta_punish); rec["model"]["delta_reward_override"] = vec(mb.delta_reward)
            rec["model"]["note"] = "dopamine-to-MBON map shuffled across MBON types (MushroomBody shuffle='dan_mbon', seed 0); use these deltas"
        self.scenarios.append(rec)
        return rec


def ref(file, path, note=None):
    r = {"file": file, "field": path}
    if note:
        r["note"] = note
    return r


def build_fixtures(wiring: Path, neurons: Path, kc_type: np.ndarray) -> dict:
    F = Fixtures(wiring, neurons, kc_type)
    AH = list(LETTERS); AD = list("ABCD")
    P = lambda o: (o, "punish", 1.0)
    R = lambda o: (o, "reward", 1.0)
    CAL = "CALIBRATION (lr set so this is 0.90; not a result)"
    F.train_probe("S01_naive_codes", "Eight odours, no training", "wiring (PN->KC synapses) through a hand-set top-5% rule",
                  "Each odour lights its own sparse set of 188 Kenyon cells; codes overlap little.", [], AH, checkpoints=[0],
                  extra=lambda mb, codes, m11: {"kc_cosine_mean_offdiag": f32(_cos_offdiag([codes[p] for p in AH]))},
                  refs=[ref("results/olf5_binary.json", "kc_code.cross_odour_cos_mean", "same eight odours, same model")])
    F.train_probe("S02_punish_A_once", "Odour A paired once with punishment (PPL101)",
                  f"paired drop at MBON11: {CAL}. Unpaired drops, and where the lost drive lands: wiring",
                  "The memory stays with odour A and lands on MBON11.", [P("A")], AH, pairs=[("B", "A")],
                  refs=[ref("results/olf5_binary.json", "one_memory.paired_A_MBON11"), ref("results/olf5_binary.json", "one_memory.unpaired_MBON11_each"),
                        ref("results/olf5_binary.json", "one_memory.share_of_depression_in_MBON11")])
    F.train_probe("S03_punish_A_curve", "Odour A punished 1 to 8 times", "the rule's closed form 1-(1-lr*delta)^p for A (calibration and rule, not wiring); unpaired odours: wiring",
                  "More pairings, deeper memory; the unpaired odours follow their overlap with A.", [P("A")] * 8, AH,
                  checkpoints=list(range(1, 9)), closed_form=True,
                  refs=[ref("results/olf5_binary.json", "drop_vs_pairings_MBON11")])
    F.train_probe("S04_reward_C_once", "Odour C paired once with reward (PAM)", "wiring (the PAM compartments; reward is also a depression, Owald et al. 2015)",
                  "Reward lands in other compartments (MBON03, 05, 06), not on MBON11.", [R("C")], AH,
                  refs=[ref("results/olf5_binary.json", "reward_memory.paired_C_reward_compartments"), ref("results/olf5_binary.json", "reward_memory.paired_C_MBON11")])
    F.train_probe("S05_punish_A_reward_C", "A punished, then C rewarded", "wiring (different compartments); choice size from the fitted gain",
                  "Two memories in different compartments coexist, and the modelled choices order correctly.", [P("A"), R("C")], AH,
                  pairs=[("C", "A"), ("D", "A"), ("C", "D")],
                  refs=[ref("results/olf5_binary.json", "coexistence.different_compartments_A_punish_C_reward"),
                        ref("results/beh5_olf.json", "multi_memory_choices", "beta 8, normalised over A..H")])
    F.train_probe("S06_punish_A_then_B", "A punished, then B punished (same compartment)", "NEGATIVE, the published rule: the second memory overwrites the first",
                  "Real flies hold both; this rule keeps only a fraction of A's memory.", [P("A"), P("B")], AH,
                  refs=[ref("results/olf5_binary.json", "coexistence.same_compartment_blocked_A_then_B")])
    F.train_probe("S07_punish_A_then_B_no_recovery", "Same as S06 with the recovery term switched off", "RULE CHANGE (recover_rate 0), not the published rule",
                  "Turning the recovery term off keeps A's memory; this is a change to the rule, disclosed.", [P("A"), P("B")], AH, recover_rate=0.0)
    F.train_probe("S08_dopamine_alone", "Punishment dopamine with no odour", "identity of the rule (no Kenyon activity, W = 1: nothing changes)",
                  "Dopamine alone writes nothing.", [(None, "punish", 1.0)], AH, calibrate_on="A",
                  refs=[ref("results/olf5_binary.json", "dan_alone_no_KC_drop_A.value")])

    def ladder(mb, codes, m11):
        out = {}
        for s, reps in F.ladder.items():
            ds, ovs = [], []
            for ch in reps:
                c = mb.kc_code(mb.odour(ch))
                ds.append(drop(mb._sum_to_mbon(mb.e_base * c[mb.e_kc]), mb.mbon_response(c), m11))   # olfactory.py line 114
                ovs.append(mb.overlap(codes["A"], c, m11))
            out[f"shared_{s}_of_6"] = {"odours": reps, "drop_MBON11": [f32(x) for x in ds], "overlap_MBON11": [f32(x) for x in ovs],
                                       "mean_drop_MBON11": f32(np.mean(ds)), "mean_overlap_MBON11": f32(np.mean(ovs))}
        return {"ladder_20_per_level": out}
    F.train_probe("S09_generalisation_ladder", "A punished once; odours sharing 5, 4, 3, 1, 0 of its 6 glomeruli", "wiring (Kenyon-cell overlap)",
                  "The memory spreads to similar odours in proportion to shared Kenyon cells: drop = 0.9 x overlap.",
                  [P("A")], ["A", "A_share5", "A_share4", "A_share3", "A_share1", "A_share0"], extra=ladder,
                  refs=[ref("results/olf5_binary.json", "generalisation", "seed 0 of the module, its own 20 odours per level, so single values differ"),
                        ref("results/mb_seeds.json", "per_modality.olfactory.generalisation_drop_MBON11", "README: 0.60, 0.41, 0.29, 0.12, 0.05 (ten draws)")])

    def partial(mb, codes, m11):
        out = {}
        for keep, reps in F.partial.items():
            ds, ovs = [], []
            for ch in reps:
                c = mb.kc_code(mb.odour(ch))
                ds.append(drop(mb._sum_to_mbon(mb.e_base * c[mb.e_kc]), mb.mbon_response(c), m11))   # recall.py lines 41-48
                ovs.append(mb.overlap(codes["A"], c, m11))
            full = drop(mb._sum_to_mbon(mb.e_base * codes["A"][mb.e_kc]), mb.mbon_response(codes["A"]), m11)
            out[f"{keep}_of_6"] = {"odours": reps, "drop_MBON11": [f32(x) for x in ds], "overlap_MBON11": [f32(x) for x in ovs],
                                   "mean_drop_MBON11": f32(np.mean(ds)), "mean_recall_fraction": f32(np.mean(ds) / full),
                                   "mean_overlap_MBON11": f32(np.mean(ovs))}
        return {"partial_cue_20_per_level": out}
    F.train_probe("S10_partial_cue", "A punished once; tested with only part of A", "NEGATIVE: no pattern completion (forced by construction in this feedforward circuit)",
                  "Half an odour recalls about half the memory; recall = the partial cue's overlap with A, never completion.",
                  [P("A")], ["A", "A_part5", "A_part4", "A_part3", "A_part2", "A_part1"], extra=partial,
                  refs=[ref("results/recall.json", "partial_cue_by_glomeruli", "the module draws its own subsets; slope 0.83 in the README")])
    F.tmaze("S11_tmaze_A_B_8odours", "Reciprocal T-maze, A versus B, normalised over A..H",
            "sign and order: wiring; size: the fitted motor gain beta", "The punished odour is avoided; the index grows with beta.", AH,
            refs=[ref("results/beh5_olf.json", "tmaze_PI_by_beta", "betas 1, 2, 4, 8, 16, 32; 11 is extra here")])
    F.train_probe("S12_walkthrough_punish_A", "Walkthrough / lesion baseline: four odours, A punished once", f"paired drop: {CAL}; choice size: fitted beta",
                  "After one pairing the modelled choice avoids A (read through the valence rule of thumb, not the descending neurons).", [P("A")], AD, pairs=[("B", "A"), ("A", "B")],
                  refs=[ref("results/lesion.json", "lesions[lesion=none]", "memory_unpaired_MBON11 (mean over B, C, D), avoid_A_before/after = P(B over A) at beta 8")])
    F.train_probe("S13_walkthrough_punish_A_reward_C", "Walkthrough: A punished and C rewarded, four odours", "wiring (compartments); choice size: fitted beta",
                  "The modelled choices come out in the right order with no extra fitting.", [P("A"), R("C")], AD, pairs=[("C", "A"), ("D", "A"), ("C", "D")])
    F.tmaze("S14_tmaze_A_B_4odours", "Reciprocal T-maze, A versus B, normalised over A..D (the walkthrough's set; it uses beta 11)",
            "sign: wiring; size: fitted beta", "The walkthrough's performance index (its size is set by the fitted beta).", AD)
    F.tmaze("S15_control_shuffled_map_tmaze", "CONTROL: dopamine-to-MBON map shuffled", "the control that can fail, and does: the index collapses",
            "With the compartment map scrambled, punishment lands on MBON10 and the modelled avoidance nearly vanishes.", AH, shuffle="dan_mbon",
            refs=[ref("results/beh5_olf_shufdan.json", "tmaze_PI_by_beta", "README: 0.35 -> 0.02 at beta 8")])
    F.train_probe("S16_control_shuffled_map_multi", "CONTROL: shuffled map, A punished and C rewarded", "control (wiring removed)",
                  "Under the shuffle the rewarded odour's modelled choices invert (C over A and C over D); D over A barely moves.", [P("A"), R("C")], AH, shuffle="dan_mbon",
                  pairs=[("C", "A"), ("D", "A"), ("C", "D")], refs=[ref("results/beh5_olf_shufdan.json", "multi_memory_choices")])
    F.train_probe("S17_lesion_APL_dense_code", "Lesion: APL removed (every driven Kenyon cell fires)", "wiring test that can fail: the memory leaks (Lin et al. 2014)",
                  "Without sparse coding the memory spreads to other odours.", [P("A")], AD, sparsity=1.0, lr_fixed="intact", pairs=[("B", "A")], betas=(8,),
                  refs=[ref("results/lesion.json", "lesions[lesion=APL_disinhibited]")])
    F.train_probe("S18_lesion_KCgm_silenced", "Lesion: KCg-m Kenyon cells silenced", "wiring test that can fail: mild impairment (Aso et al. 2014)",
                  "Silencing the main gamma cells removes most of MBON11's drive to A but most of the modelled avoidance survives.",
                  [P("A")], AD, silence=("KCg-m",), lr_fixed="intact", pairs=[("B", "A")], betas=(8,),
                  refs=[ref("results/lesion.json", "lesions[lesion=KCg-m_silenced]")])
    VIS = [f"v{L}" for L in LETTERS]
    F.train_probe("S19_visual_punish_A", "Vision: object A punished once (visual projection neurons -> Kenyon cells)",
                  f"paired drop: {CAL}; unpaired: wiring (a 332-cell pool, so coarser than smell over many draws)",
                  "The same circuit learns a visual object.", [P("vA")], VIS, modality="visual",
                  refs=[ref("results/vis5_binary.json", "one_memory.unpaired_MBON11_each")])
    S1 = [f"{L}_s1" for L in LETTERS]
    F.train_probe("S20_second_odour_set_punish_A", "A second odour set, A punished once", f"paired drop: {CAL}; unpaired: wiring",
                  "Parity on odours the results files never used.", [P("A_s1")], S1, pairs=[("B_s1", "A_s1")])
    F.train_probe("S21_reward_C_then_punish_A", "C rewarded, then A punished (order swapped)", "rule order check (engine parity)",
                  "The rule is order dependent where compartments share dopamine; the engine must apply steps in order.", [R("C"), P("A")], AH,
                  pairs=[("C", "A"), ("D", "A"), ("C", "D")])
    return {"format": "kenyon-web-fixtures/1",
            "what": "Golden scenarios computed by kenyon.model.mushroom_body.MushroomBody (torch float32) on the MaleCNS wiring, "
                    "for exact-parity tests of the browser engine. Model outputs on the scanned wiring, not measurements from a fly.",
            "conventions": {
                "odour": "a list of channel indices into circuit.glomeruli (olfactory) or circuit.visual_channels (visual); every "
                         "projection neuron of each channel is set to 1",
                "train": "applied in order from the untrained circuit (W = 1 on every KC->MBON synapse); odour null = no Kenyon-cell activity",
                "kc": "sorted indices of the Kenyon cells that fire (binary code); must match exactly",
                "mbon_before / mbon_after": "drive onto each of the 97 MBONs (circuit.mbon order); before = W = 1",
                "drop_X": "1 - sum(after over the MBONs of X) / sum(before over them); null when X has no drive",
                "norm": "mean over norm_odours of sum(|mbon_before|)",
                "scores": "sum(valence * drive) / norm", "choices": "P(x over y) = sigmoid(beta * (score x - score y))",
                "floats": "float32 results printed with 9 significant digits; integers where the value is integral"},
            "odours": F.lib, "scenarios": F.scenarios}


def _cos_offdiag(codes) -> float:
    X = torch.stack(codes); Xn = X / (X.norm(dim=1, keepdim=True) + 1e-9); C = (Xn @ Xn.T).numpy()
    return float(C[~np.eye(len(codes), dtype=bool)].mean())


# ------------------------------------------------------------------------- an independent float64 engine
class RefEngine:
    """The engine the browser must implement, written from circuit.json alone in float64 NumPy (no torch, no
    kenyon import). Every fixture is replayed through it; the measured differences set the parity tolerance."""

    def __init__(self, c: dict):
        self.c = c
        w = c["weights"]
        self.pk = sparse.csr_matrix((np.array(w["pn_kc"]["counts"], float), w["pn_kc"]["indices"], w["pn_kc"]["indptr"]), shape=w["pn_kc"]["shape"])
        self.vk = sparse.csr_matrix((np.array(w["vpn_kc"]["counts"], float), w["vpn_kc"]["indices"], w["vpn_kc"]["indptr"]), shape=w["vpn_kc"]["shape"])
        km = w["kc_mbon"]; ip = np.array(km["indptr"])
        self.e_mbon = np.repeat(np.arange(len(ip) - 1), np.diff(ip)); self.e_kc = np.array(km["kc"]); self.e_n = np.array(km["counts"], float)
        self.rank = np.array(c["kc"]["tiebreak_rank"]); self.n_mbon = c["mbon"]["n"]
        self.val = np.array(c["mbon"]["valence"], float)
        self.types = np.array(c["kc"]["type_names"])[np.array(c["kc"]["type"])]
        self.m11 = np.zeros(self.n_mbon, bool); self.m11[c["constants"]["mbon11_index"]] = True
        self.pn_ch = np.array(c["pn"]["glomerulus"]); self.vpn_ch = np.array(c["vpn"]["channel"])

    def code(self, channels, modality, k, silence=()):
        ch = self.pn_ch if modality == "olfactory" else self.vpn_ch
        x = np.isin(ch, channels).astype(float)
        d = (self.pk if modality == "olfactory" else self.vk) @ x
        order = np.lexsort((self.rank, -d)); win = order[:k]; win = win[d[win] > 0]
        c = np.zeros(len(d)); c[win] = 1.0
        for p in silence:
            c[np.char.startswith(self.types.astype(str), p)] = 0.0
        return c

    def drive(self, W, code):
        return np.bincount(self.e_mbon, weights=self.e_n * W * code[self.e_kc], minlength=self.n_mbon)

    def reinforce(self, W, code, delta, lr, rr, s, wmax):
        return np.clip(W - lr * delta[self.e_mbon] * s * (code[self.e_kc] + rr * (W - 1.0)), 0.0, wmax)

    def masks(self, dp, dr):
        cp = dp >= 0.5; cr = dr >= 0.5
        return (cp if cp.any() else self.m11), (cr if cr.any() else self.m11)

    @staticmethod
    def drop(b, a, m):
        s = b[m].sum()
        return 1 - a[m].sum() / s if s > 0 else None


def replay(c: dict, fx: dict) -> dict:
    E = RefEngine(c)
    stats = {"kc_set_mismatches": 0, "kc_sets_checked": 0, "mbon_before_max_abs": 0.0, "mbon_after_max_rel": 0.0,
             "drop_max_abs": 0.0, "score_max_abs": 0.0, "P_max_abs": 0.0, "PI_max_abs": 0.0, "W_sum_max_rel": 0.0, "scenarios": 0}

    def upd(k, v):
        if v is not None and math.isfinite(v):
            stats[k] = max(stats[k], float(v))

    def dcmp(k, got, want):
        if want is None or got is None:
            if (want is None) != (got is None):
                stats.setdefault("null_mismatch", []).append(k)
            return
        upd(k, abs(got - want))
    lib = fx["odours"]
    for sc in fx["scenarios"]:
        m = sc["model"]; stats["scenarios"] += 1
        dp = np.array(m.get("delta_punish_override", c["mbon"]["delta_punish"]), float)
        dr = np.array(m.get("delta_reward_override", c["mbon"]["delta_reward"]), float)
        delta = {"punish": dp, "reward": dr}; cp, cr = E.masks(dp, dr)
        code = lambda name: E.code(lib[name]["channels"], m["modality"], m["k"], m.get("silenced_kc_type_prefixes", ()))
        if sc["kind"] == "train_probe":
            codes = {p: code(p) for p in list(sc["probes"]) + [st["odour"] for st in sc["train"] if st["odour"]]}
            for p in sc["probes"]:
                stats["kc_sets_checked"] += 1
                if list(np.flatnonzero(codes[p])) != sc["kc"][p]:
                    stats["kc_set_mismatches"] += 1
            W = np.ones(len(E.e_n)); before = {p: E.drive(W, codes[p]) for p in sc["probes"]}
            for p in sc["probes"]:
                upd("mbon_before_max_abs", np.max(np.abs(before[p] - np.array(sc["mbon_before"][p], float))))
            norm = np.mean([np.abs(before[p]).sum() for p in sc["probes"]])
            s0 = {p: float(E.val @ before[p] / norm) for p in sc["probes"]}
            cps = {r["after_steps"]: r for r in sc["checkpoints"]}
            steps = sc["train"]

            def check(r):
                after = {p: E.drive(W, codes[p]) for p in sc["probes"]}
                for p in sc["probes"]:
                    want = np.array(r["mbon_after"][p], float)
                    upd("mbon_after_max_rel", np.max(np.abs(after[p] - want)) / max(1.0, np.max(np.abs(want))))
                    dcmp("drop_max_abs", E.drop(before[p], after[p], E.m11), r["drop_MBON11"][p])
                    dcmp("drop_max_abs", E.drop(before[p], after[p], cp), r["drop_punish_compartment"][p])
                    dcmp("drop_max_abs", E.drop(before[p], after[p], cr), r["drop_reward_compartment"][p])
                    dcmp("score_max_abs", float(E.val @ after[p] / norm), r["scores_after"][p])
                for ch in r["choices"]:
                    s1 = {p: float(E.val @ after[p] / norm) for p in sc["probes"]}
                    sig = lambda z: 1 / (1 + math.exp(-z))
                    dcmp("P_max_abs", sig(ch["beta"] * (s0[ch["x"]] - s0[ch["y"]])), ch["P_before"])
                    dcmp("P_max_abs", sig(ch["beta"] * (s1[ch["x"]] - s1[ch["y"]])), ch["P_after"])
                upd("W_sum_max_rel", abs(W.sum() - r["W"]["sum"]) / max(1.0, abs(r["W"]["sum"])))
            if 0 in cps:
                check(cps[0])
            for i, st in enumerate(steps, 1):
                kc = codes[st["odour"]] if st["odour"] else np.zeros(len(E.rank))
                W = E.reinforce(W, kc, delta[st["us"]], m["lr"], m["recover_rate"], st["strength"], m["w_max"])
                if i in cps:
                    check(cps[i])
        else:                                                         # tmaze
            cs = [code(o) for o in sc["norm_odours"]]
            W1 = np.ones(len(E.e_n)); R0 = [E.drive(W1, x) for x in cs]; nrm = np.mean([np.abs(r).sum() for r in R0])
            s0 = np.array([E.val @ r / nrm for r in R0])

            def after(i):
                W = E.reinforce(np.ones(len(E.e_n)), cs[i], dp, m["lr"], m["recover_rate"], 1.0, m["w_max"])
                return np.array([E.val @ E.drive(W, x) / nrm for x in cs])
            sA, sB = after(0), after(1)
            sig = lambda z: 1 / (1 + math.exp(-z))
            for b, r in sc["by_beta"].items():
                b = float(b)
                h1 = sig(b * (sA[1] - sA[0])) - sig(b * (sA[0] - sA[1])); h2 = sig(b * (sB[0] - sB[1])) - sig(b * (sB[1] - sB[0]))
                dcmp("PI_max_abs", 0.5 * (h1 + h2), r["PI"])
                dcmp("P_max_abs", sig(b * (sA[0] - sA[1])), r["P_choose_punished_A_vs_B"])
    return stats


# ------------------------------------------------------------------ cross-check against the stored results
def crosscheck(wiring: Path, neurons: Path, fx: dict, ten_draws: int, m11_idx: list) -> dict:
    """Re-run the real result modules on this data and compare with results/*.json, then compare the fixtures'
    own numbers with the same files and with the README table."""
    from argparse import Namespace

    from kenyon.experiments import behaviour, lesion, olfactory, recall
    res_dir = REPO / "results"
    load = lambda f: json.loads((res_dir / f).read_text())
    rt = lambda d: json.loads(json.dumps(olfactory.json_safe(d)))

    def diff(a, b, path="", out=None, tol=0.0):
        out = [] if out is None else out
        if isinstance(a, dict) and isinstance(b, dict):
            for k in sorted(set(a) | set(b)):
                if k in ("elapsed_s", "note", "wiring_build"):
                    continue
                if k not in a or k not in b:
                    out.append(f"{path}.{k}: missing on one side")
                else:
                    diff(a[k], b[k], f"{path}.{k}", out, tol)
        elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
            for i, (x, y) in enumerate(zip(a, b)):
                diff(x, y, f"{path}[{i}]", out, tol)
        elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
            if abs(a - b) > tol:
                out.append(f"{path}: stored {b} rerun {a}")
        elif a != b:
            out.append(f"{path}: stored {b!r} rerun {a!r}")
        return out

    out, t0 = {}, time.time()
    argv = ["--binary-code", "--wiring", str(wiring), "--neurons", str(neurons)]
    o = rt(olfactory.run(olfactory.build_parser().parse_args(argv)))
    stored = load("olf5_binary.json")
    keys = ("circuit", "kc_code", "rule", "drop_vs_pairings_MBON11", "one_memory", "generalisation", "dan_alone_no_KC_drop_A",
            "reward_memory", "coexistence")
    d = diff({k: o[k] for k in keys}, {k: stored[k] for k in keys})
    out["olfactory_seed0_vs_olf5_binary"] = {"fields_compared": list(keys), "mismatches": d}
    ov = rt(olfactory.run(olfactory.build_parser().parse_args(argv + ["--modality", "visual"])))
    sv = load("vis5_binary.json")
    out["visual_seed0_vs_vis5_binary"] = {"mismatches": diff({k: ov[k] for k in keys}, {k: sv[k] for k in keys})}
    bargs = dict(subgraph=None, neurons=neurons, wiring=wiring, modality="olfactory", sparsity=0.05, odours=8, glom_per_odour=6,
                 pairings=1, lr="auto", target_drop=0.9, strength=1.0, recover_rate=1.0, w_max=2.0, binary_code=True, shuffle=None,
                 punish=["PPL101"], reward=["PAM"], betas=[1, 2, 4, 8, 16, 32], pi_seeds=10, seed=0)
    for name, shuffle, f in (("behaviour_seed0_vs_beh5_olf", None, "beh5_olf.json"), ("behaviour_shufdan_vs_beh5_olf_shufdan", "dan_mbon", "beh5_olf_shufdan.json")):
        b = rt(behaviour.run(Namespace(**{**bargs, "shuffle": shuffle}))); sb = load(f)
        k2 = ("tmaze_PI_by_beta", "multi_memory_choices", "tmaze_PI_over_seeds", "learned_score_shift_example_pair", "baseline_scores",
              "punish_compartment_types", "reward_compartment_types", "wiring_readout", "mbon_valence_counts")
        out[name] = {"mismatches": diff({k: b[k] for k in k2}, {k: sb[k] for k in k2})}
    r = rt(recall.run(Namespace(subgraph=None, neurons=neurons, wiring=wiring, glom_per_odour=6, pairings=1, target=0.9, reps=20, seed=0)))
    out["recall_vs_recall_json"] = {"mismatches": diff({k: r[k] for k in ("partial_cue_by_glomeruli", "recall_vs_cue_slope", "full_recall_MBON11")},
                                                       {k: load("recall.json")[k] for k in ("partial_cue_by_glomeruli", "recall_vs_cue_slope", "full_recall_MBON11")})}
    le = rt(lesion.run(Namespace(subgraph=None, neurons=neurons, wiring=wiring, pairings=1, target=0.9, beta=8.0, seed=0)))
    out["lesion_vs_lesion_json"] = {"mismatches": diff(le["lesions"], load("lesion.json")["lesions"])}

    # the ten-draw spread (seeds.py's olfactory half) from the real module
    if ten_draws:
        runs = [rt(olfactory.run(olfactory.build_parser().parse_args(argv + ["--seed", str(s)]))) for s in range(ten_draws)]
        from kenyon.experiments.seeds import METRICS, summarise
        summ = {k: summarise([f(x) for x in runs]) for k, f in METRICS.items()}
        summ["generalisation_drop_MBON11"] = {k: summarise([x["generalisation"][k]["drop_MBON11"] for x in runs]) for k in runs[0]["generalisation"]}
        st = load("mb_seeds.json")["per_modality"]["olfactory"]
        out[f"olfactory_{ten_draws}_draws_vs_mb_seeds"] = {"mismatches": diff(summ, {k: st[k] for k in summ}),
                                                           "rerun": {k: summ[k] for k in ("paired_A_MBON11", "unpaired_MBON11_mean", "share_of_depression_in_MBON11",
                                                                                          "same_compartment_A_retained_fraction", "coexist_A_punish_C_reward_A_MBON11",
                                                                                          "coexist_A_punish_C_reward_C_compartments")}
                                                           | {"ladder": {k: v["mean"] for k, v in summ["generalisation_drop_MBON11"].items()}}}

    # the fixtures' own numbers against the stored files and the README
    S = {s["id"]: s for s in fx["scenarios"]}
    last = lambda sid: S[sid]["checkpoints"][-1]
    olf = stored
    fxc = {}
    s2 = last("S02_punish_A_once")
    fxc["S02 paired drop A (calibrated)"] = {"fixture": s2["drop_MBON11"]["A"], "olf5_binary": olf["one_memory"]["paired_A_MBON11"], "README": 0.90}
    fxc["S02 unpaired drops B..H"] = {"fixture": [round(s2["drop_MBON11"][p], 4) for p in "BCDEFGH"], "olf5_binary": olf["one_memory"]["unpaired_MBON11_each"]}
    fxc["S02 unpaired mean"] = {"fixture": round(float(np.mean([s2["drop_MBON11"][p] for p in "BCDEFGH"])), 4),
                                "olf5_binary": olf["one_memory"]["unpaired_MBON11_mean"], "README_ten_draws": "0.09 +- 0.03 (seed-0 draw is 0.13)"}
    fxc["S02 share of lost drive on MBON11 (odour A)"] = {"fixture": s2["share_of_lost_drive_in_MBON11"]["A"], "olf5_binary": olf["one_memory"]["share_of_depression_in_MBON11"],
                                                          "README_ten_draws": "0.96 +- 0.01"}
    s5 = last("S05_punish_A_reward_C")
    fxc["S05 A at MBON11 / C in reward compartments"] = {"fixture": [s5["drop_MBON11"]["A"], s5["drop_reward_compartment"]["C"]],
                                                         "olf5_binary": [olf["coexistence"]["different_compartments_A_punish_C_reward"]["A_MBON11"],
                                                                         olf["coexistence"]["different_compartments_A_punish_C_reward"]["C_reward_compartments"]],
                                                         "README": "0.85 / 0.70 (ten draws)"}
    s6 = last("S06_punish_A_then_B")
    fxc["S06 A after B / B"] = {"fixture": [s6["drop_MBON11"]["A"], s6["drop_MBON11"]["B"]],
                                "olf5_binary": [olf["coexistence"]["same_compartment_blocked_A_then_B"]["A_after_B"], olf["coexistence"]["same_compartment_blocked_A_then_B"]["B"]],
                                "README": "A keeps 0.19 +- 0.06 of its memory (ten draws); seed-0 draw 0.17"}
    lad = S["S09_generalisation_ladder"]["ladder_20_per_level"]
    fxc["S09 ladder, fixture's own 20 odours per level (seed-0 odour A)"] = {
        "fixture": [lad[f"shared_{s}_of_6"]["mean_drop_MBON11"] for s in (5, 4, 3, 1, 0)],
        "olf5_binary_seed0": [olf["generalisation"][f"shared_{s}_of_6"]["drop_MBON11"] for s in (5, 4, 3, 1, 0)],
        "README_ten_draws": [0.60, 0.41, 0.29, 0.12, 0.05]}
    fxc["S09 single-odour ladder (one odour per level)"] = {"fixture": [last("S09_generalisation_ladder")["drop_MBON11"][f"A_share{s}"] for s in (5, 4, 3, 1, 0)],
                                                            "note": "one odour each; seed specific"}
    t11 = S["S11_tmaze_A_B_8odours"]["by_beta"]
    beh = load("beh5_olf.json")
    fxc["S11 T-maze PI by beta"] = {"fixture": {b: t11[b]["PI"] for b in ("1", "2", "4", "8", "16", "32")},
                                    "beh5_olf": {b: beh["tmaze_PI_by_beta"][b]["PI_trained"] for b in ("1", "2", "4", "8", "16", "32")},
                                    "README": "0.34 +- 0.03 at beta 8 over ten pairs; seed-0 pair 0.35"}
    t15 = S["S15_control_shuffled_map_tmaze"]["by_beta"]
    fxc["S15 shuffled-map PI at beta 8"] = {"fixture": t15["8"]["PI"], "beh5_olf_shufdan": load("beh5_olf_shufdan.json")["tmaze_PI_by_beta"]["8"]["PI_trained"],
                                            "README": "0.35 -> 0.02"}
    sv5 = last("S19_visual_punish_A")
    fxc["S19 visual unpaired drops"] = {"fixture": [round(sv5["drop_MBON11"][f"v{p}"], 4) for p in "BCDEFGH"], "vis5_binary": sv["one_memory"]["unpaired_MBON11_each"]}
    les = {x["lesion"]: x for x in load("lesion.json")["lesions"]}
    for sid, key in (("S12_walkthrough_punish_A", "none"), ("S17_lesion_APL_dense_code", "APL_disinhibited"), ("S18_lesion_KCgm_silenced", "KCg-m_silenced")):
        r_ = last(sid); ch = next(c for c in r_["choices"] if c["x"] == "B" and c["y"] == "A" and c["beta"] == 8)
        fxc[f"{sid} vs lesion.json[{key}]"] = {
            "fixture": {"unpaired_mean": round(float(np.mean([r_["drop_MBON11"][p] for p in "BCD"])), 4),
                        "mbon11_drive_to_A": sum(S[sid]["mbon_before"]["A"][i] for i in m11_idx),
                        "avoid_A_before": round(ch["P_before"], 4), "avoid_A_after": round(ch["P_after"], 4)},
            "lesion_json": {"unpaired_mean": les[key]["memory_unpaired_MBON11"], "mbon11_drive_to_A": les[key]["mbon11_drive_to_A"],
                            "avoid_A_before": les[key]["avoid_A_before"], "avoid_A_after": les[key]["avoid_A_after"]}}
    out["fixtures_vs_results"] = fxc
    out["seconds"] = round(time.time() - t0, 1)
    return out


# ------------------------------------------------------------------------------------------------------ main
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--wiring", type=Path, default=OUT_DIR / "mb" / "mb_wiring.npz")
    ap.add_argument("--neurons", type=Path, default=OUT_DIR / "graph" / "neurons.parquet")
    ap.add_argument("--data", type=Path, default=MALECNS_DIR)
    ap.add_argument("--out", type=Path, default=REPO / "web" / "public" / "data")
    ap.add_argument("--crosscheck", action="store_true", help="re-run the result modules and compare with results/*.json")
    ap.add_argument("--ten-draws", type=int, default=10, help="draws for the ten-draw cross-check (0 skips it)")
    ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args(argv)
    torch.set_num_threads(a.threads)
    t0 = time.time()
    z = np.load(a.wiring, allow_pickle=False)
    ann = load_annotations(a.data / ANN_FILE)
    pop = recover_populations(ann)
    vo = verify_order(a.data / WEIGHTS_FILE, pop, z)
    if not all(vo["checks"].values()):
        raise SystemExit(f"cell order check FAILED: {vo['checks']}")
    print(f"cell order proved against the weights table ({vo['weights_rows_read']:,} rows, {vo['seconds']} s): {vo['checks']}", flush=True)

    circuit, aux = build_circuit(z, ann, pop, vo["vpn"], a.neurons, a.wiring)
    ev = axis_evidence(ann)
    assert ev["x_increases_toward_fly_left"] and ev["y_increases_dorsal_to_ventral"] and ev["z_increases_anterior_to_posterior"], ev
    circuit["coords"]["axis_evidence"] = ev
    print("circuit built", flush=True)
    fx = build_fixtures(a.wiring, a.neurons, aux["kc_type"])
    print(f"fixtures built: {len(fx['scenarios'])} scenarios", flush=True)

    a.out.mkdir(parents=True, exist_ok=True)
    dump = lambda o: json.dumps(o, separators=(",", ":"), allow_nan=False, ensure_ascii=False)
    (a.out / "circuit.json").write_text(dump(circuit), encoding="utf-8")
    (a.out / "fixtures.json").write_text(dump(fx), encoding="utf-8")

    # replay the fixtures through the independent float64 engine, reading back the files just written
    c_back = json.loads((a.out / "circuit.json").read_text(encoding="utf-8")); f_back = json.loads((a.out / "fixtures.json").read_text(encoding="utf-8"))
    rs = replay(c_back, f_back)
    print("float64 reference engine vs torch fixtures:", rs, flush=True)
    if rs["kc_set_mismatches"] or rs.get("null_mismatch") or rs["drop_max_abs"] > 1e-5 or rs["P_max_abs"] > 1e-5 or rs["PI_max_abs"] > 1e-5:
        raise SystemExit("the float64 reference engine does not reproduce the fixtures; the spec or the export is wrong")

    manifest = {"format": "kenyon-web-manifest/1", "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "generator": "web/scripts/export_web_data.py",
                "inputs": {"mb_wiring.npz": {"sha256": sha256(a.wiring), "build": {k: str(z[k]) for k in ("build_time", "build_source_sha") if k in z.files}},
                           "neurons.parquet": {"sha256": sha256(a.neurons)},
                           ANN_FILE: {"sha256": sha256(a.data / ANN_FILE)}, WEIGHTS_FILE: {"sha256": sha256(a.data / WEIGHTS_FILE)}},
                "cell_order_check": {"method": "every cached submatrix rebuilt from the weights table in the recovered order; exact equality required",
                                     "checks": vo["checks"], "weights_rows_read": vo["weights_rows_read"]},
                "position_fallbacks": circuit["coords"]["fallback_counts"],
                "reference_engine_check": {"what": "fixtures replayed by an independent float64 NumPy engine that reads only circuit.json and fixtures.json",
                                           **rs, "suggested_js_tolerance": {"kc_sets": "exact", "drops_scores_P_PI": 1e-5, "mbon_drive_relative": 1e-5}}}
    sums = a.data / "SHA256SUMS"
    if sums.exists():
        rel = {ln.split()[1]: ln.split()[0] for ln in sums.read_text().splitlines() if len(ln.split()) == 2}
        for f in (ANN_FILE, WEIGHTS_FILE):
            manifest["inputs"][f]["matches_release_SHA256SUMS"] = rel.get(f) == manifest["inputs"][f]["sha256"]
    if a.crosscheck:
        manifest["crosscheck"] = crosscheck(a.wiring, a.neurons, fx, a.ten_draws, circuit["constants"]["mbon11_index"])
        print("crosscheck:", json.dumps({k: (len(v["mismatches"]) if isinstance(v, dict) and "mismatches" in v else "-") for k, v in manifest["crosscheck"].items()}), flush=True)
    manifest["files"] = {f: {"bytes": (a.out / f).stat().st_size, "sha256": sha256(a.out / f)} for f in ("circuit.json", "fixtures.json")}
    manifest["seconds"] = round(time.time() - t0, 1)
    (a.out / "manifest.json").write_text(json.dumps(manifest, indent=1, allow_nan=False, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(manifest["files"]), f"in {manifest['seconds']} s", flush=True)


if __name__ == "__main__":
    main()
