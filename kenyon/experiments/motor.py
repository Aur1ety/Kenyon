"""Does the memory produce a motor command? The descending-neuron test, on any graph, with matched controls.

Section 3.2 asked whether a learned memory changes the descending neurons (DNs), the only route from the brain to
the body, and found essentially nothing. That test ran on the weight-thresholded Doom graph, which drops three
quarters of the connectome's connections. It was also suspected that the operating point pinned cells at the rate
ceiling; this module measures that and rules it out for the DNs (none sit at the ceiling at rest). It repeats the
test on any graph (the unpruned one is the point) and fixes what an adversarial review found in its first version:

  * DNs are the dynamic cells whose superclass is "descending_neuron", not every type that starts with "DN" (that
    prefix also catches non-descending cells and misses MDN, pIP10 and the like); the 36-cell pre-registered
    readout set (the subgraph's is_output flag) is a subset and is reported on its own;
  * the learning rate is the feedforward model's (0.9, one Hige-calibrated pairing) and never exceeds the rule's
    valid ceiling 1/max(dose); an earlier version bisected toward a rate target the recurrent brain cannot reach,
    ran to lr 8 and so wiped every output cell PPL101 touches at all;
  * the dopamine dose per output cell comes from raw synapse counts pooled by cell type, as in the feedforward
    model, not from the core's log1p-compressed edge values, which flatten the difference between the real
    compartment and stray one-synapse contacts;
  * the control that matters is effect-matched: the same depression on the same active Kenyon cells, moved to random
    output cells. The older weight-space shuffle scatters it over all synapses, 95% of which belong to Kenyon cells
    that are silent during the test, so beating it only measures the sparseness of the code. It is kept, relabelled;
  * a second memory is written with the dose restricted to MBON11, so the effect can be attributed to that compartment;
  * changes for untouched odours are NOT a noise floor: the simulation is deterministic, and they are the same memory
    scaled by Kenyon-cell overlap. They are reported as generalisation, with the overlap and the pattern cosine;
  * size comes first and is absolute: change per DN, as a fraction of the cell's rate (the idle rate is softplus(0),
    so this is a convention, not physiology) and of the dynamic range, plus the left/right split: steering is carried
    by the right-minus-left difference, which a bilateral memory can produce only through left-right asymmetries of
    the wiring; every direct readout-cell -> DN contact in the graph is listed, because a weight threshold deletes them;
  * the odour-itself yardstick is the mushroom-body route only (the odour is injected at the Kenyon cells; the
    antennal-lobe to lateral-horn route is not driven), so the memory-over-odour ratio is reported, never used as a flag;
  * odour draws re-measure one fixed memory-to-DN transfer pattern on one graph: their spread is odour-draw
    variability, not the uncertainty of the claim. The cross-draw cosine of the DN pattern is reported to show it.

    python -m kenyon.experiments.motor --subgraph $KENYON_OUT/graph/subgraph_full.npz --device cpu \
        --out $KENYON_OUT/mb/motor2_full.json                      # about two hours per graph on a shared CPU
    python -m kenyon.experiments.motor --subgraph $KENYON_OUT/graph/subgraph_full.npz --anatomy-only
    python -m kenyon.experiments.motor --cells results/motor2_full.npz   # section 4.8's per-cell figures, seconds
"""
from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from pathlib import Path

import numpy as np
import torch

from kenyon import OUT_DIR
from kenyon.device import resolve_device
from kenyon.experiments.embed import present_with_kc
from kenyon.model.mushroom_body import MushroomBody, json_safe


def _sig(x, n: int = 4):
    """n significant figures (fixed decimals erase numbers of order 1e-5, which is what this module measures)."""
    return None if x is None else float(f"{float(x):.{n}g}")


def _ms(xs) -> dict:
    v = np.asarray([x for x in xs if x is not None], float)
    if not len(v):
        return {"mean": None, "sd": None, "min": None, "max": None, "n": 0}
    return {"mean": _sig(v.mean()), "sd": _sig(v.std(ddof=1)) if len(v) > 1 else None,
            "min": _sig(v.min()), "max": _sig(v.max()), "n": len(v)}


def _cos(x: torch.Tensor, y: torch.Tensor):
    d = float(x.norm() * y.norm()); return _sig(float((x * y).sum()) / d) if d > 0 else None


def count_template(core, plas, types: np.ndarray, dan_idx: np.ndarray) -> torch.Tensor:
    """Per-node dopamine dose (0..1) from RAW DAN -> MBON synapse counts, pooled over the hemispheric copies of each
    MBON type and normalised to max 1: the feedforward model's template (MushroomBody._dan_template)."""
    pre = core.pre_of_edge.cpu().numpy(); post = core.post_of_edge.cpu().numpy(); cnt = core.count.cpu().numpy()
    is_dan = np.zeros(core.n_nodes, bool); is_dan[dan_idx] = True
    sel = is_dan[pre]; raw = np.zeros(core.n_nodes); np.add.at(raw, post[sel], cnt[sel])
    d = np.zeros(core.n_nodes); mb = plas.mbon_idx; tp = types[mb]
    for t in np.unique(tp):
        idx = mb[tp == t]; d[idx] = raw[idx].mean()
    if d.max() > 0:
        d = d / d.max()
    return torch.as_tensor(d, device=plas.device, dtype=torch.float32)


