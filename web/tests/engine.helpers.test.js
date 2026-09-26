// The helpers the UI uses: circuit loading, preset odours, controls, the Simulation's per-step frames, and the
// headline numbers with their status labels.

import { describe, it, expect } from 'vitest';
import { circuit, fixtures, readJson } from './load.js';
import {
  MushroomBody, Simulation, PRESET_ODOURS, PRESET_GROUPS, presetOdour, randomOdour, similarOdour, partialOdour,
  sharedChannels, makeRng, shuffledMapSeed0, shuffledMapRandom, computeHeadlines, STATUS,
  STATUS_MEANING, roundHalfEven, loadCircuit, drop,
} from '../src/engine/index.js';

const C = circuit();
const FX = fixtures();
const byId = Object.fromEntries(FX.scenarios.map((s) => [s.id, s]));

describe('circuit', () => {
  it('has the populations and wiring of the export report', () => {
    expect(C.pn.n).toBe(220);
    expect(C.glomeruli.length).toBe(50);
    expect(C.vpn.n).toBe(252);
    expect(C.visualChannels.length).toBe(101);
    expect(C.kc.n).toBe(4064);
    expect(C.kc.nDrivable).toEqual({ olfactory: 3755, visual: 332 });
    expect(C.mbon.n).toBe(97);
    expect(C.dan.n).toBe(332);
    expect(C.dan.punishIdx.length).toBe(2); // PPL101, both sides
    expect(C.dan.rewardIdx.length).toBe(316); // PAM
    expect(C.nEdges).toBe(61210);
    expect(C.weights.pnKc.counts.length).toBe(20300);
    expect(C.weights.vpnKc.counts.length).toBe(1616);
    expect(C.weights.danMbon.counts.length).toBe(3123);
    expect(Array.from(C.mbon11)).toEqual([5, 11]);
    expect(C.mbon11.every((i) => C.mbon.type[i] === 'MBON11')).toBe(true);
  });

  it('computes k and the compartments as the Python model does', () => {
    const olf = new MushroomBody(C);
    const vis = new MushroomBody(C, { modality: 'visual' });
    expect(olf.k).toBe(C.constants.kwta_k.olfactory);
    expect(vis.k).toBe(C.constants.kwta_k.visual);
    expect(new MushroomBody(C, { sparsity: 1.0 }).k).toBe(3755);
    expect(olf.typesIn(olf.compartmentMask('punish'))).toEqual(C.constants.punish_compartment_types);
    expect(olf.typesIn(olf.compartmentMask('reward'))).toEqual(C.constants.reward_compartment_types);
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(roundHalfEven(187.75)).toBe(188);
  });

  it('loads through fetch', async () => {
    const json = readJson('circuit.json');
    const fake = async () => ({ ok: true, json: async () => json });
    const c = await loadCircuit('data/circuit.json', fake);
    expect(c.nEdges).toBe(61210);
  });
});

describe('the parity check is sharp (it can fail)', () => {
  it('plain double arithmetic in the learning rule misses the 1e-9 bar', () => {
    const sc = byId.S02_punish_A_once;
    const mb = new MushroomBody(C, { lr: sc.model.lr });
    const code = mb.kcCode(FX.odours.A.channels);
    // the rule without float32 rounding
    const { indptr, kc } = C.weights.kcMbon;
    const W = new Float64Array(C.nEdges).fill(1);
    for (let m = 0; m < mb.nMbon; m++) {
      for (let e = indptr[m]; e < indptr[m + 1]; e++) {
        W[e] = Math.min(2, Math.max(0, W[e] - sc.model.lr * mb.deltaPunish[m] * (code[kc[e]] + (W[e] - 1))));
      }
    }
    const got = mb.mbonResponse(code, W);
    const want = sc.checkpoints[0].mbon_after.A;
    const worst = Math.max(...want.map((w, m) => Math.abs(got[m] - Math.fround(w)) / Math.max(1, Math.abs(w))));
    expect(worst).toBeGreaterThan(1e-9);
  });

  it('ignoring the tie-break rank changes some Kenyon-cell set', () => {
    const mb = new MushroomBody(C);
    const saved = C.kc.tiebreakRank;
    let differs = 0;
    try {
      C.kc.tiebreakRank = Int32Array.from(saved, (_, i) => i);
      for (const L of 'ABCDEFGH') {
        const a = Array.from(mb.encode(FX.odours[L].channels).active);
        if (JSON.stringify(a) !== JSON.stringify(byId.S01_naive_codes.kc[L])) differs++;
      }
    } finally {
      C.kc.tiebreakRank = saved;
    }
    expect(differs).toBeGreaterThan(0);
  });
});

