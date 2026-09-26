// Parity with the Python model: every golden scenario in public/data/fixtures.json is replayed through the JS
// engine from circuit.json alone.
//
// Required:
//   - the Kenyon-cell sets are identical (exact);
//   - every MBON drive, before and after learning, matches within 1e-9 (relative, floor 1). The fixture prints
//     float32 values with 9 significant digits, which round-trips, so each expected value is taken through
//     Math.fround first; the engine reproduces torch's float32 arithmetic, so in practice the match is bit-exact;
//   - the learning rate the engine calibrates is the same double the fixture recorded;
//   - weight summaries: counts exact, min / max exact, sum within 1e-9 relative.
// Derived readouts (drops, shares, overlaps, scores, choice probabilities, T-maze index, closed forms, cosines)
// are float32 in Python and double here; they must agree within DERIVED_TOL (absolute), far below any digit
// the site shows. The measured maxima are printed at the end.

import { describe, it, expect, afterAll } from 'vitest';
import { circuit, fixtures } from './load.js';
import { MushroomBody } from '../src/engine/model.js';
import { drop, shareOfLostDrive, normOf, score, choiceProbability, tmaze } from '../src/engine/readout.js';

const MBON_REL_TOL = 1e-9;
const DERIVED_TOL = 1e-6;

const C = circuit();
const FX = fixtures();
const LIB = FX.odours;
const VAL = C.mbon.valence;

const stats = {
  scenarios: 0, kcSets: 0, kcMismatches: 0, mbonValues: 0, mbonBitExact: 0, mbonMaxRel: 0,
  lrExact: 0, lrChecked: 0, derived: {},
};

function note(kind, diff) {
  stats.derived[kind] = Math.max(stats.derived[kind] ?? 0, diff);
}

function modelFor(m, lrOverride) {
  return new MushroomBody(C, {
    modality: m.modality,
    sparsity: m.sparsity,
    lr: lrOverride ?? m.lr,
    recoverRate: m.recover_rate,
    wMax: m.w_max,
    silencedKcTypePrefixes: m.silenced_kc_type_prefixes || [],
    deltaPunish: m.delta_punish_override,
    deltaReward: m.delta_reward_override,
  });
}

/** Calibrate lr the way the fixture says it was calibrated, and require the same double. */
function checkLr(m, errors) {
  const hit = /calibrate_lr on odour (\S+?)(?:,| in)/.exec(m.lr_source || '');
  if (!hit) {
    errors.push(`no calibration source in "${m.lr_source}"`);
    return;
  }
  const intact = /INTACT/.test(m.lr_source);
  const mb = intact ? new MushroomBody(C, { modality: m.modality }) : modelFor(m, 0.9);
  const code = mb.kcCode(LIB[hit[1]].channels);
  const lr = mb.calibrateLr(code, mb.compartmentMask('punish'), 0.9, 'punish');
  stats.lrChecked++;
  if (lr === m.lr) stats.lrExact++;
  else errors.push(`lr ${lr} != fixture ${m.lr}`);
  if (Math.fround(lr) !== Math.fround(0.9)) errors.push(`calibrated lr ${lr} is not 0.9 in float32`);
}

function cmpMbon(got, want, ctx, errors) {
  if (got.length !== want.length) {
    errors.push(`${ctx}: ${got.length} MBONs, want ${want.length}`);
    return;
  }
  for (let m = 0; m < want.length; m++) {
    const w = Math.fround(want[m]);
    const rel = Math.abs(got[m] - w) / Math.max(1, Math.abs(w));
    stats.mbonValues++;
    if (got[m] === w) stats.mbonBitExact++;
    stats.mbonMaxRel = Math.max(stats.mbonMaxRel, rel);
    if (!(rel <= MBON_REL_TOL)) errors.push(`${ctx} MBON ${m}: ${got[m]} vs ${want[m]} (rel ${rel.toExponential(2)})`);
  }
}