def direct_contacts(sub: dict, types: np.ndarray, side: np.ndarray, src_nodes: np.ndarray, is_dn: np.ndarray) -> list:
    """Every direct connection from the readout cells onto a descending neuron in THIS graph (raw synapse counts).
    A weight-thresholded graph deletes the weak ones, which is how a one-sided effect can appear only when unpruned."""
    pre = np.asarray(sub["indices_pre"]); cnt = np.asarray(sub["weight"])
    post = np.repeat(np.arange(len(types)), np.diff(np.asarray(sub["indptr_post"])))
    sel = np.flatnonzero(np.isin(pre, src_nodes) & is_dn[post])
    rows = [{"DN_type": str(types[post[e]]), "DN_side": str(side[post[e]]), "from_side": str(side[pre[e]]), "synapses": int(cnt[e])} for e in sel]
    return sorted(rows, key=lambda r: -r["synapses"])


def verdict_text(o: dict) -> str:
    """The verdict is a pure function of the stored numbers, so a wording fix never needs a recomputation."""
    g, agg, rule, fl = o["graph"], o["aggregate"], o["rule"], o["flags"]
    rt = g.get("readout_type", "MBON11"); st = o["per_seed"][0]["state_dark_plus_trained_odour"]
    dc = o.get("direct_contacts_readout_type_to_DN"); cut = o.get("direct_contacts_cut") or {}
    contacts = "" if dc is None else (f" Direct {rt} -> DN contacts in this graph: {len(dc)} connections, {sum(r['synapses'] for r in dc)} synapses"
                                      + (f" (largest: {dc[0]['DN_type']} {dc[0]['DN_side']}, {dc[0]['synapses']})." if dc else "."))
    if cut.get("applied"):
        contacts += f" THOSE {cut['n_edges']} EDGES ({cut['synapses']} synapses) WERE SILENCED IN THIS RUN: compare against the intact graph."
    return (f"Graph {Path(g['path']).name}: {g['n_nodes']:,} nodes, {g['n_edges']:,} edges, {o['dn_selection']['n_DN']:,} descending neurons "
            f"(by superclass). Size first: one pairing at lr {rule['lr_used']} (dose from {rule['template']}) changes the pooled DN rate by "
            f"{agg['memory_pooled_L1']['mean']}; the largest single cell moves {agg['memory_max_abs_change']['mean']} = "
            f"{agg['memory_max_frac_of_own_rate']['mean']} of its rate; {agg['n_DN_gt_1pct']['mean']:.1f} DNs per draw move more than 1% and "
            f"{agg['n_DN_gt_5pct']['mean']:.1f} more than 5%. Material (>= 1% of DNs shifting by > 5%): "
            f"{'yes' if fl['material_at_least_1pct_of_DNs_shift_gt_5pct_of_rate'] else 'no'}. The {rt} rate drops "
            f"{agg['paired_drop_MBON11']['mean']} (unpaired {agg['unpaired_drop_MBON11']['mean']}); "
            f"{agg['share_of_depression_in_readout_type']['mean']} of the removed drive is in {rt}, and dosing {rt} alone reproduces "
            f"{agg['MBON11_only_share_of_full_memory']['mean']} of the DN change (pattern cosine {agg['MBON11_only_cos_with_full_memory']['mean']}). "
            f"Untouched odours change by {agg['untouched_pooled_L1']['mean']} (the same memory through Kenyon-cell overlap, not noise): "
            f"odour-specific {'yes' if fl['odour_specific_trained_gt_2x_untouched'] else 'no'}. The matched null (same cells, random output "
            f"cells) gives {agg['matched_null_pooled_L1']['mean']}, so memory/null = {fl['memory_over_matched_null_pooled']} before allowing for "
            f"the null removing a little less drive (see removed_drive_* per draw). The DN pattern is one fixed footprint across odour draws "
            f"(cosine {agg['cross_draw_cosine_of_DN_pattern']['mean']}) and is {agg['frac_DN_change_positive']['mean']} positive; its "
            f"right-minus-left part is {agg['right_minus_left_over_common']['mean']} of its common mode (a bilateral memory on a perfectly "
            f"left-right symmetric brain would give 0; the asymmetry is the wiring's, e.g. one-sided contacts, not a learned turn signal)."
            f"{contacts} For scale, the odour itself reaches the DNs through the mushroom-body route by only "
            f"{agg['odour_itself_MB_route_pooled_L1_vs_dark']['mean']} pooled (the lateral-horn route is not driven), and the memory is "
            f"{agg['memory_over_odour_MB_route']['mean']} of that. In the measured state {st['frac_DN_at_ceiling']} of DNs and "
            f"{st['frac_dynamic_at_ceiling']} of all dynamic cells sit at the rate ceiling.")


def cut_direct_edges(core, plas, sub: dict, src_nodes: np.ndarray, is_dn: np.ndarray) -> dict:
    """Causal test: silence every direct edge from `src_nodes` onto a descending neuron by setting its gain to 0.
    These are not plastic edges, so plas.apply_to_core() (run on every reset and write) never restores them."""
    pe = core.pre_of_edge.cpu().numpy(); po = core.post_of_edge.cpu().numpy()
    is_src = np.zeros(core.n_nodes, bool); is_src[src_nodes] = True
    e = np.flatnonzero(is_src[pe] & is_dn[po])
    plas._gain[torch.as_tensor(e, device=plas.device, dtype=torch.long)] = 0.0
    plas.apply_to_core()
    return {"applied": True, "n_edges": len(e), "synapses": int(np.asarray(sub["weight"])[e].sum())}