describe('preset odours and controls', () => {
  it('are exactly the odours of fixtures.json', () => {
    expect(Object.keys(PRESET_ODOURS).sort()).toEqual(Object.keys(FX.odours).sort());
    for (const [name, o] of Object.entries(FX.odours)) {
      const p = presetOdour(C, name);
      expect(p.channels).toEqual(o.channels);
      expect(p.names).toEqual(o.names);
      expect(p.modality).toBe(o.modality);
    }
    for (const s of [5, 4, 3, 1, 0]) {
      expect(sharedChannels(presetOdour(C, 'A'), presetOdour(C, `A_share${s}`))).toBe(s);
    }
    for (const g of Object.values(PRESET_GROUPS)) for (const n of g) expect(PRESET_ODOURS[n]).toBeTruthy();
  });

  it('draws random, similar and partial odours with a seeded generator', () => {
    const A = presetOdour(C, 'A');
    const r1 = randomOdour(C, { rng: makeRng(7) });
    const r2 = randomOdour(C, { rng: makeRng(7) });
    expect(r1.channels).toEqual(r2.channels);
    expect(r1.channels.length).toBe(6);
    expect(r1.note).toMatch(/not one of the results/);
    for (const s of [5, 4, 3, 1, 0]) {
      const o = similarOdour(C, A, s, { rng: makeRng(s + 1) });
      expect(o.channels.length).toBe(6);
      expect(sharedChannels(A, o)).toBe(s);
    }
    const p = partialOdour(C, A, 3, { rng: makeRng(3) });
    expect(p.channels.length).toBe(3);
    expect(sharedChannels(A, p)).toBe(3);
    const v = randomOdour(C, { modality: 'visual', rng: makeRng(1) });
    expect(v.channels.every((c) => c < C.visualChannels.length)).toBe(true);
  });

  it('the shuffled map is the fixtures\' own shuffle', () => {
    const { deltaPunish, deltaReward } = shuffledMapSeed0(C);
    for (const id of ['S15_control_shuffled_map_tmaze', 'S16_control_shuffled_map_multi']) {
      const m = byId[id].model;
      expect(Array.from(deltaPunish)).toEqual(m.delta_punish_override.map(Math.fround));
      expect(Array.from(deltaReward)).toEqual(m.delta_reward_override.map(Math.fround));
    }
    const mb = new MushroomBody(C, shuffledMapSeed0(C));
    expect(mb.typesIn(mb.compartmentMask('punish'))).toEqual(['MBON10']);
    const fresh = shuffledMapRandom(C, makeRng(3));
    expect(fresh.deltaPunish.length).toBe(97);
    // a permutation of the per-type doses: the same multiset of type values
    const perType = (d) => [...new Set(C.mbon.type)].map((t) => d[C.mbon.type.indexOf(t)]).sort();
    expect(perType(fresh.deltaPunish)).toEqual(perType(C.mbon.deltaPunish));
  });
});