function cmp(kind, got, want, ctx, errors) {
  if (want === null || want === undefined) {
    if (got !== null && got !== undefined && Number.isFinite(got)) errors.push(`${ctx}: got ${got}, want null`);
    return;
  }
  if (got === null || got === undefined || !Number.isFinite(got)) {
    errors.push(`${ctx}: got ${got}, want ${want}`);
    return;
  }
  const d = Math.abs(got - want);
  note(kind, d);
  if (!(d <= DERIVED_TOL)) errors.push(`${ctx}: ${got} vs ${want} (diff ${d.toExponential(2)})`);
}

function cmpKc(active, want, ctx, errors) {
  stats.kcSets++;
  const same = active.length === want.length && want.every((v, i) => active[i] === v);
  if (!same) {
    stats.kcMismatches++;
    errors.push(`${ctx}: Kenyon-cell set differs (${active.length} vs ${want.length} cells)`);
  }
}

function cosineMeanOffdiag(codes) {
  const sets = codes.map((c) => {
    const s = [];
    for (let i = 0; i < c.length; i++) if (c[i]) s.push(i);
    return new Set(s);
  });
  let sum = 0, n = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = 0; j < sets.length; j++) {
      if (i === j) continue;
      let inter = 0;
      for (const x of sets[i]) if (sets[j].has(x)) inter++;
      sum += inter / ((Math.sqrt(sets[i].size) + 1e-9) * (Math.sqrt(sets[j].size) + 1e-9));
      n++;
    }
  }
  return sum / n;
}