def cell_report(npz: Path, draw: int = 0, cells=(("DNp52", "L"), ("DNp62", "R")), named=("DNa02", "DNa03")) -> dict:
    """The per-cell figures of section 4.8, from the per-DN vectors a run saves next to its JSON (<out>.npz).

    For one odour draw: base = each DN's rate with the trained odour on the untrained brain, dark = the same with no
    odour, dA = what one pairing changes. The odour's own effect on a cell is base - dark, so after one pairing its
    odour response is base - dark + dA. Ranks are by |dA| over all DNs, rank 1 = the largest mover. The memory is
    measured against the cell's own rate (base), the odour against the no-odour rate (dark), as run() does."""
    z = np.load(npz, allow_pickle=False)
    key = f"s{draw}_"
    if key + "dA" not in z.files:
        have = sorted({k.split("_")[0] for k in z.files if k.startswith("s") and k.endswith("_dA")})
        raise ValueError(f"{Path(npz).name} has no draw {draw}; draws present: {have}")
    t = np.asarray(z["dn_type"]).astype(str); s = np.asarray(z["dn_side"]).astype(str)
    dA, base, dark = (np.asarray(z[key + k], np.float64) for k in ("dA", "base", "dark"))
    odour = base - dark
    frac = np.abs(dA) / np.maximum(base, 1e-6)
    odour_frac = np.abs(odour) / np.maximum(dark, 1e-6)
    order = np.argsort(-np.abs(dA), kind="stable")
    rank = np.empty(len(dA), int); rank[order] = np.arange(1, len(dA) + 1)
    med = float(np.median(np.abs(dA)))

    def cell(i: int) -> dict:
        return {"type": str(t[i]), "side": str(s[i]), "rank_by_abs_change": int(rank[i]),
                "memory_frac_of_own_rate": _sig(frac[i]),
                "times_median_cell": _sig(abs(dA[i]) / med) if med > 0 else None}

    picked = {}
    for ty, sd in cells:
        idx = np.flatnonzero((t == ty) & (s == sd))
        if len(idx):
            i = int(idx[0])
            picked[f"{ty}-{sd}"] = {**cell(i), "odour_effect_untrained": _sig(odour[i]),
                                    "odour_effect_after_one_pairing": _sig(odour[i] + dA[i]),
                                    "memory_over_odour": _sig(abs(dA[i]) / abs(odour[i])) if odour[i] != 0 else None}
    return {"npz": Path(npz).name, "draw": draw, "n_DN": int(len(dA)),
            "memory": {"median_frac_of_own_rate": _sig(np.median(frac)), "p95_frac_of_own_rate": _sig(np.quantile(frac, 0.95)),
                       "n_gt_half_pct_of_rate": int((frac > 0.005).sum()), "n_gt_1pct_of_rate": int((frac > 0.01).sum()),
                       "top": [cell(int(i)) for i in order[:4]]},
            "odour_itself": {"n_gt_1pct_of_no_odour_rate": int((odour_frac > 0.01).sum()),
                             "n_gt_5pct_of_no_odour_rate": int((odour_frac > 0.05).sum()),
                             "median_frac_of_no_odour_rate": _sig(np.median(odour_frac))},
            "frac_DN_where_memory_exceeds_odour": _sig(np.mean(np.abs(dA) > np.abs(odour))),
            "cells": picked,
            "named": {f"{t[i]}-{s[i]}": cell(int(i)) for i in np.flatnonzero(np.isin(t, list(named)))}}