describe('Simulation (per-step state for the animation)', () => {
  it('pairs an odour with punishment and reports each step', () => {
    const sim = new Simulation(C, { odours: PRESET_GROUPS.walkthrough });
    const { frames } = sim.pair('A', 'punish');
    expect(frames.map((f) => f.kind)).toEqual(['odour', 'dopamine', 'plasticity', 'after']);
    const [odour, dopamine, plasticity, after] = frames;
    expect(odour.pnActive.length).toBeGreaterThan(0);
    expect(odour.pnActive.every((j) => FX.odours.A.channels.includes(C.pn.channel[j]))).toBe(true);
    expect(Array.from(odour.kcActive)).toEqual(byId.S12_walkthrough_punish_A.kc.A);
    expect(dopamine.danActive.length).toBe(2);
    expect(Array.from(dopamine.danActive).every((i) => C.dan.type[i] === 'PPL101')).toBe(true);
    expect(Array.from(dopamine.mbonTargeted).map((i) => C.mbon.type[i])).toEqual(['MBON11', 'MBON11']);
    expect(plasticity.synapsesChanged).toBe(byId.S12_walkthrough_punish_A.checkpoints[0].W.n_changed);
    expect(plasticity.weightChangeByMbon[5]).toBeLessThan(0);
    expect(after.readout.dropMBON11).toBeCloseTo(0.9, 6); // the CALIBRATION
    expect(after.mbonDrive[5]).toBe(Math.fround(byId.S12_walkthrough_punish_A.checkpoints[0].mbon_after.A[5]));
    const ch = sim.choice('B', 'A', 8);
    expect(ch.status).toBe(STATUS.MODELLED_CHOICE);
    const want = byId.S12_walkthrough_punish_A.checkpoints[0].choices.find((c) => c.x === 'B' && c.y === 'A' && c.beta === 8);
    expect(Math.abs(ch.P - want.P_after)).toBeLessThan(1e-6);
    expect(Math.abs(ch.PUntrained - want.P_before)).toBeLessThan(1e-6);
  });

  it('reward frames use the PAM cells and land in MBON03/05/06', () => {
    const sim = new Simulation(C, { odours: PRESET_GROUPS.walkthrough });
    const { frames } = sim.pair('C', 'reward');
    const dopamine = frames.find((f) => f.kind === 'dopamine');
    expect(dopamine.danActive.length).toBe(316);
    expect(new Set(Array.from(dopamine.mbonTargeted).map((i) => C.mbon.type[i]))).toEqual(new Set(['MBON03', 'MBON05', 'MBON06']));
  });

  it('dopamine alone changes nothing; reset and undo restore the weights', () => {
    const sim = new Simulation(C, { odours: PRESET_GROUPS.eight });
    const { frames } = sim.pair(null, 'punish');
    expect(frames.map((f) => f.kind)).toEqual(['dopamine', 'plasticity']);
    expect(frames[1].synapsesChanged).toBe(0);
    sim.pair('A', 'punish');
    sim.pair('B', 'punish');
    const afterAB = sim.readout('A').dropMBON11;
    const S06 = byId.S06_punish_A_then_B.checkpoints[0].drop_MBON11.A;
    expect(Math.abs(afterAB - S06)).toBeLessThan(1e-6); // NEGATIVE: B overwrote most of A
    sim.undo();
    expect(sim.readout('A').dropMBON11).toBeCloseTo(0.9, 6);
    sim.reset();
    expect(sim.mb.weightSummary().nChanged).toBe(0);
    expect(sim.history.length).toBe(0);
  });

  it('runs the T-maze without touching the session', () => {
    const sim = new Simulation(C, { odours: PRESET_GROUPS.eight });
    sim.pair('C', 'reward');
    const before = sim.mb.getWeights();
    const t = sim.tmaze('A', 'B', { betas: [8] });
    expect(Math.abs(t.byBeta[8].PI - byId.S11_tmaze_A_B_8odours.by_beta['8'].PI)).toBeLessThan(1e-6);
    expect(sim.mb.getWeights()).toEqual(before);
  });

  it('supports the visual pathway, the controls and the lesions', () => {
    const vis = new Simulation(C, { modality: 'visual' });
    const f = vis.pair('vA', 'punish').frames;
    expect(Array.from(f[0].kcActive)).toEqual(byId.S19_visual_punish_A.kc.vA);
    expect(f[0].pnActive.every((j) => FX.odours.vA.channels.includes(C.vpn.channel[j]))).toBe(true);
    expect(() => vis.addOdour('A')).toThrow();
    const shuf = new Simulation(C, { condition: 'shuffled_map', odours: PRESET_GROUPS.eight });
    expect(shuf.mb.typesIn(shuf.masks.punish)).toEqual(['MBON10']);
    const apl = new Simulation(C, { condition: 'APL_disinhibited', odours: PRESET_GROUPS.walkthrough });
    expect(apl.present('A').kcActive.length).toBe(byId.S17_lesion_APL_dense_code.kc.A.length);
    const kcgm = new Simulation(C, { condition: 'KCg-m_silenced', odours: PRESET_GROUPS.walkthrough });
    expect(Array.from(kcgm.present('A').kcActive)).toEqual(byId.S18_lesion_KCgm_silenced.kc.A);
    const rule = new Simulation(C, { condition: 'no_recovery' });
    expect(rule.recoveryStatus).toMatch(/RULE CHANGE/);
  });
});