function replayTrainProbe(sc, errors) {
  const m = sc.model;
  const mb = modelFor(m);
  if (mb.k !== m.k) errors.push(`k ${mb.k} != fixture ${m.k}`);
  checkLr(m, errors);
  const m11 = mb.typeMask('MBON11');
  const cp = mb.compartmentMask('punish');
  const cr = mb.compartmentMask('reward');
  if (m.punish_compartment_types) expect(mb.typesIn(cp)).toEqual(m.punish_compartment_types);
  if (m.reward_compartment_types) expect(mb.typesIn(cr)).toEqual(m.reward_compartment_types);

  const probes = sc.probes;
  const names = [...new Set([...probes, ...sc.train.filter((s) => s.odour).map((s) => s.odour)])];
  const enc = {};
  for (const n of names) enc[n] = mb.encode(LIB[n].channels);
  for (const p of probes) cmpKc(enc[p].active, sc.kc[p], `kc ${p}`, errors);

  const before = {};
  for (const p of probes) before[p] = mb.mbonResponse(enc[p].code);
  for (const p of probes) cmpMbon(before[p], sc.mbon_before[p], `before ${p}`, errors);
  const norm = normOf(probes.map((p) => before[p]));
  if (Math.fround(norm) !== Math.fround(sc.norm)) errors.push(`norm ${norm} vs ${sc.norm}`);
  const s0 = Object.fromEntries(probes.map((p) => [p, score(before[p], VAL, norm)]));
  for (const p of probes) cmp('score', s0[p], sc.scores_before[p], `score_before ${p}`, errors);

  const ovRef = sc.overlap_MBON11_with;
  if (ovRef) {
    for (const p of probes) cmp('overlap', mb.overlap(enc[ovRef].code, enc[p].code, m11), sc.overlap_MBON11[p], `overlap ${p}`, errors);
  }
  if (sc.kc_cosine_mean_offdiag !== undefined) {
    cmp('cosine', cosineMeanOffdiag(probes.map((p) => enc[p].code)), sc.kc_cosine_mean_offdiag, 'kc cosine', errors);
  }

  const cps = new Map(sc.checkpoints.map((r) => [r.after_steps, r]));
  const check = (r) => {
    const tag = `step ${r.after_steps}`;
    const after = {};
    for (const p of probes) after[p] = mb.mbonResponse(enc[p].code);
    const s1 = Object.fromEntries(probes.map((p) => [p, score(after[p], VAL, norm)]));
    for (const p of probes) {
      cmpMbon(after[p], r.mbon_after[p], `${tag} after ${p}`, errors);
      cmp('drop', drop(before[p], after[p], m11), r.drop_MBON11[p], `${tag} drop_MBON11 ${p}`, errors);
      cmp('drop', drop(before[p], after[p], cp), r.drop_punish_compartment[p], `${tag} drop_punish ${p}`, errors);
      cmp('drop', drop(before[p], after[p], cr), r.drop_reward_compartment[p], `${tag} drop_reward ${p}`, errors);
      cmp('share', shareOfLostDrive(before[p], after[p], m11), r.share_of_lost_drive_in_MBON11[p], `${tag} share ${p}`, errors);
      cmp('score', s1[p], r.scores_after[p], `${tag} score_after ${p}`, errors);
      if (r.closed_form_MBON11) {
        cmp('closed_form', mb.analyticDrop(enc[ovRef].code, enc[p].code, m11, r.after_steps, 'punish'),
          r.closed_form_MBON11[p], `${tag} closed form ${p}`, errors);
      }
    }
    for (const ch of r.choices) {
      cmp('P', choiceProbability(s0[ch.x], s0[ch.y], ch.beta), ch.P_before, `${tag} P_before ${ch.x}>${ch.y} b${ch.beta}`, errors);
      cmp('P', choiceProbability(s1[ch.x], s1[ch.y], ch.beta), ch.P_after, `${tag} P_after ${ch.x}>${ch.y} b${ch.beta}`, errors);
    }
    const ws = mb.weightSummary();
    if (ws.nChanged !== r.W.n_changed) errors.push(`${tag} W changed ${ws.nChanged} vs ${r.W.n_changed}`);
    if (ws.nBelow099 !== r.W['n_below_0.99']) errors.push(`${tag} W below 0.99 ${ws.nBelow099} vs ${r.W['n_below_0.99']}`);
    if (ws.min !== Math.fround(r.W.min)) errors.push(`${tag} W min ${ws.min} vs ${r.W.min}`);
    if (ws.max !== Math.fround(r.W.max)) errors.push(`${tag} W max ${ws.max} vs ${r.W.max}`);
    const relSum = Math.abs(ws.sum - r.W.sum) / Math.max(1, Math.abs(r.W.sum));
    note('W_sum_rel', relSum);
    if (!(relSum <= 1e-9)) errors.push(`${tag} W sum ${ws.sum} vs ${r.W.sum}`);
  };

  if (cps.has(0)) check(cps.get(0));
  sc.train.forEach((st, i) => {
    mb.reinforce(st.odour ? enc[st.odour].code : null, st.us, st.strength);
    if (cps.has(i + 1)) check(cps.get(i + 1));
  });

  // the extras are computed on the trained circuit, after the last step
  const graded = (block, fullDrop) => {
    for (const [level, rec] of Object.entries(block)) {
      const ds = [], ovs = [];
      rec.odours.forEach((ch, j) => {
        const code = mb.kcCode(ch);
        const d = drop(mb.untrainedResponse(code), mb.mbonResponse(code), m11);
        const o = mb.overlap(enc.A.code, code, m11);
        ds.push(d);
        ovs.push(o);
        cmp('drop', d, rec.drop_MBON11[j], `${level} odour ${j} drop`, errors);
        cmp('overlap', o, rec.overlap_MBON11[j], `${level} odour ${j} overlap`, errors);
      });
      const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
      cmp('drop', mean(ds), rec.mean_drop_MBON11, `${level} mean drop`, errors);
      cmp('overlap', mean(ovs), rec.mean_overlap_MBON11, `${level} mean overlap`, errors);
      if (rec.mean_recall_fraction !== undefined) cmp('drop', mean(ds) / fullDrop, rec.mean_recall_fraction, `${level} recall fraction`, errors);
    }
  };
  if (sc.ladder_20_per_level) graded(sc.ladder_20_per_level);
  if (sc.partial_cue_20_per_level) {
    const full = drop(mb.untrainedResponse(enc.A.code), mb.mbonResponse(enc.A.code), m11);
    graded(sc.partial_cue_20_per_level, full);
  }
}