def run(a) -> dict:
    device = resolve_device(a.device)
    import pandas as pd

    from kenyon.connectome.subgraph import OUTPUT_SUPERCLASS, norm_side
    from kenyon.model.core import ConnectomeCore, CoreConfig, load_subgraph
    from kenyon.model.gain import match_gain
    from kenyon.model.plasticity import MushroomBodyPlasticity, node_types

    t0 = time.time()
    sub = load_subgraph(a.subgraph)
    types = node_types(sub, a.neurons)
    ff = MushroomBody(a.subgraph, a.neurons, a.sparsity, tuple(a.punish), tuple(a.reward), a.lr, a.w_max,
                      None, a.seed, binary=True)                             # feedforward code, same node order as the core
    # cheap checks first: the slow part (gain matching) must not run on a mis-indexed circuit
    if not (np.array_equal(ff.kc, np.flatnonzero(np.char.startswith(types, "KC")))
            and np.array_equal(ff.mbon, np.flatnonzero(np.char.startswith(types, "MBON")))):
        raise ValueError("the feedforward circuit and the node-type table disagree on which nodes are KCs / MBONs")
    m11_local = np.flatnonzero(np.array([t == a.readout_type for t in ff.mbon_type]))
    if not len(m11_local):
        raise ValueError(f"no {a.readout_type} cells in this graph")
    # descending neurons = dynamic cells of superclass descending_neuron (the builder's D set), not the "DN" type
    # prefix; is_output is the 36-cell pre-registered readout, a subset, reported on its own
    body = np.asarray(sub["bodyId"]); ann = pd.read_parquet(a.neurons, columns=["bodyId", "superclass", "somaSide"])
    ann = ann.drop_duplicates("bodyId").set_index("bodyId").reindex(body)
    sc = ann["superclass"].fillna("").astype(str).to_numpy(); side = np.array([norm_side(s) for s in ann["somaSide"].to_numpy()])
    is_out = np.asarray(sub["is_output"], bool)
    dn_local = np.flatnonzero((sc == OUTPUT_SUPERCLASS) & ~np.asarray(sub["is_clamped"], bool))
    if len(dn_local) < 100:
        raise ValueError(f"only {len(dn_local)} descending neurons found by superclass; the annotation table does not match this graph")
    prefix = np.char.startswith(types.astype("U16"), "DN"); is_dn = np.zeros(len(types), bool); is_dn[dn_local] = True
    readout = torch.as_tensor(is_out[dn_local])
    dn_selection = {"n_DN": len(dn_local), "rule": f"dynamic nodes with superclass == {OUTPUT_SUPERCLASS}",
                    "n_readout_set": int(is_out.sum()), "n_readout_set_among_DN": int(is_out[dn_local].sum()),
                    "n_type_prefix_DN": int(prefix.sum()),
                    "prefix_DN_but_not_descending": dict(Counter(types[prefix & ~is_dn].tolist()).most_common(12)),
                    "descending_without_DN_prefix": dict(Counter(types[is_dn & ~prefix].tolist()).most_common(12))}
    dn_types = types[dn_local]; dn_side = side[dn_local]
    named = {n: np.flatnonzero(dn_types == n) for n in a.named_dns}
    bilateral = [(t, np.flatnonzero((dn_types == t) & (dn_side == "L")), np.flatnonzero((dn_types == t) & (dn_side == "R")))
                 for t in np.unique(dn_types) if t]
    bilateral = [(t, l, r) for t, l, r in bilateral if len(l) and len(r)]
    direct = direct_contacts(sub, types, side, ff.mbon[m11_local], is_dn)
    print(f"{len(dn_local)} descending neurons ({int(is_out[dn_local].sum())} in the readout set; type prefix 'DN' would give "
          f"{int(prefix.sum())}), {len(bilateral)} bilateral DN types, {len(m11_local)} {a.readout_type} cells, "
          f"{len(direct)} direct {a.readout_type} -> DN connections ({sum(r['synapses'] for r in direct)} synapses)", flush=True)
    if a.anatomy_only:
        return {"graph": {"path": Path(a.subgraph).name, "n_nodes": len(types), "n_edges": len(sub["weight"]), "readout_type": a.readout_type},
                "dn_selection": dn_selection, "direct_contacts_readout_type_to_DN": direct}

    core = ConnectomeCore(sub, CoreConfig(param="per_edge"), backend="spmm", device=device)
    for p in core.parameters():
        p.requires_grad_(False)
    gm = match_gain(core, g_star=a.g_star, op_point=a.op_point, seed=0)
    w0 = gm["w0"] * a.w0_scale
    core.set_w0(w0)
    plas = MushroomBodyPlasticity(core, types, lr=a.lr, w_max=a.w_max, device=device,
                                  punish_types=tuple(a.punish), reward_types=tuple(a.reward))
    assert np.array_equal(ff.kc, plas.kc_idx) and np.array_equal(ff.mbon, plas.mbon_idx)
    cut = {"applied": bool(a.cut_direct), "n_edges": 0, "synapses": 0}
    if a.cut_direct:                                                         # causal test: silence the direct readout -> DN edges
        cut = cut_direct_edges(core, plas, sub, ff.mbon[m11_local], is_dn)
        print(f"cut {cut['n_edges']} direct {a.readout_type} -> DN edges ({cut['synapses']} synapses)", flush=True)
    if a.template == "counts":
        plas.delta_punish = count_template(core, plas, types, plas.punish_idx)
    delta_full = plas.delta_punish.clone()
    is_m11 = torch.as_tensor(types == a.readout_type, device=device)
    delta_m11 = delta_full * is_m11                                          # the same rule, dose only where MBON11 is
    kc_nodes = torch.as_tensor(ff.kc, device=device, dtype=torch.long)
    dn_nodes = torch.as_tensor(dn_local, device=device, dtype=torch.long)
    r_max = core.cfg.r_max; dyn = core.dyn_idx.cpu()

    def measure(code, full: bool = False):
        r = present_with_kc(core, kc_nodes, code * a.kc_rate, a.decisions, device)
        out = (r.index_select(0, plas.mbon_idx_t).cpu(), r.index_select(0, dn_nodes).cpu())
        return out + (r.cpu(),) if full else out

    def code_rate(code):
        r = torch.zeros(core.n_nodes, device=device); r[kc_nodes] = code.to(device) * a.kc_rate; return r

    def m11(m):
        return float(m[m11_local].sum())

    def drop11(base_m, m):
        b = m11(base_m); return (1 - m11(m) / b) if b > 0 else 0.0

    writes = []

    def write(code, delta):
        plas.delta_punish = delta; plas.reset()
        st = plas.reinforce(code_rate(code), "punish", a.strength)
        writes.append(_sig(st["W_min"]))                                     # a W_min of exactly 0 means a compartment was wiped
        return plas.W.clone()

    def use(W):
        plas.W = W; plas.apply_to_core()

    # learning rate: the feedforward model's, never above the rule's valid ceiling. The step from W = 1 is
    # -lr * dose * strength * k, and the code is binary, so max(k) is the KC rate: all three belong in the cap.
    dmax = float(delta_full.max())
    lr_cap = 1.0 / (dmax * a.strength * max(a.kc_rate, 1e-12)) if dmax > 0 else a.lr
    rule = {"lr_requested": a.lr, "lr_cap_rule_valid": _sig(lr_cap), "lr_auto": bool(a.lr_auto), "template": a.template,
            "target_drop": a.target_drop if a.lr_auto else None}
    if a.lr_auto:                                                            # calibration odour from its own stream
        rng0 = np.random.default_rng([a.seed, 999]); od0 = rng0.choice(len(ff.glom_names), size=a.glom_per_odour, replace=False)
        c0 = ff.kc_code(ff.odour(od0)); plas.reset(); b0, _ = measure(c0)
        plas.lr = lr_cap; use(write(c0, delta_full)); plateau = drop11(b0, measure(c0)[0])
        if plateau >= a.target_drop:
            lo, hi = 0.0, lr_cap
            for _ in range(a.bisect):
                plas.lr = 0.5 * (lo + hi); use(write(c0, delta_full))
                lo, hi = (plas.lr, hi) if drop11(b0, measure(c0)[0]) < a.target_drop else (lo, plas.lr)
            plas.lr = 0.5 * (lo + hi)
        rule.update({"plateau_at_cap": _sig(plateau), "lr_capped": bool(plateau < a.target_drop),
                     "lr_calibrated_ok": bool(plateau >= a.target_drop)})
    else:
        plas.lr = min(a.lr, lr_cap)
    rule["lr_used"] = _sig(plas.lr)
    rule["note"] = ("the SYNAPTIC change is the calibrated quantity (lr 0.9 = the feedforward model's one Hige pairing); "
                    "the MBON11 RATE drop inside the recurrent brain is an outcome and plateaus near 0.6")
    mb_types = types[plas.mbon_idx]; dose = delta_full.cpu().numpy()[plas.mbon_idx]
    rule["dose_by_MBON_type_top"] = {t: _sig(float(dose[mb_types == t].mean())) for t in
                                     sorted(set(mb_types[dose > 0].tolist()), key=lambda t: -dose[mb_types == t].mean())[:10]}

    plas.reset(); base_e = core.edge_values().detach()[plas.plastic_edge].abs().cpu()   # plastic edge magnitudes, gain 1
    post_type = types[plas.post_of_plastic.cpu().numpy()]

    def removed_drive(W, k_e):
        return (base_e * (1 - W.cpu()) * k_e)

    per_seed, vec = [], {}
    for s in range(a.seed, a.seed + a.seeds):
        rng = np.random.default_rng(s)
        odours = [rng.choice(len(ff.glom_names), size=a.glom_per_odour, replace=False) for _ in range(a.odours)]
        codes = [ff.kc_code(ff.odour(o)) for o in odours]
        k_e = code_rate(codes[0])[plas.pre_of_plastic].cpu()                  # is the presynaptic Kenyon cell active for A?
        live = torch.nonzero(k_e > 0).squeeze(1).to(device)
        plas.reset()
        b0 = measure(codes[0], full=True); base = [b0[:2]] + [measure(c) for c in codes[1:]]
        base_dn = torch.stack([b[1] for b in base]); base_m = torch.stack([b[0] for b in base])
        r_all = b0[2][dyn]; r_mb = b0[0]
        state = {"frac_dynamic_at_ceiling": _sig(float((r_all >= r_max - 1e-3).float().mean())),
                 "frac_dynamic_silent": _sig(float((r_all < 0.01).float().mean())), "mean_rate_dynamic": _sig(float(r_all.mean())),
                 "frac_MBON_at_ceiling": _sig(float((r_mb >= r_max - 1e-3).float().mean())),
                 "frac_DN_at_ceiling": _sig(float((base_dn[0] >= r_max - 1e-3).float().mean())),
                 "frac_DN_silent": _sig(float((base_dn[0] < 0.01).float().mean())), "mean_rate_DN": _sig(float(base_dn[0].mean()))}
        dark_dn = measure(torch.zeros_like(codes[0]))[1]                     # no odour: what the MB route alone does to the DNs
        odour_dn = base_dn[0] - dark_dn

        W_full = write(codes[0], delta_full)                                 # the memory: every compartment PPL101 innervates
        aft = [measure(c) for c in codes]
        aft_dn = torch.stack([x[1] for x in aft]); aft_m = torch.stack([x[0] for x in aft])
        W_m11 = write(codes[0], delta_m11); m11_m, m11_dn = measure(codes[0])  # the same rule, MBON11 only
        g = torch.Generator(device="cpu").manual_seed(s)
        matched = []                                                         # same active Kenyon cells, random output cells
        for _ in range(a.n_null):
            Wn = torch.ones_like(W_full); Wn[live] = W_full[live[torch.randperm(len(live), generator=g).to(device)]]
            use(Wn); nm, nd = measure(codes[0]); matched.append((Wn, nm, nd))
        Ww = W_full[torch.randperm(len(W_full), generator=g).to(W_full.device)]
        use(Ww); _, weight_dn = measure(codes[0])                            # legacy weight-space shuffle (mostly silent cells)
        plas.delta_punish = delta_full; plas.reset()

        dA = aft_dn[0] - base_dn[0]; dU = aft_dn[1:] - base_dn[1:]; dM = m11_dn - base_dn[0]
        dN = torch.stack([nd - base_dn[0] for _, _, nd in matched]); dWt = weight_dn - base_dn[0]
        bsum = float(base_dn[0].abs().sum())

        def size(d, ref=base_dn[0], ref_sum=bsum):
            f = d.abs() / ref.clamp_min(1e-6)
            return {"pooled_L1_rel_change": _sig(float(d.abs().sum()) / ref_sum), "max_abs_change": _sig(float(d.abs().max())),
                    "max_frac_of_own_rate": _sig(float(f.max())), "median_frac_of_own_rate": _sig(float(f.median())),
                    "p95_frac_of_own_rate": _sig(float(f.quantile(0.95))), "max_frac_of_dynamic_range": _sig(float(d.abs().max()) / r_max),
                    "n_DN_changed_gt_1pct_of_rate": int((f > 0.01).sum()), "n_DN_changed_gt_5pct_of_rate": int((f > 0.05).sum()),
                    "frac_DN_change_positive": _sig(float((d > 0).float().mean()))}

        def lr_split(d):                                                     # steering is right minus left; a bilateral memory is common mode
            com = np.array([(float(d[r].mean()) + float(d[l].mean())) / 2 for _, l, r in bilateral])
            dif = np.array([(float(d[r].mean()) - float(d[l].mean())) / 2 for _, l, r in bilateral])
            return {"n_bilateral_types": len(bilateral), "sum_abs_common_mode": _sig(np.abs(com).sum()),
                    "sum_abs_right_minus_left": _sig(np.abs(dif).sum()),
                    "right_minus_left_over_common": _sig(np.abs(dif).sum() / np.abs(com).sum()) if np.abs(com).sum() > 0 else None}

        rd = removed_drive(W_full, k_e); tot = float(rd.sum())
        by_type = {t: float(rd[torch.as_tensor(post_type == t)].sum()) for t in set(post_type[(rd > 0).numpy()].tolist())}
        d11 = abs(m11(aft_m[0]) - m11(base_m[0]))
        overlap = [float((codes[0] * codes[k]).sum() / codes[0].sum()) for k in range(1, len(codes))]
        od_pool = float(odour_dn.abs().sum())
        row = {"seed": s, "state_dark_plus_trained_odour": state,
               "paired_drop_MBON11": _sig(drop11(base_m[0], aft_m[0])),
               "unpaired_drop_MBON11_mean": _sig(float(np.mean([drop11(base_m[i], aft_m[i]) for i in range(1, len(codes))]))),
               "paired_drop_MBON11_when_only_MBON11_is_dosed": _sig(drop11(base_m[0], m11_m)),
               "depression": {"n_live_plastic_edges": len(live), "removed_drive_total": _sig(tot),
                              "share_in_readout_type": _sig(by_type.get(a.readout_type, 0.0) / tot) if tot > 0 else None,
                              "share_by_MBON_type_top": {t: _sig(v / tot) for t, v in sorted(by_type.items(), key=lambda kv: -kv[1])[:8]} if tot > 0 else {},
                              "removed_drive_matched_nulls": [_sig(float(removed_drive(Wn, k_e).sum())) for Wn, _, _ in matched],
                              "removed_drive_weight_space_null": _sig(float(removed_drive(Ww, k_e).sum())),
                              "removed_drive_MBON11_only": _sig(float(removed_drive(W_m11, k_e).sum()))},
               "odour_itself_MB_route_only": {"pooled_L1_rel_change_vs_dark": _sig(od_pool / float(dark_dn.abs().sum())),
                                              "max_abs_change_vs_dark": _sig(float(odour_dn.abs().max())),
                                              "n_DN_changed_gt_5pct_of_rate": int((odour_dn.abs() / dark_dn.clamp_min(1e-6) > 0.05).sum())},
               "memory": {**size(dA), "left_right": lr_split(dA),
                          "readout_set_only": size(dA[readout], base_dn[0][readout], float(base_dn[0][readout].abs().sum())) if bool(readout.any()) else None,
                          "memory_over_odour_MB_route": _sig(float(dA.abs().sum()) / od_pool) if od_pool > 0 else None,
                          "transfer_pooled_DN_change_per_unit_MBON11_rate_change": _sig(float(dA.abs().sum()) / d11) if d11 > 0 else None,
                          "MBON11_abs_rate_change": _sig(d11),
                          "named_mean_abs": {n: _sig(float(dA[i].abs().mean())) for n, i in named.items() if len(i)},
                          "named_sum_abs": {n: _sig(float(dA[i].abs().sum())) for n, i in named.items() if len(i)},
                          "named_n_cells": {n: len(i) for n, i in named.items()}},
               "memory_MBON11_only": {**size(dM), "cos_with_full_memory": _cos(dA, dM),
                                      "pooled_share_of_full_memory": _sig(float(dM.abs().sum()) / float(dA.abs().sum())) if float(dA.abs().sum()) > 0 else None},
               "generalisation_to_untouched_odours": {"note": "deterministic sim: this is the same memory scaled by Kenyon-cell overlap, not noise",
                                                      "kc_overlap_with_trained": [_sig(o) for o in overlap],
                                                      "pooled_L1_rel_change": [_sig(float(dU[k].abs().sum()) / float(base_dn[k + 1].abs().sum())) for k in range(len(dU))],
                                                      "cos_with_trained_pattern": [_cos(dA, dU[k]) for k in range(len(dU))]},
               "matched_null_same_cells_random_outputs": {"pooled_L1_rel_change": [_sig(float(x.abs().sum()) / bsum) for x in dN],
                                                          "max_abs_change": [_sig(float(x.abs().max())) for x in dN],
                                                          "cos_with_trained_pattern": [_cos(dA, x) for x in dN],
                                                          "paired_drop_MBON11": [_sig(drop11(base_m[0], nm)) for _, nm, _ in matched]},
               "weight_space_null_mostly_silent_cells": size(dWt),
               "top_DNs_by_abs_change": [{"type": str(dn_types[i]), "side": str(dn_side[i]), "change": _sig(float(dA[i])), "base_rate": _sig(float(base_dn[0][i])),
                                          "change_when_only_MBON11_dosed": _sig(float(dM[i]))} for i in torch.topk(dA.abs(), min(a.top, len(dA))).indices.tolist()]}
        per_seed.append(row)
        vec[f"s{s}_dA"] = dA.numpy(); vec[f"s{s}_dU"] = dU.numpy(); vec[f"s{s}_dM11"] = dM.numpy(); vec[f"s{s}_dNull"] = dN.numpy()
        vec[f"s{s}_base"] = base_dn[0].numpy(); vec[f"s{s}_dark"] = dark_dn.numpy()
        print(f"seed {s}: MBON11 drop {row['paired_drop_MBON11']} (share of depression in {a.readout_type} {row['depression']['share_in_readout_type']}), "
              f"DN pooled {row['memory']['pooled_L1_rel_change']} | MBON11-only {row['memory_MBON11_only']['pooled_L1_rel_change']} | matched null "
              f"{row['matched_null_same_cells_random_outputs']['pooled_L1_rel_change']} | weight null {row['weight_space_null_mostly_silent_cells']['pooled_L1_rel_change']}; "
              f"max {row['memory']['max_abs_change']} = {row['memory']['max_frac_of_own_rate']} of rate; >5%: {row['memory']['n_DN_changed_gt_5pct_of_rate']}", flush=True)

    M = [r["memory"] for r in per_seed]
    un_all = [x for r in per_seed for x in r["generalisation_to_untouched_odours"]["pooled_L1_rel_change"]]
    nu_all = [x for r in per_seed for x in r["matched_null_same_cells_random_outputs"]["pooled_L1_rel_change"]]
    dAs = [torch.as_tensor(vec[f"s{r['seed']}_dA"]) for r in per_seed]
    cross = [_cos(dAs[i], dAs[j]) for i in range(len(dAs)) for j in range(i + 1, len(dAs))]
    agg = {"note": "spread over odour draws on ONE graph, gain and rule: odour-draw variability, not the uncertainty of the claim",
           "paired_drop_MBON11": _ms([r["paired_drop_MBON11"] for r in per_seed]),
           "unpaired_drop_MBON11": _ms([r["unpaired_drop_MBON11_mean"] for r in per_seed]),
           "share_of_depression_in_readout_type": _ms([r["depression"]["share_in_readout_type"] for r in per_seed]),
           "memory_pooled_L1": _ms([m["pooled_L1_rel_change"] for m in M]),
           "memory_pooled_L1_readout_set_only": _ms([m["readout_set_only"]["pooled_L1_rel_change"] for m in M if m["readout_set_only"]]),
           "memory_max_frac_of_own_rate_readout_set_only": _ms([m["readout_set_only"]["max_frac_of_own_rate"] for m in M if m["readout_set_only"]]),
           "memory_MBON11_only_pooled_L1": _ms([r["memory_MBON11_only"]["pooled_L1_rel_change"] for r in per_seed]),
           "MBON11_only_share_of_full_memory": _ms([r["memory_MBON11_only"]["pooled_share_of_full_memory"] for r in per_seed]),
           "MBON11_only_cos_with_full_memory": _ms([r["memory_MBON11_only"]["cos_with_full_memory"] for r in per_seed]),
           "untouched_pooled_L1": _ms(un_all), "matched_null_pooled_L1": _ms(nu_all),
           "matched_null_cos_with_trained_pattern": _ms([x for r in per_seed for x in r["matched_null_same_cells_random_outputs"]["cos_with_trained_pattern"]]),
           "weight_space_null_pooled_L1": _ms([r["weight_space_null_mostly_silent_cells"]["pooled_L1_rel_change"] for r in per_seed]),
           "memory_max_abs_change": _ms([m["max_abs_change"] for m in M]),
           "memory_max_frac_of_own_rate": _ms([m["max_frac_of_own_rate"] for m in M]),
           "memory_p95_frac_of_own_rate": _ms([m["p95_frac_of_own_rate"] for m in M]),
           "memory_max_frac_of_dynamic_range": _ms([m["max_frac_of_dynamic_range"] for m in M]),
           "n_DN_gt_1pct": _ms([m["n_DN_changed_gt_1pct_of_rate"] for m in M]), "n_DN_gt_5pct": _ms([m["n_DN_changed_gt_5pct_of_rate"] for m in M]),
           "frac_DN_change_positive": _ms([m["frac_DN_change_positive"] for m in M]),
           "right_minus_left_over_common": _ms([m["left_right"]["right_minus_left_over_common"] for m in M]),
           "odour_itself_MB_route_pooled_L1_vs_dark": _ms([r["odour_itself_MB_route_only"]["pooled_L1_rel_change_vs_dark"] for r in per_seed]),
           "memory_over_odour_MB_route": _ms([m["memory_over_odour_MB_route"] for m in M]),
           "transfer_pooled_DN_change_per_unit_MBON11_rate_change": _ms([m["transfer_pooled_DN_change_per_unit_MBON11_rate_change"] for m in M]),
           "cross_draw_cosine_of_DN_pattern": _ms(cross),
           "named_DN_mean_abs_change": {n: _ms([m["named_mean_abs"].get(n) for m in M]) for n in a.named_dns},
           "most_consistent_top5_types": Counter(d["type"] for r in per_seed for d in r["top_DNs_by_abs_change"][:5]).most_common(8)}

    tr, un, nu = (float(np.mean([m["pooled_L1_rel_change"] for m in M])), float(np.mean(un_all)), float(np.mean(nu_all)))
    n5 = float(np.mean([m["n_DN_changed_gt_5pct_of_rate"] for m in M]))
    odour_specific = bool(tr > 2 * un)
    ratio_null = tr / nu if nu > 0 else None
    material = bool(n5 >= 0.01 * len(dn_local))                              # absolute size only; no ratio can set this
    flags = {"odour_specific_trained_gt_2x_untouched": odour_specific,
             "memory_over_matched_null_pooled": _sig(ratio_null),
             "compartment_matters_ratio_outside_0.5_to_2": bool(ratio_null is not None and (ratio_null > 2 or ratio_null < 0.5)),
             "material_at_least_1pct_of_DNs_shift_gt_5pct_of_rate": material}
    out = {"graph": {"path": Path(a.subgraph).name, "n_nodes": int(core.n_nodes), "n_edges": int(core.n_edges), "n_KC": len(kc_nodes),
                     "n_plastic_KC_MBON_edges": plas.n_plastic, "readout_type": a.readout_type, "n_readout_cells": len(m11_local),
                     "readout_sign": [int(x) for x in np.asarray(sub["sign"])[plas.mbon_idx[m11_local]]]},
           "dn_selection": dn_selection, "direct_contacts_readout_type_to_DN": direct, "direct_contacts_cut": cut,
           "operating_point": {"op_point": a.op_point, "g_star": a.g_star, "w0_matched": gm["w0"], "w0_scale": a.w0_scale, "w0_used": w0,
                               "relaxed_report_at_clamped_level_1_NOT_the_measurement_condition":
                                   {k: gm[k] for k in ("mean_rate_dynamic", "frac_saturated", "frac_silent", "gain_at_fixed_point") if k in gm},
                               "measurement_condition": "all sensory inputs at zero, Kenyon cells pinned to the code every substep",
                               "centre_factor": core.centre_factor_stats.get("factor") if isinstance(core.centre_factor_stats, dict) else None,
                               "r_max": r_max, "idle_rate_softplus0": _sig(float(np.log(2.0))), "kc_rate": a.kc_rate, "decisions": a.decisions},
           "rule": {**rule, "n_writes": len(writes), "smallest_synapse_left_after_a_pairing": min(writes) if writes else None},
           "per_seed": per_seed, "aggregate": agg, "flags": flags, "elapsed_s": round(time.time() - t0, 1)}
    out["verdict"] = verdict_text(out)
    if a.out:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(a.out.with_suffix(".npz"), dn_bodyId=body[dn_local], dn_type=dn_types.astype("U24"), dn_side=dn_side.astype("U8"), **vec)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--subgraph", type=Path, default=OUT_DIR / "graph" / "subgraph_full.npz")
    ap.add_argument("--neurons", type=Path, default=OUT_DIR / "graph" / "neurons.parquet")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--op-point", default="rest", choices=["rest", "drive", "fixed_point"])
    ap.add_argument("--g-star", type=float, default=0.95)
    ap.add_argument("--w0-scale", type=float, default=1.0, help="multiply the gain-matched w0")
    ap.add_argument("--kc-rate", type=float, default=1.0); ap.add_argument("--decisions", type=int, default=30)
    ap.add_argument("--sparsity", type=float, default=0.05); ap.add_argument("--glom-per-odour", type=int, default=6)
    ap.add_argument("--odours", type=int, default=4, help="per draw: index 0 is trained, the rest untouched")
    ap.add_argument("--seeds", type=int, default=3, help="odour draws (they re-measure one transfer pattern; see the docstring)")
    ap.add_argument("--seed", type=int, default=0); ap.add_argument("--n-null", type=int, default=3)
    ap.add_argument("--lr", type=float, default=0.9, help="the feedforward model's one-pairing lr; capped at 1/max(dose)")
    ap.add_argument("--lr-auto", action="store_true", help="bisect toward --target-drop at MBON11, inside [0, 1/max(dose)] only")
    ap.add_argument("--bisect", type=int, default=12); ap.add_argument("--target-drop", type=float, default=0.9)
    ap.add_argument("--template", default="counts", choices=["counts", "core"],
                    help="dopamine dose from raw synapse counts pooled by MBON type (feedforward model) or the core's log1p edge values")
    ap.add_argument("--strength", type=float, default=1.0); ap.add_argument("--w-max", type=float, default=2.0)
    ap.add_argument("--punish", nargs="+", default=["PPL101"]); ap.add_argument("--reward", nargs="+", default=["PAM"])
    ap.add_argument("--readout-type", default="MBON11")
    ap.add_argument("--named-dns", nargs="+", default=["DNa02", "DNa03"]); ap.add_argument("--top", type=int, default=8)
    ap.add_argument("--anatomy-only", action="store_true", help="cell selection and direct readout -> DN contacts only; no simulation")
    ap.add_argument("--cut-direct", action="store_true", help="silence every direct readout-cell -> DN synapse (causal test of what they carry)")
    ap.add_argument("--rewrite-verdict", type=Path, default=None, help="regenerate the verdict text of an existing result file, numbers untouched")
    ap.add_argument("--cells", type=Path, default=None, help="print the per-cell figures of section 4.8 from a saved <out>.npz; no simulation")
    ap.add_argument("--draw", type=int, default=0, help="odour draw for --cells")
    ap.add_argument("--out", type=Path, default=None)
    a = ap.parse_args(argv)
    if a.cells:
        print(json.dumps(json_safe(cell_report(a.cells, a.draw)), indent=1)); return
    if a.rewrite_verdict:
        o = json.loads(a.rewrite_verdict.read_text()); o["verdict"] = verdict_text(o)
        a.rewrite_verdict.write_text(json.dumps(o, indent=1, allow_nan=False)); print(o["verdict"]); return
    res = json_safe(run(a)); text = json.dumps(res, indent=1, allow_nan=False)
    if a.out:
        a.out.parent.mkdir(parents=True, exist_ok=True); a.out.write_text(text)
    print(res.get("verdict") or json.dumps(res["direct_contacts_readout_type_to_DN"][:12], indent=1))


if __name__ == "__main__":
    main()