describe('headline numbers', () => {
  const h = computeHeadlines(C);
  const item = (id) => h.items.find((x) => x.id === id);
  const S02 = byId.S02_punish_A_once.checkpoints[0];

  it('labels the 0.90 as a calibration, not a result', () => {
    expect(item('paired_drop').status).toBe(STATUS.CALIBRATION);
    expect(item('paired_drop').value).toBeCloseTo(0.9, 6);
    expect(item('paired_drop').note).toMatch(/Not a result/);
  });

  it('computes the wiring results of the seed-0 draw', () => {
    const u = item('unpaired_drop');
    expect(u.status).toBe(STATUS.WIRING);
    for (const L of 'BCDEFGH') expect(Math.abs(u.perOdour[L] - S02.drop_MBON11[L])).toBeLessThan(1e-6);
    expect(u.value).toBeCloseTo(0.1303, 4);
    expect(item('share_on_MBON11').value).toBeCloseTo(0.9667, 4);
    const lad = item('generalisation').value;
    [0.66940999, 0.461284637, 0.288888931, 0.135676324, 0.0724576712].forEach((v, i) => expect(Math.abs(lad[i] - v)).toBeLessThan(1e-6));
    const [a, c] = item('coexistence').value;
    expect(a).toBeCloseTo(0.8518, 4);
    expect(c).toBeCloseTo(0.6916, 4);
    expect(item('reward').rewardCompartments).toEqual(['MBON03', 'MBON05', 'MBON06']);
  });

  it('reports the negatives', () => {
    const o = item('overwrite');
    expect(o.status).toBe(STATUS.NEGATIVE);
    expect(o.dropA).toBeCloseTo(0.1536, 4);
    expect(o.value).toBeCloseTo(0.1536 / 0.9, 3);
    const p = item('partial_cue');
    expect(p.status).toBe(STATUS.NEGATIVE);
    expect(Math.abs(p.value - 0.9 * p.overlap)).toBeLessThan(1e-6); // recall = overlap: no completion
  });

  it('keeps the choice, control and lesion numbers of the results', () => {
    expect(item('tmaze').status).toBe(STATUS.FITTED);
    expect(item('tmaze').value[8]).toBeCloseTo(0.3545, 4);
    const [real, shuf] = item('shuffled_map_control').value;
    expect(real).toBeCloseTo(0.3545, 4);
    expect(shuf).toBeCloseTo(0.0203, 4);
    expect(item('shuffled_map_control').punishLandsOn).toEqual(['MBON10']);
    const [intact, apl] = item('lesion_APL').value;
    expect(intact).toBeCloseTo(0.0821, 4);
    expect(apl).toBeCloseTo(0.4123, 4);
    expect(item('lesion_KCgm').value).toBeCloseTo(0.82, 2);
    const m = item('multi_memory_choices');
    expect(m.status).toBe(STATUS.MODELLED_CHOICE);
    expect(m.value['C over A'][1]).toBeGreaterThan(m.value['C over A'][0]);
  });

  it('leaves the body effect to the stored results (the engine has no descending neurons)', () => {
    // the page reads the body effect from results/motor*.json (tests/results.test.js checks those values)
    expect(h.items.find((i) => i.id === 'body_effect')).toBeUndefined();
    for (const s of Object.values(STATUS)) expect(STATUS_MEANING[s]).toBeTruthy();
  });

  it('never claims a fly did it', () => {
    const text = JSON.stringify(h) + JSON.stringify(STATUS_MEANING);
    expect(text).not.toMatch(/the fly avoids|the fly learns|recorded from/i);
  });
});

describe('closed forms', () => {
  it('one pairing from rest: drop = 0.9 x overlap at MBON11 (binary code)', () => {
    const mb = new MushroomBody(C);
    const a = mb.kcCode(FX.odours.A.channels);
    const m11 = mb.typeMask('MBON11');
    const probes = 'BCDEFGH'.split('').map((L) => mb.kcCode(FX.odours[L].channels));
    const before = probes.map((c) => mb.untrainedResponse(c));
    mb.reinforce(a, 'punish');
    probes.forEach((c, i) => {
      expect(Math.abs(drop(before[i], mb.mbonResponse(c), m11) - 0.9 * mb.overlap(a, c, m11))).toBeLessThan(1e-6);
    });
  });
});
