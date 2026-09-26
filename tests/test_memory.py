"""Regression guards for the mushroom-body memory modules, on a tiny synthetic wiring cache (no data needed).

Each test pins a defect that an adversarial review found in these modules, so it cannot come back silently:
the k-winners pool, the exact one-pairing calibration, the generalisation table being read from the ONE-pairing
memory (not the saturated end of the pairing curve), nan drops serialised as null, the reciprocal T-maze index
being 0 by construction when untrained, the two-hop relay set excluding MBONs and DNs, the timed rule's closed
form, the leave-one-out decoder scoring a separable code at 1 (the old one-sample decoder was identically 0),
and the lesion battery's baseline-corrected behavioural readout. The motor tests at the end cover the section 4.8
module (direct contacts, the dose template, the causal cut, the verdict and the per-cell report) and the
plasticity rule on the recurrent core, on a 17-node graph built here.

    python -m pytest tests/test_memory.py
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import torch
from scipy import sparse

from kenyon.experiments import olfactory
from kenyon.model.mushroom_body import MushroomBody, drop, json_safe

N_GLOM, PN_PER_GLOM, N_KC, N_DRIVABLE = 16, 3, 80, 72
MBON_TYPES = ["MBON11", "MBON11", "MBON03", "MBON03", "MBON05", "MBON10"]


@pytest.fixture(scope="module")
def wiring(tmp_path_factory):
    """A mb_build-shaped cache: 48 PNs in 16 glomeruli (enough for the modules' six-glomerulus odours and their
    generalisation pools), 80 KCs (72 with PN input, 12 of them with visual input), 6 MBONs of 4 types, PPL101
    onto MBON11 only, PAM onto MBON03/05, 5 DNs, 2 APL cells."""
    rng = np.random.default_rng(0)
    n_pn = N_GLOM * PN_PER_GLOM
    opn_glom = np.array([f"G{i // PN_PER_GLOM:02d}" for i in range(n_pn)])
    kc_type = np.array(["KCg-m"] * 40 + ["KCab-s"] * 20 + ["KCg-d"] * 20)
    W_pk = np.zeros((N_KC, n_pn))
    for k in range(N_DRIVABLE):
        W_pk[k, rng.choice(n_pn, 4, replace=False)] = rng.integers(5, 20, 4)
    vpn_type = np.array(["LC4", "LC4", "LPLC2", "LPLC2", "MeVP1", "MeVP1"])
    W_vk = np.zeros((N_KC, 6))
    for k in range(60, 72):
        W_vk[k, rng.choice(6, 2, replace=False)] = rng.integers(1, 5, 2)
    km = np.zeros((len(MBON_TYPES), N_KC)); km[:, :N_DRIVABLE] = rng.integers(1, 6, (len(MBON_TYPES), N_DRIVABLE))
    km = sparse.coo_matrix(km)
    dan_type = np.array(["PPL101", "PPL101", "PAM01", "PAM04"])
    dan_mbon = np.zeros((len(MBON_TYPES), 4)); dan_mbon[0:2, 0:2] = 10.0; dan_mbon[2:5, 2:4] = 8.0
    dn_type = np.array(["DNa02", "DNa03", "DNp01", "DNb01", "DNg01"])
    W1 = rng.integers(0, 3, (5, len(MBON_TYPES))).astype(float); W2 = rng.integers(0, 10, (5, len(MBON_TYPES))).astype(float)
    mbon_in_total = np.asarray(km.sum(1)).ravel() * 4.0            # KC input is exactly a quarter of each MBON's input
    W_pk = sparse.csr_matrix(W_pk); W_vk = sparse.csr_matrix(W_vk)
    path = tmp_path_factory.mktemp("mb") / "mb_wiring.npz"
    np.savez(path, kc_type=kc_type.astype("U16"), mbon_type=np.array(MBON_TYPES).astype("U16"), opn_glom=opn_glom.astype("U16"),
             vpn_type=vpn_type.astype("U24"), dan_type=dan_type.astype("U16"),
             pk_data=W_pk.data, pk_indices=W_pk.indices, pk_indptr=W_pk.indptr, pk_shape=np.array(W_pk.shape),
             vk_data=W_vk.data, vk_indices=W_vk.indices, vk_indptr=W_vk.indptr, vk_shape=np.array(W_vk.shape),
             km_row=km.row, km_col=km.col, km_data=km.data, km_shape=np.array(km.shape),
             dan_mbon=dan_mbon, dn_type=dn_type.astype("U16"), dn_mbon_direct=W1, dn_mbon_2hop=W2,
             kc_apl=np.full((2, N_KC), 40.0), apl_kc=np.full((N_KC, 2), 40.0),
             mbon_in_total=mbon_in_total, kc_body=np.arange(N_KC) + 1000,
             build_time=np.array("test"), build_source_sha=np.array("deadbeef"))
    return path


@pytest.fixture(scope="module")
def neurons(tmp_path_factory):
    """neurons.parquet stand-in: the MBON types with a transmitter, as build_valence reads it."""
    df = pd.DataFrame({"bodyId": [1, 2, 3, 4, 5, 6], "type": MBON_TYPES,
                       "consensus_nt": ["gaba", "gaba", "glutamate", "glutamate", "glutamate", "gaba"]})
    path = tmp_path_factory.mktemp("g") / "neurons.parquet"; df.to_parquet(path); return path


def mb_of(wiring, **kw):
    return MushroomBody(None, None, wiring=wiring, binary=True, **kw)


def test_kwta_runs_over_the_drivable_pool_only(wiring):
    mb = mb_of(wiring)
    assert mb.n_drivable_kc == N_DRIVABLE
    code = mb.kc_code(mb.odour([0, 1, 2]))
    assert int((code > 0).sum()) == max(1, round(0.05 * N_DRIVABLE))
    assert not code[N_DRIVABLE:].any()                                        # cells without PN input never fire
    vis = mb_of(wiring, modality="visual")
    assert vis.n_drivable_kc == 12                                             # the visual pool is the VPN-driven cells
    assert int((vis.kc_code(vis.odour([0, 1])) > 0).sum()) <= 1


def test_one_calibrated_pairing_hits_the_target_exactly(wiring):
    mb = mb_of(wiring); code = mb.kc_code(mb.odour([0, 1, 2]))
    mask = mb.compartment_mask("punish")
    assert mask.tolist() == [True, True, False, False, False, False]          # PPL101 lands on MBON11 only
    assert mb.compartment_mask("reward").tolist() == [False, False, True, True, True, False]
    mb.calibrate_lr(code, mask, 0.9); mb.reset()
    before = mb.mbon_response(code); mb.reinforce(code, "punish")
    assert abs(drop(before, mb.mbon_response(code), mask) - 0.9) < 1e-6
    mb.reset(); assert torch.equal(mb.W, torch.ones(mb.n_edges))             # reset restores every weight


def test_generalisation_is_read_from_the_one_pairing_memory(wiring):
    """The review found the generalisation table measured after the 8-pairing curve while labelled 'one pairing'.
    With a binary code and one calibrated pairing, drop == 0.9 * overlap exactly, and W bottoms at 0.1 not 0.1**8."""
    a = olfactory.build_parser().parse_args(["--binary-code", "--wiring", str(wiring), "--odours", "4",
                                              "--glom-per-odour", "3", "--gen-reps", "5", "--curve-max", "8"])
    res = json_safe(olfactory.run(a))
    assert res["rule"]["pairings"] == 1
    assert abs(res["one_memory"]["W_stats"]["min"] - 0.1) < 1e-6
    for row in res["generalisation"].values():
        assert abs(row["drop_MBON11"] - 0.9 * row["overlap_at_MBON11"]) < 1e-3
    assert res["drop_vs_pairings_MBON11"][8]["paired_A_MBON11"] > 0.99       # the curve itself still saturates
    assert res["circuit"]["n_drivable_KC"] == N_DRIVABLE and res["circuit"]["kwta_k"] == round(0.05 * N_DRIVABLE)
    assert abs(res["circuit"]["MBON11_input_frac_from_KC"] - 0.25) < 1e-6


def test_nan_drop_is_serialised_as_null():
    z = torch.zeros(3); mask = torch.tensor([True, False, False])
    d = drop(z, z, mask); assert np.isnan(d)                                   # nan when the masked cells carry no drive
    assert json.loads(json.dumps(json_safe({"x": [d, 1.0]}), allow_nan=False)) == {"x": [None, 1.0]}


def test_wiring_provenance_is_loaded(wiring):
    mb = mb_of(wiring)
    assert mb.wiring_build == {"build_time": "test", "build_source_sha": "deadbeef"}
    assert len(mb.kc_body) == N_KC and mb.input_totals_source.startswith("full connectome")


def test_tmaze_untrained_is_zero_by_construction_and_learning_shifts_choice(wiring, neurons):
    from kenyon.experiments import behaviour
    a = argparse.Namespace(subgraph=None, neurons=neurons, wiring=wiring, modality="olfactory", sparsity=0.05, odours=4,
                           glom_per_odour=3, pairings=1, lr="auto", target_drop=0.9, strength=1.0, recover_rate=1.0,
                           w_max=2.0, binary_code=True, shuffle=None, punish=["PPL101"], reward=["PAM"],
                           betas=[4.0, 8.0], pi_seeds=3, seed=0, out=None)
    res = behaviour.run(a)
    for row in res["tmaze_PI_by_beta"].values():
        assert "innate_bias_A_vs_B" in row and "PI_untrained" not in row
        assert row["PI_trained"] > 0                                           # punishing an approach-output odour -> avoidance
    over = res["tmaze_PI_over_seeds"]
    assert over["n_seeds"] == 3 and over["learned_score_shift_mean_sd"][0] > 0
    assert set(over["by_beta"]) == {4.0, 8.0} and over["by_beta"][8.0]["PI_mean_sd"][0] > 0
    b8 = over["by_beta"][8.0]                                                  # the seeds really draw different pairs
    assert b8["PI_mean_sd"][1] > 0 and b8["PI_min_max"][0] != b8["PI_min_max"][1] and over["learned_score_shift_mean_sd"][1] > 0
    assert res["punish_compartment_types"] == ["MBON11"] and res["reward_compartment_types"] == ["MBON03", "MBON05"]
    # the per-pair loop must start every pair from the UNTRAINED circuit: with one seed it must reproduce the example pair
    a.pi_seeds = 1; r1 = behaviour.run(a)
    for beta, row in r1["tmaze_PI_by_beta"].items():
        assert r1["tmaze_PI_over_seeds"]["by_beta"][beta]["PI_mean_sd"][0] == row["PI_trained"]
        assert r1["tmaze_PI_over_seeds"]["by_beta"][beta]["abs_innate_bias_mean_sd"][0] == abs(row["innate_bias_A_vs_B"])
    ex = r1["learned_score_shift_example_pair"]
    assert abs(r1["tmaze_PI_over_seeds"]["learned_score_shift_mean_sd"][0] - 0.5 * (ex["A"] + ex["B"])) < 1e-4
    a.pi_seeds = 3; a.pairings = 0; res0 = behaviour.run(a)                 # no training: the reciprocal index is identically 0
    assert all(abs(row["PI_trained"]) < 1e-9 for row in res0["tmaze_PI_by_beta"].values())
    a.pairings = 1


def test_lesion_rows_carry_learned_shift_and_identity_flags(wiring, neurons):
    from kenyon.experiments import lesion
    a = argparse.Namespace(subgraph=None, neurons=neurons, wiring=wiring, pairings=1, target=0.9, beta=8.0, seed=0, out=None)
    rows = {r["lesion"]: r for r in lesion.run(a)["lesions"]}
    assert rows["none"]["learned_shift_frac_of_intact"] == 1.0 and rows["none"]["independent_wiring_test"]
    assert rows["PPL101_silenced"]["learned_shift"] == 0.0 and not rows["PPL101_silenced"]["independent_wiring_test"]
    assert rows["APL_disinhibited"]["drive_loss_vs_intact"] is None            # a dense code raises drive; not a loss
    assert rows["KCg-m_silenced"]["applied"] and rows["KCg-m_silenced"]["independent_wiring_test"]
    assert all("learned_shift" in r for r in rows.values())


def test_online_closed_form_matches_the_timed_episode_and_backward_writes_nothing(wiring):
    from kenyon.experiments.online import closed_form_drop, da_pulse_train, train_episode
    mb = mb_of(wiring); code = mb.kc_code(mb.odour([0, 1, 2])); m11 = mb.type_mask("MBON11")
    kw = {"dt": 0.01, "odour_on": 0.0, "odour_off": 2.0, "da_width": 0.05, "tau_elig": 0.8, "tau_forget": 1e9}
    d11 = float(mb.delta_punish[m11].max()); before = mb.mbon_response(code)
    fwd = da_pulse_train(4, 0.2, 2.0, 0.05)
    mb.reset(); train_episode(mb, code, "punish", eta=5.0, da_starts=fwd, **kw)
    measured = 1 - float(mb.mbon_response(code)[m11].sum() / before[m11].sum())
    assert 0.3 < measured < 1.0
    assert abs(measured - closed_form_drop(5.0, d11, da_starts=fwd, **kw)) < 1e-4   # binary code: the drop is the scalar closed form
    back = da_pulse_train(4, -1.0, 2.0, 0.05, anchor="end")
    assert back.max() + 0.05 <= -1.0 + 1e-9                                    # the whole train ends 1 s before odour onset
    mb.reset(); train_episode(mb, code, "punish", eta=5.0, da_starts=back, **kw)
    assert torch.equal(mb.W, torch.ones(mb.n_edges))                          # nothing written: zero by construction


def test_two_hop_relays_exclude_mbons_and_dns():
    from kenyon.connectome.mb_build import mbon_dn_paths
    mbon = np.array([1, 2]); dn = np.array([10, 11]); X = 20
    # 1->X->10 is a real interneuron relay (3*4); 1->2->10 relays through an MBON and 1->11->10 through a DN: both excluded
    w = pd.DataFrame({"body_pre": [1, X, 1, 2, 1, 11, 1], "body_post": [X, 10, 2, 10, 11, 10, 10],
                      "weight": [3, 4, 5, 6, 7, 8, 9]})
    W1, W2, inter = mbon_dn_paths(w, mbon, dn)
    assert inter.tolist() == [X]
    assert W1[0, 0] == 9 and W1[0, 1] == 6                                     # direct MBON -> DN kept
    assert W2[0, 0] == 12 and W2[0, 1] == 0


def test_loo_decoder_scores_a_separable_code_and_not_a_shuffled_one():
    from kenyon.experiments.sparse import loo_nearest_centroid
    O, R = 6, 5; y = torch.arange(O).repeat_interleave(R); g = torch.Generator().manual_seed(0)
    K = torch.repeat_interleave(torch.eye(O), R, dim=0) + 0.05 * torch.randn(O * R, O, generator=g)
    assert loo_nearest_centroid(K, y) == 1.0
    assert loo_nearest_centroid(K, y[torch.randperm(O * R, generator=g)]) < 0.5
    flat = torch.ones(O * R, 50) + 0.01 * torch.randn(O * R, 50, generator=g)   # every odour the same pattern: no code
    assert loo_nearest_centroid(flat, y) < 0.35                                # near chance; a resubstitution decoder would score ~1
    assert np.isnan(loo_nearest_centroid(K[::R], torch.arange(O)))            # one sample per class: undefined, not 0


def test_online_run_labels_trains_and_its_closed_form_holds_everywhere(wiring, neurons):
    """Run-level guard: a negative onset yields a train wholly before the odour (writes nothing), the anchor point
    reproduces the target, a train after odour offset writes a partial memory, and the printed closed form matches
    the measured drop at every timing and dose point (binary code: the curves are the rule, not the wiring)."""
    from kenyon.experiments import online
    a = argparse.Namespace(subgraph=None, neurons=neurons, wiring=wiring, dt=0.01, odour_dur=2.0, pulses=4, da_onset=0.2,
                           da_freq=2.0, da_width=0.05, tau_elig=0.8, tau_forget=1e9, target=0.9,
                           timing_onsets=[-1.0, 0.2, 2.2], dose_pulses=[0, 2, 4], beta=8.0, seed=0, out=None)
    res = online.run(a); t = res["timing_MBON11"]
    assert t["-1.0"]["relation_to_odour"] == "before odour" and t["-1.0"]["pulses_in_odour"] == 0 and t["-1.0"]["drop_MBON11"] == 0.0
    assert t["-1.0"]["train_s"][1] <= -1.0 + 1e-9
    assert t["0.2"]["relation_to_odour"] == "during odour" and abs(t["0.2"]["drop_MBON11"] - 0.9) < 1e-3      # the anchor
    assert t["2.2"]["relation_to_odour"] == "after odour" and 0.0 < t["2.2"]["drop_MBON11"] < 0.9
    for row in list(t.values()) + list(res["training_amount_MBON11"].values()):
        assert abs(row["drop_MBON11"] - row["closed_form_MBON11"]) < 2e-4
    assert res["mechanism_controls"]["dopamine_alone_no_odour"] == 0.0 and res["mechanism_controls"]["odour_alone_no_dopamine"] == 0.0
    assert res["behaviour_from_timed_teaching"]["T_maze_PI"]["backward_taught"] == 0.0


def test_seeds_aggregate_spans_different_draws(wiring):
    from kenyon.experiments import seeds
    a = argparse.Namespace(wiring=wiring, modalities=["olfactory"], seeds=3, seed=0, out_dir=None)
    s = seeds.run(a)["per_modality"]["olfactory"]
    assert s["paired_A_MBON11"]["n"] == 3 and abs(s["paired_A_MBON11"]["mean"] - 0.9) < 1e-6 and s["paired_A_MBON11"]["sd"] == 0.0
    assert s["unpaired_MBON11_mean"]["sd"] > 0 and s["unpaired_MBON11_worst_odour"]["max"] >= s["unpaired_MBON11_mean"]["max"]
    assert set(s["generalisation_drop_MBON11"]) == {"shared_5_of_6", "shared_4_of_6", "shared_3_of_6", "shared_1_of_6", "shared_0_of_6"}
    assert s["circuit"]["n_drivable_KC"] == N_DRIVABLE


def mag_args(wiring, **over):
    a = argparse.Namespace(subgraph=None, neurons=None, wiring=wiring, target=0.9, odour_dur=1.0, da_width=0.001,
                           dt=0.001, tau_forget=1e9, da_onset=0.2, tau_elig=0.8, taus=[0.1, 0.4, 0.8, 3.2],
                           da_freqs=[0.5, 2.0], rate_sweep=True, dose_pulses=[1, 2, 3, 4, 8],
                           hypothetical_measurements=[0.15, 0.2, 0.3, 0.6], tau_scan=40, eta_max=1e7, seed=0, out=None)
    for k, v in over.items():
        setattr(a, k, v)
    return a


def test_magnitude_scores_each_measured_arm_on_its_own_protocol(wiring):
    """The two Hige arms differ in pulse TIMING as well as count (4 from +0.2 s versus 1 at +0.8 s). Scoring the
    single-pulse arm at +0.2 s instead inverts which rule fits, so pin that each arm uses its own onset."""
    from kenyon.experiments import magnitude
    a = mag_args(wiring)
    assert magnitude.ARMS["single_pulse"]["onset"] == 0.8 and magnitude.ARMS["four_pulse"]["onset"] == 0.2
    r = magnitude.run(a)
    t = r["measured_test_pulse_arms"]
    eta = magnitude.anchor_eta(a.tau_elig, a, a.target)
    at_own = magnitude.arm_drop(eta, a.tau_elig, magnitude.ARMS["single_pulse"], a)
    at_anchor = magnitude.arm_drop(eta, a.tau_elig, magnitude.ARMS["four_pulse"], a, onset=a.da_onset, n=1)
    assert at_own > at_anchor + 0.1                                    # a later pulse rides a charged trace
    assert abs(t["candidates"]["eligibility_trace"]["ratio"] - at_own / a.target) < 1e-3   # scored at +0.8 s, not +0.2
    assert abs(magnitude.arm_drop(eta, a.tau_elig, magnitude.ARMS["four_pulse"], a) - a.target) < 2e-3
    assert "+0.8 s" in t["measured"]["from"] and "+0.2 s" in t["measured"]["from"]


def test_magnitude_scores_three_rules_and_admits_it_cannot_separate_them(wiring):
    from kenyon.experiments import magnitude
    r = magnitude.run(mag_args(wiring))
    t = r["measured_test_pulse_arms"]; c = t["candidates"]
    assert set(c) == {"eligibility_trace", "independent_pulses", "block_is_the_unit"}
    assert c["block_is_the_unit"]["ratio"] == 1.0                       # sections 1-3 have no pulse axis
    assert abs(c["independent_pulses"]["ratio"] - (1 - 0.1 ** 0.25) / 0.9) < 1e-3
    assert t["closest_to_measurement"] == "eligibility_trace"
    assert t["does_it_separate_them"] is False                          # one noisy ratio cannot choose
    assert all(abs(v["z_vs_measured"]) < 2.0 for v in c.values())       # nothing is excluded
    assert len(t["caveats_worst_first"]) >= 5


def test_magnitude_discriminating_experiment_and_inverse(wiring):
    """With the timing held fixed the rules DO separate, the sign test needs a trace slower than the pulse
    interval and pulses that land inside the odour, and the inverse maps a measurement back to a trace constant."""
    from kenyon.experiments import magnitude
    a = mag_args(wiring)
    r = magnitude.run(a)
    d = r["discriminating_experiment_timing_held_fixed"]
    assert d["one_pulse_trace_rule"] < d["one_pulse_independent"] and d["separation"] > 1.5
    assert d["by_tau"]["0.8"]["second_pulse_adds_more_than_first"]
    assert not d["by_tau"]["0.1"]["second_pulse_adds_more_than_first"]
    rates = d["by_tau"]["0.8"]["second_adds_more_by_pulse_rate_hz"]
    assert rates["2"] and not rates["0.5"]                             # at 0.5 Hz most pulses fall outside a 1 s odour
    assert d["sign_test"]["not_unique_to_a_trace"]                     # the test rules OUT independence, not IN a trace
    inv = r["inverse_implied_trace_constant"]
    lo, hi = inv["reachable_band"]
    for m, roots in inv["measured_single_pulse_at_anchor_onset_implies_tau_elig_s"].items():
        if roots is None:
            assert not (lo <= float(m) <= hi)
            continue
        for tau in roots:                                              # each root must reproduce its measurement
            eta = magnitude.anchor_eta(tau, a, a.target)
            got = magnitude.arm_drop(eta, tau, magnitude.ARMS["four_pulse"], a, onset=a.da_onset, n=1)
            assert abs(got - float(m)) < 5e-3
    chk = r["closed_form_vs_full_circuit"]                             # the closed form is exact for a binary code
    assert chk is not None and chk["agrees"] and set(chk["full_circuit"]) == set(magnitude.ARMS)


def test_apl_loop_sparsens_with_gain(wiring):
    from kenyon.experiments.apl import apl_code
    z = np.load(wiring); mb = mb_of(wiring)
    drive = np.asarray(mb.W_pk @ mb.odour([0, 1, 2])).ravel()
    fracs = [float((apl_code(drive, z["kc_apl"].astype(float), z["apl_kc"].astype(float), g, 500) > 0).mean()) for g in (1, 10, 100)]
    assert fracs[0] >= fracs[1] >= fracs[2] and fracs[2] < fracs[0]


def test_olfactory_reexports_the_circuit():
    from kenyon.experiments.olfactory import MushroomBody as viaexp
    assert viaexp is MushroomBody and olfactory.json_safe is json_safe


# ----------------------------------------------------------------------------- package plumbing


def test_kenyon_env_wins_and_the_flybrain_name_is_the_fallback(monkeypatch, tmp_path):
    import kenyon
    monkeypatch.delenv("KENYON_TESTDIR", raising=False); monkeypatch.delenv("FLYBRAIN_TESTDIR", raising=False)
    assert kenyon._env("KENYON_TESTDIR", "FLYBRAIN_TESTDIR", tmp_path / "default") == tmp_path / "default"
    monkeypatch.setenv("FLYBRAIN_TESTDIR", str(tmp_path / "doom"))
    assert kenyon._env("KENYON_TESTDIR", "FLYBRAIN_TESTDIR", tmp_path / "default") == tmp_path / "doom"
    monkeypatch.setenv("KENYON_TESTDIR", str(tmp_path / "kenyon"))
    assert kenyon._env("KENYON_TESTDIR", "FLYBRAIN_TESTDIR", tmp_path / "default") == tmp_path / "kenyon"


def test_resolve_device():
    from kenyon.device import resolve_device
    assert resolve_device("cpu") == "cpu"
    if not torch.cuda.is_available():
        with pytest.raises(RuntimeError):
            resolve_device("cuda:0")


# ----------------------------------------------------------------------------- motor (section 4.8) and plasticity

DN_TYPES = ["DNp52", "DNp62", "DNa02"]


def motor_graph():
    """17 nodes with every piece the motor module reads: 2 clamped inputs, 4 KCs, MBON11 on both sides, an MBON03,
    PPL101, PAM, three DNs, two interneurons and an MBON05 that no dopamine neuron reaches. MBON11 contacts DNp52-L
    with 4 + 4 synapses (one connection from each hemisphere) and DNp62-R with 1: the shape section 4.8 found on the
    unpruned graph. PPL101 gives the two MBON11 cells 12 and 8 synapses (pooled per type to 10 each) and MBON03 a
    stray 1."""
    from kenyon.model.core import build_csc
    types = np.array(["T4a", "T4a", "KCg-m", "KCg-m", "KCab-s", "KCab-s", "MBON11", "MBON11", "MBON03",
                      "PPL101", "PAM01", "DNp52", "DNp62", "DNa02", "X1", "X2", "MBON05"])
    side = np.array(["L", "R", "L", "R", "L", "R", "L", "R", "L", "L", "L", "L", "R", "L", "L", "R", "R"])
    edges = [(0, 2, 5), (1, 3, 5), (0, 4, 5), (1, 5, 5),                              # inputs -> KCs
             (2, 6, 3), (3, 6, 2), (4, 7, 4), (5, 7, 1), (2, 8, 2), (5, 8, 3),        # KC -> MBON (plastic)
             (9, 6, 12), (9, 7, 8), (9, 8, 1), (10, 8, 8),                            # DAN -> MBON
             (6, 11, 4), (7, 11, 4), (7, 12, 1), (8, 13, 2),                          # MBON -> DN
             (6, 14, 3), (14, 13, 5), (15, 12, 2), (13, 15, 1), (14, 9, 1), (15, 10, 1),
             (2, 16, 2), (16, 14, 1)]                                                   # MBON05: plastic input, no dopamine
    m = len(types)
    pre = np.array([e[0] for e in edges]); post = np.array([e[1] for e in edges])
    w = np.array([e[2] for e in edges], np.float32)
    order = np.lexsort((pre, post)); pre, post, w = pre[order], post[order], w[order]
    indptr_post = np.zeros(m + 1, np.int64); np.cumsum(np.bincount(post, minlength=m), out=indptr_post[1:])
    indptr_pre, indices_post, perm = build_csc(indptr_post, pre.astype(np.int32))
    is_clamped = np.zeros(m, bool); is_clamped[:2] = True
    is_output = np.zeros(m, bool); is_output[[11, 13]] = True
    sign = np.ones(m, np.int8); sign[[6, 7]] = -1                                     # MBON11 is GABAergic
    sub = {"node_idx": np.arange(m), "bodyId": 1000 + np.arange(m), "is_clamped": is_clamped, "is_output": is_output,
           "is_dynamic": ~is_clamped, "type_id": np.arange(m, dtype=np.int32), "sign": sign,
           "indptr_post": indptr_post, "indices_pre": pre.astype(np.int32), "weight": w,
           "indptr_pre": indptr_pre, "indices_post": indices_post, "perm_csr_to_csc": perm}
    return sub, types, side


def motor_core(lr=0.9):
    from kenyon.model.core import ConnectomeCore, CoreConfig
    from kenyon.model.plasticity import MushroomBodyPlasticity
    sub, types, side = motor_graph()
    core = ConnectomeCore(sub, CoreConfig(param="per_edge"), backend="reference")
    plas = MushroomBodyPlasticity(core, types, lr=lr, punish_types=("PPL101",), reward_types=("PAM",))
    return sub, types, side, core, plas


def test_direct_contacts_lists_every_readout_to_dn_connection():
    from kenyon.experiments.motor import direct_contacts
    sub, types, side = motor_graph()
    rows = direct_contacts(sub, types, side, np.flatnonzero(types == "MBON11"), np.isin(types, DN_TYPES))
    assert [(r["DN_type"], r["DN_side"], r["from_side"], r["synapses"]) for r in rows] == [
        ("DNp52", "L", "L", 4), ("DNp52", "L", "R", 4), ("DNp62", "R", "R", 1)]   # MBON03 -> DNa02 is not MBON11's


def test_count_template_pools_raw_counts_by_type_and_the_core_template_does_not():
    from kenyon.experiments.motor import count_template
    sub, types, side, core, plas = motor_core()
    d = count_template(core, plas, types, plas.punish_idx).numpy()
    assert d[6] == d[7] == 1.0                                  # 12 and 8 synapses pool to one dose per MBON type
    assert abs(d[8] - 0.1) < 1e-6                               # the stray single synapse onto MBON03: 1 / 10
    assert d[np.setdiff1d(np.arange(len(types)), [6, 7, 8])].sum() == 0      # MBON05 included: no PPL101 input
    core_t = plas.delta_punish.numpy()                          # the log1p edge values flatten that difference
    assert core_t[6] != core_t[7] and core_t[8] > 0.2


def test_cut_direct_edges_silences_exactly_those_edges_and_stays_cut():
    from kenyon.experiments.motor import cut_direct_edges
    sub, types, side, core, plas = motor_core()
    plas.reset(); before = core.edge_values().detach().clone()
    is_dn = np.isin(types, DN_TYPES)
    cut = cut_direct_edges(core, plas, sub, np.flatnonzero(types == "MBON11"), is_dn)
    assert cut == {"applied": True, "n_edges": 3, "synapses": 9}
    hit = torch.as_tensor(np.isin(core.pre_of_edge.numpy(), [6, 7]) & is_dn[core.post_of_edge.numpy()])
    after = core.edge_values().detach()
    assert int(hit.sum()) == 3 and torch.all(after[hit] == 0)
    assert torch.equal(after[~hit], before[~hit])               # MBON11 -> X1 and everything else untouched
    rates = torch.zeros(core.n_nodes); rates[[2, 4]] = 1.0      # a pairing and a reset rewrite only the plastic slots
    plas.reinforce(rates, "punish"); plas.reset()
    assert torch.all(core.edge_values().detach()[hit] == 0)


def test_plasticity_depresses_only_active_kc_edges_into_dosed_mbons_and_recovers():
    sub, types, side, core, plas = motor_core(lr=0.5)
    assert plas.n_plastic == 7                                  # the seven KC -> MBON edges and nothing else
    pre = plas.pre_of_plastic.numpy(); post = plas.post_of_plastic.numpy()
    dosed = plas.delta_punish.numpy()[post] > 0
    plas.reset(); W0 = plas.W.clone()
    rates = torch.zeros(core.n_nodes); rates[[2, 3]] = 1.0      # KCs 2 and 3 fire; KC 2 also feeds the undosed MBON05
    plas.reinforce(rates, "punish")
    moved = (plas.W - W0).abs().numpy() > 1e-9
    assert np.array_equal(moved, np.isin(pre, [2, 3]) & dosed) and bool((plas.W[torch.as_tensor(moved)] < 1).all())
    frozen = np.ones(core.n_edges, bool); frozen[plas.plastic_edge.numpy()] = False
    assert np.all(core.edge_gain.numpy()[frozen] == 1.0)        # the core sees W only on the plastic edges
    plas.W = torch.full((plas.n_plastic,), 0.4)                 # the published rule's silent-cell term:
    plas.reinforce(torch.zeros(core.n_nodes), "punish")         # dopamine alone pulls a depressed synapse back up
    assert float(plas.W[torch.as_tensor(dosed)].min()) > 0.41                   # moved up
    assert torch.allclose(plas.W[torch.as_tensor(~dosed)], torch.tensor(0.4))   # no dopamine at MBON05: unchanged


RESULTS = Path(__file__).resolve().parents[1] / "results"


@pytest.mark.parametrize("name", ["motor2_v5", "motor2_full", "motor2_full_cut"])
def test_verdict_text_regenerates_the_stored_verdicts(name):
    from kenyon.experiments.motor import verdict_text
    path = RESULTS / f"{name}.json"
    if not path.exists():
        pytest.skip(f"{path.name} not present")
    o = json.loads(path.read_text())
    assert verdict_text(o) == o["verdict"]


def test_cell_report_on_a_synthetic_npz(tmp_path):
    from kenyon.experiments.motor import cell_report
    types = np.array(["DNp52", "DNp52", "DNp62", "DNp62", "DNa02", "DNa02", "DNx", "DNx"])
    side = np.array(["L", "R", "L", "R", "L", "R", "L", "R"])
    base = np.full(8, 0.5); dark = base.copy(); dark[0] = 0.51        # the odour lowers DNp52-L by 0.01
    dA = np.array([0.015, 1e-5, 2e-5, 0.004, 1e-3, 5e-4, 1e-5, 0.0])
    p = tmp_path / "m.npz"
    np.savez(p, dn_type=types.astype("U24"), dn_side=side.astype("U8"), s0_dA=dA, s0_base=base, s0_dark=dark)
    r = cell_report(p, 0)
    c = r["cells"]["DNp52-L"]
    assert c["rank_by_abs_change"] == 1 and abs(c["odour_effect_untrained"] + 0.01) < 1e-9
    assert abs(c["odour_effect_after_one_pairing"] - 0.005) < 1e-9 and abs(c["memory_over_odour"] - 1.5) < 1e-9
    assert r["cells"]["DNp62-R"]["rank_by_abs_change"] == 2 and r["named"]["DNa02-L"]["rank_by_abs_change"] == 3
    assert r["memory"]["n_gt_1pct_of_rate"] == 1 and r["memory"]["n_gt_half_pct_of_rate"] == 2
    assert r["odour_itself"]["n_gt_1pct_of_no_odour_rate"] == 1
    assert abs(r["frac_DN_where_memory_exceeds_odour"] - 7 / 8) < 1e-9   # every cell but the last, where both are 0
    with pytest.raises(ValueError):
        cell_report(p, 3)


def test_cell_report_reproduces_the_section_4_8_figures():
    """The per-cell sentences of section 4.8 come from results/motor2_full.npz, odour draw 0."""
    from kenyon.experiments.motor import cell_report
    path = RESULTS / "motor2_full.npz"
    if not path.exists():
        pytest.skip(f"{path.name} not present")
    r = cell_report(path, 0)
    p52 = r["cells"]["DNp52-L"]
    assert round(p52["odour_effect_untrained"], 3) == -0.014 and round(p52["odour_effect_after_one_pairing"], 3) == 0.001
    assert round(p52["memory_over_odour"], 1) == 1.1 and p52["rank_by_abs_change"] == 1
    assert round(p52["memory_frac_of_own_rate"], 3) == 0.028 and round(r["cells"]["DNp62-R"]["memory_frac_of_own_rate"], 4) == 0.0095
    assert r["memory"]["n_gt_half_pct_of_rate"] == 2 and r["memory"]["n_gt_1pct_of_rate"] == 1
    assert round(r["frac_DN_where_memory_exceeds_odour"], 2) == 0.12
    o = r["odour_itself"]
    assert o["n_gt_5pct_of_no_odour_rate"] == 0 and o["n_gt_1pct_of_no_odour_rate"] == 19
    assert round(o["median_frac_of_no_odour_rate"] * 100, 3) == 0.013
    n = r["named"]
    assert (n["DNa02-L"]["rank_by_abs_change"], n["DNa02-R"]["rank_by_abs_change"], n["DNa03-R"]["rank_by_abs_change"]) == (13, 19, 66)
    assert (round(n["DNa02-L"]["memory_frac_of_own_rate"] * 100, 2), round(n["DNa02-R"]["memory_frac_of_own_rate"] * 100, 2),
            round(n["DNa03-R"]["memory_frac_of_own_rate"] * 100, 2)) == (0.14, 0.10, 0.07)


def test_present_with_kc_pins_the_kenyon_cells_every_substep():
    """3.2 and 4.8 inject the feedforward Kenyon code into the recurrent core; it must hold through every substep."""
    from kenyon.experiments.embed import present_with_kc
    sub, types, side, core, plas = motor_core()
    kc = torch.tensor([2, 3, 4, 5])
    r = present_with_kc(core, kc, torch.tensor([1.0, 0.0, 1.0, 0.0]), decisions=3, device="cpu")
    assert r.shape == (core.n_nodes,) and bool(torch.isfinite(r).all())
    assert torch.allclose(r[kc], torch.tensor([1.0, 0.0, 1.0, 0.0]), atol=1e-5)
    assert core.cfg.K > 1                                       # the substep count is restored afterwards
