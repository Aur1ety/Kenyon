"""Sections 1 and 2: the memory battery on the feedforward mushroom body (model/mushroom_body.py), for smell
or vision.

What is a prediction and what is not. With a binary KC code the paired-odour drop at an MBON after p pairings
is exactly 1 - (1 - lr*delta)^p: its size is set by lr, not by the wiring. So lr is calibrated ONCE so that
one pairing gives Hige et al. 2015's ~90 % (synaptic charge) at MBON11 (the gamma1pedc compartment), and that
number is reported as calibrated, not as a result. Everything else follows from the wiring and the rule: which
other MBON types change (compartment map), how much unpaired odours change (code overlap), how the change
generalises to similar odours, and whether several memories can coexist.

Controls: dan_mbon shuffle (permute which MBON type each reinforcement reaches: the compartment endpoint must
fail), dense code (sparsity 1: the specificity endpoint must fail), and degree-preserving pn_kc / kc_mbon
shuffles (expected to match; they do not test the result). Reinforcing with no KC activity is zero by the
rule's algebra and is reported as that, not as a timing test: this model has no time axis.

    python -m kenyon.experiments.olfactory --binary-code --wiring $KENYON_OUT/mb/mb_wiring.npz --out $KENYON_OUT/mb/olf5_binary.json
    python -m kenyon.experiments.olfactory --binary-code --wiring $KENYON_OUT/mb/mb_wiring.npz --modality visual \
        --out $KENYON_OUT/mb/vis5_binary.json
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch

from kenyon import OUT_DIR
# The circuit lives in kenyon.model.mushroom_body. It is re-exported here because seeds.py and the tests reach it
# through this module.
from kenyon.model.mushroom_body import HIGE_CHARGE_DROP, MushroomBody, drop, json_safe, per_type  # noqa: F401


def run(a) -> dict:
    t0 = time.time()
    lr0 = 0.9 if a.lr == "auto" else float(a.lr)
    mb = MushroomBody(a.subgraph, a.neurons, a.sparsity, tuple(a.punish), tuple(a.reward), lr0, a.w_max, a.shuffle,
                      a.seed, a.binary_code, a.recover_rate, wiring=a.wiring, modality=a.modality)
    rng = np.random.default_rng(a.seed)
    odours = [rng.choice(len(mb.glom_names), size=a.glom_per_odour, replace=False) for _ in range(a.odours)]
    codes = [mb.kc_code(mb.odour(o)) for o in odours]
    X = torch.stack(codes); Xn = X / (X.norm(dim=1, keepdim=True) + 1e-9); C = (Xn @ Xn.T).numpy()
    off = C[~np.eye(len(odours), dtype=bool)]
    m11 = mb.type_mask("MBON11")
    comp, comp_r = mb.compartment_mask("punish"), mb.compartment_mask("reward")
    calib_note = None
    if a.lr == "auto":                                                       # one pairing = target drop in the punished compartment (MBON11 for real wiring)
        try:
            mb.calibrate_lr(codes[0], comp, a.target_drop, "punish", a.strength)
        except ValueError as e:                                              # e.g. a shuffled dopamine map sends punishment to a compartment this code never drives
            calib_note = f"calibration impossible, lr left at {lr0}: {e}"
    P = a.pairings
    res = {"circuit": {"modality": a.modality, "n_input": mb.n_input, "n_channels": len(mb.glom_names), "n_KC": mb.n_kc,
                       "n_drivable_KC": mb.n_drivable_kc, "kwta_k": max(1, round(a.sparsity * mb.n_drivable_kc)), "n_MBON": mb.n_mbon,
                       "n_plastic_KC_MBON_edges": mb.n_edges, "n_punish_DAN": mb.n_punish_dan, "n_reward_DAN": mb.n_reward_dan,
                       "MBON11_input_frac_from_KC": mb.mbon_input_frac_from_kc("MBON11"), "input_totals_source": mb.input_totals_source,
                       "wiring_build": getattr(mb, "wiring_build", None),
                       "punish_compartment_types": sorted({mb.mbon_type[i] for i in np.flatnonzero(comp.numpy())}),
                       "reward_compartment_types": sorted({mb.mbon_type[i] for i in np.flatnonzero(comp_r.numpy())}),
                       "delta_punish_MBON11": round(float(mb.delta_punish[m11].mean()), 4),
                       "delta_reward_MBON11": round(float(mb.delta_reward[m11].mean()), 4)},
           "kc_code": {"sparsity": a.sparsity, "binary": a.binary_code,
                       "active_frac": [round(float((c > 0).float().mean()), 4) for c in codes[:4]],
                       "cross_odour_cos_mean": round(float(off.mean()), 4), "cross_odour_cos_max": round(float(off.max()), 4)},
           "rule": {"lr": round(mb.lr, 4), "lr_calibrated": a.lr == "auto" and calib_note is None, "lr_calibration_note": calib_note,
                    "target_drop_in_punish_compartment_p1": a.target_drop if a.lr == "auto" else None,
                    "lr_capped_at_stability_limit": bool(getattr(mb, "lr_capped", False)),
                    "recover_rate": a.recover_rate, "pairings": P, "strength": a.strength,
                    "note": "paired drop at p pairings = (S2/S1) * (1 - (1 - lr*delta)^p) by the rule; with lr calibrated it is "
                            "not a prediction. Wiring-dependent endpoints: compartment map, unpaired/generalisation, coexistence."},
           "shuffle": a.shuffle, "punish": list(a.punish), "reward": list(a.reward)}

    def resp():
        return torch.stack([mb.mbon_response(c) for c in codes])              # [O, n_mbon]

    before = resp()

    # --- one memory: odour A + punishment, p pairings. Measured next to the closed form.
    curve = {}
    mb.reset()
    for p in range(1, max(P, a.curve_max) + 1):
        mb.reinforce(codes[0], "punish", a.strength)
        after = resp()
        curve[p] = {"paired_A_MBON11": round(drop(before[0], after[0], m11), 4),
                    "closed_form_MBON11": round(mb.analytic_drop(codes[0], codes[0], m11, p, "punish", a.strength), 4),
                    "unpaired_MBON11_mean": round(float(np.mean([drop(before[i], after[i], m11) for i in range(1, len(codes))])), 4),
                    "unpaired_closed_form": round(float(np.mean([mb.analytic_drop(codes[0], codes[i], m11, p, "punish", a.strength) for i in range(1, len(codes))])), 4)}
        if p == P:
            one = after; W_at_P = mb.W.clone()                                # the weights after exactly P pairings
    res["drop_vs_pairings_MBON11"] = curve
    mb.W = W_at_P            # everything below (W_stats, generalisation) reads the P-pairing memory, not the curve's saturated end
    unp = [drop(before[i], one[i], m11) for i in range(1, len(codes))]
    ov = [mb.overlap(codes[0], codes[i], m11) for i in range(1, len(codes))]
    res["one_memory"] = {"pairings": P,
                         "paired_A_MBON11": round(drop(before[0], one[0], m11), 4),
                         "paired_A_compartment": round(drop(before[0], one[0], comp), 4),
                         "unpaired_MBON11_mean": round(float(np.mean(unp)), 4), "unpaired_MBON11_each": [round(x, 4) for x in unp],
                         "unpaired_over_paired": round(float(np.mean(unp)) / max(drop(before[0], one[0], m11), 1e-9), 4),
                         "overlap_at_MBON11_mean": round(float(np.mean(ov)), 4),
                         "per_type_drop_A": per_type(before[0], one[0], mb),
                         "share_of_depression_in_MBON11": round(float((before[0] - one[0])[m11].sum() / (before[0] - one[0]).sum()), 4),
                         "W_stats": {"min": round(float(mb.W.min()), 4), "mean": round(float(mb.W.mean()), 4), "frac_depressed": round(float((mb.W < 0.99).float().mean()), 4)}}

    # --- generalisation: odours sharing s of A's glomeruli, read against the same P-pairing memory (W_at_P above)
    gen = {}
    a_set = list(odours[0]); pool = [g for g in range(len(mb.glom_names)) if g not in a_set]
    for s in sorted({a.glom_per_odour - 1, a.glom_per_odour - 2, a.glom_per_odour // 2, 1, 0}, reverse=True):
        ds, cs, ovs = [], [], []
        for r in range(a.gen_reps):
            keep = list(rng.choice(a_set, size=s, replace=False)); new = list(rng.choice(pool, size=a.glom_per_odour - s, replace=False))
            code = mb.kc_code(mb.odour(keep + new))
            ds.append(drop(mb._sum_to_mbon(mb.e_base * code[mb.e_kc]), mb.mbon_response(code), m11))
            cs.append(float((code / (code.norm() + 1e-9)) @ (codes[0] / (codes[0].norm() + 1e-9)))); ovs.append(mb.overlap(codes[0], code, m11))
        gen[f"shared_{s}_of_{a.glom_per_odour}"] = {"drop_MBON11": round(float(np.mean(ds)), 4), "kc_cosine_to_A": round(float(np.mean(cs)), 4),
                                                    "overlap_at_MBON11": round(float(np.mean(ovs)), 4)}
    res["generalisation"] = gen

    # --- DAN with no KC activity: zero by the rule's algebra (k = 0, W = 1). Not a timing test.
    mb.reset()
    for _ in range(P):
        mb.reinforce(torch.zeros_like(codes[0]), "punish", a.strength)
    res["dan_alone_no_KC_drop_A"] = {"value": round(drop(before[0], mb.mbon_response(codes[0]), m11), 4), "note": "identically 0 by the rule; no time axis in this model"}

    # --- reward: odour C + PAM. Same rule, its own compartments (Owald 2015: reward = depression of approach-avoiding MBONs).
    mb.reset()
    for _ in range(P):
        mb.reinforce(codes[2], "reward", a.strength)
    rew = resp()
    res["reward_memory"] = {"paired_C_reward_compartments": round(drop(before[2], rew[2], comp_r), 4),
                            "paired_C_MBON11": round(drop(before[2], rew[2], m11), 4),
                            "per_type_drop_C": per_type(before[2], rew[2], mb),
                            "unpaired_reward_compartments_mean": round(float(np.mean([drop(before[i], rew[i], comp_r) for i in range(len(codes)) if i != 2])), 4)}

    # --- coexistence. Same compartment: A then B (blocked) and A/B interleaved. Different compartments: A punished, C rewarded.
    def block(seq):
        mb.reset()
        for idx, us in seq:
            for _ in range(P):
                mb.reinforce(codes[idx], us, a.strength)
        return resp()
    mb.reset()
    for _ in range(P):
        mb.reinforce(codes[0], "punish", a.strength)
    a_alone = drop(before[0], mb.mbon_response(codes[0]), m11)
    ab = block([(0, "punish"), (1, "punish")])
    a_after_b = drop(before[0], ab[0], m11)
    mb.reset()
    for _ in range(P):
        mb.reinforce(codes[0], "punish", a.strength); mb.reinforce(codes[1], "punish", a.strength)
    abi = resp()
    ac = block([(0, "punish"), (2, "reward")])
    d11 = float(mb.delta_punish[m11].mean()) * a.strength
    res["coexistence"] = {
        "same_compartment_blocked_A_then_B": {"A_alone": round(a_alone, 4), "A_after_B": round(a_after_b, 4), "B": round(drop(before[1], ab[1], m11), 4),
                                              "A_retained_fraction": round(a_after_b / max(a_alone, 1e-9), 4),
                                              "closed_form_retained_nonshared_KCs": round(float(max(1 - mb.lr * d11 * mb.recover_rate, 0.0) ** P), 4)},
        "same_compartment_interleaved": {"A": round(drop(before[0], abi[0], m11), 4), "B": round(drop(before[1], abi[1], m11), 4)},
        "different_compartments_A_punish_C_reward": {"A_MBON11": round(drop(before[0], ac[0], m11), 4), "C_reward_compartments": round(drop(before[2], ac[2], comp_r), 4),
                                                     "C_MBON11": round(drop(before[2], ac[2], m11), 4), "A_reward_compartments": round(drop(before[0], ac[0], comp_r), 4),
                                                     "D_untouched_MBON11": round(drop(before[3], ac[3], m11), 4)},
        "note": "the rule's silent-KC term relaxes depressed synapses toward 1 whenever dopamine arrives, so a second memory in the same "
                "compartment erodes the first by (1 - lr*delta*recover_rate)^p on non-shared KCs; recover_rate 1 is the published rule"}
    res["elapsed_s"] = round(time.time() - t0, 1)
    res["ground_truth"] = "Hige 2015: one pairing block ~80% (spikes) / ~90% (charge) at MBON-gamma1pedc; unpaired odour unchanged. Owald 2015: reward = depression in PAM compartments."
    return res


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subgraph", type=Path, default=OUT_DIR / "graph" / "subgraph_v5.npz")
    ap.add_argument("--neurons", type=Path, default=OUT_DIR / "graph" / "neurons.parquet")
    ap.add_argument("--wiring", type=Path, default=None, help="full-connectome MB cache from connectome/mb_build.py; overrides --subgraph")
    ap.add_argument("--modality", default="olfactory", choices=["olfactory", "visual"])
    ap.add_argument("--sparsity", type=float, default=0.05); ap.add_argument("--odours", type=int, default=8)
    ap.add_argument("--glom-per-odour", type=int, default=6); ap.add_argument("--pairings", type=int, default=1)
    ap.add_argument("--curve-max", type=int, default=8); ap.add_argument("--gen-reps", type=int, default=20)
    ap.add_argument("--lr", default="auto", help="'auto' = calibrate once so one pairing gives --target-drop at MBON11; or a number")
    ap.add_argument("--target-drop", type=float, default=HIGE_CHARGE_DROP); ap.add_argument("--strength", type=float, default=1.0)
    ap.add_argument("--w-max", type=float, default=2.0); ap.add_argument("--recover-rate", type=float, default=1.0)
    ap.add_argument("--punish", nargs="+", default=["PPL101"]); ap.add_argument("--reward", nargs="+", default=["PAM"])
    ap.add_argument("--shuffle", default=None, choices=[None, "pn_kc", "kc_mbon", "dan_mbon"])
    ap.add_argument("--seed", type=int, default=0); ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--binary-code", action="store_true", help="KC fires or not (spike-like), instead of graded rates")
    return ap


def main(argv=None):
    a = build_parser().parse_args(argv)
    res = json_safe(run(a))
    text = json.dumps(res, indent=1, allow_nan=False)                        # fail loudly if a nan ever leaks again
    if a.out:
        a.out.parent.mkdir(parents=True, exist_ok=True); a.out.write_text(text)
    print(text)


if __name__ == "__main__":
    main()