function replayTmaze(sc, errors) {
  const m = sc.model;
  const mb = modelFor(m);
  if (mb.k !== m.k) errors.push(`k ${mb.k} != fixture ${m.k}`);
  checkLr(m, errors);
  const odours = sc.norm_odours;
  expect([odours[0], odours[1]]).toEqual(sc.pair);
  const enc = odours.map((o) => mb.encode(LIB[o].channels));
  const betas = Object.keys(sc.by_beta).map(Number);
  const res = tmaze(mb, enc.map((e) => e.code), { betas, pairings: sc.pairings });
  if (Math.fround(res.norm) !== Math.fround(sc.norm)) errors.push(`norm ${res.norm} vs ${sc.norm}`);
  odours.forEach((o, i) => {
    cmp('score', res.scoresNaive[i], sc.scores_naive[o], `naive ${o}`, errors);
    cmp('score', res.scoresAfterPunishingA[i], sc.scores_after_punishing_pair0[o], `after pair0 ${o}`, errors);
    cmp('score', res.scoresAfterPunishingB[i], sc.scores_after_punishing_pair1[o], `after pair1 ${o}`, errors);
  });
  cmp('score', res.learnedScoreShift.A, sc.learned_score_shift.pair0, 'shift pair0', errors);
  cmp('score', res.learnedScoreShift.B, sc.learned_score_shift.pair1, 'shift pair1', errors);
  for (const b of betas) {
    const want = sc.by_beta[String(b)];
    cmp('PI', res.byBeta[b].PI, want.PI, `PI beta ${b}`, errors);
    cmp('P', res.byBeta[b].innateBiasAvsB, want.innate_bias_A_vs_B, `innate bias beta ${b}`, errors);
    cmp('P', res.byBeta[b].PChoosePunishedAvsB, want.P_choose_punished_A_vs_B, `P punished beta ${b}`, errors);
  }
  // the T-maze must not disturb the model's weights
  const ws = mb.weightSummary();
  if (ws.nChanged !== 0) errors.push('tmaze left the weights changed');
}

describe('golden fixtures (Python model, torch float32) replayed by the JS engine', () => {
  it('has all 21 scenarios', () => {
    expect(FX.format).toBe('kenyon-web-fixtures/1');
    expect(FX.scenarios.length).toBe(21);
  });

  for (const sc of FX.scenarios) {
    it(`${sc.id} (${sc.kind})`, () => {
      const errors = [];
      if (sc.kind === 'train_probe') replayTrainProbe(sc, errors);
      else if (sc.kind === 'tmaze') replayTmaze(sc, errors);
      else errors.push(`unknown kind ${sc.kind}`);
      stats.scenarios++;
      expect(errors.slice(0, 20)).toEqual([]);
    });
  }

  it('matched every Kenyon-cell set and every MBON drive bit for bit', () => {
    expect(stats.kcSets).toBeGreaterThanOrEqual(124);
    expect(stats.kcMismatches).toBe(0);
    expect(stats.mbonValues).toBeGreaterThan(0);
    expect(stats.mbonMaxRel).toBeLessThanOrEqual(MBON_REL_TOL);
    expect(stats.lrExact).toBe(stats.lrChecked);
  });
});

afterAll(() => {
  const d = Object.fromEntries(Object.entries(stats.derived).map(([k, v]) => [k, Number(v.toExponential(2))]));
  // eslint-disable-next-line no-console
  console.log(`[parity] scenarios ${stats.scenarios}; KC sets ${stats.kcSets} (mismatches ${stats.kcMismatches}); ` +
    `MBON values ${stats.mbonValues}, bit-exact ${stats.mbonBitExact}, max rel ${stats.mbonMaxRel.toExponential(2)}; ` +
    `lr exact ${stats.lrExact}/${stats.lrChecked}; derived max abs diff ${JSON.stringify(d)}`);
});
