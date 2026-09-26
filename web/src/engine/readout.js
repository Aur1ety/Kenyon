// Readouts of the model: memory at the MBONs, the modelled choice, and the reciprocal T-maze index.
//
// The choice is read through a published rule of thumb (Aso et al. 2014: GABA or acetylcholine MBONs mean
// approach, glutamate means avoid) and one FITTED motor gain beta (8 in the tables, 11 in the walkthrough and
// video). It is a modelled choice, not the simulated descending neurons and not a fly's behaviour.
//
// Readouts are computed in double precision from the model's float32 MBON drives; they agree with the Python
// outputs to float32 rounding (see tests/engine.parity.test.js for the measured differences).

import { sigmoid, maskedSum } from './numeric.js';

/** Response-weighted fractional drop over the MBONs in `mask` (MB 235-238); null when they carry no drive. */
export function drop(before, after, mask) {
  const b = maskedSum(before, mask);
  if (!(b > 0)) return null;
  return 1 - maskedSum(after, mask) / b;
}

/** Share of all the drive an odour lost (before - after, over every MBON) that was lost at `mask`. */
export function shareOfLostDrive(before, after, mask) {
  let tot = 0, part = 0;
  for (let m = 0; m < before.length; m++) {
    const lost = before[m] - after[m];
    tot += lost;
    if (mask[m]) part += lost;
  }
  return tot > 1e-6 ? part / tot : null;
}

/** N = mean over the odour set of sum_m |r_m| on the UNTRAINED circuit (behaviour.py 77-78). */
export function normOf(untrainedResponses) {
  let s = 0;
  for (const r of untrainedResponses) {
    let a = 0;
    for (let m = 0; m < r.length; m++) a += Math.abs(r[m]);
    s += a;
  }
  return s / untrainedResponses.length;
}

/** Net approach score of one odour: sum_m valence_m * r_m / N (behaviour.py 80-81). */
export function score(response, valence, norm) {
  let s = 0;
  for (let m = 0; m < response.length; m++) s += valence[m] * response[m];
  return s / norm;
}

/** Modelled P(choose X over Y) = sigmoid(beta * (score X - score Y)); beta is the fitted motor gain. */
export function choiceProbability(scoreX, scoreY, beta) {
  return sigmoid(beta * (scoreX - scoreY));
}

/**
 * Reciprocal T-maze (behaviour.py 103-128, Tully and Quinn's design) on the pair (codes[0], codes[1]),
 * normalised over all `codes`: reset, punish A `pairings` times, score; reset, punish B, score.
 *   PI = 0.5 [P(B>A) - P(A>B) | A punished] + 0.5 [P(A>B) - P(B>A) | B punished]
 * The model's weights are saved and restored, so this does not disturb what it has learned.
 * Wild-type single-cycle PI is 0.44 to 0.53; the model's SIZE comes from the fitted beta, its SIGN from the wiring.
 * The untrained index is 0 by construction under the reciprocal design; the innate A-vs-B bias is the baseline.
 */
export function tmaze(mb, codes, { betas = [8], pairings = 1, us = 'punish', strength = 1.0 } = {}) {
  if (codes.length < 2) throw new Error('tmaze needs at least two odours');
  const saved = mb.getWeights();
  const val = mb.circuit.mbon.valence;
  try {
    mb.reset();
    const R0 = codes.map((c) => mb.mbonResponse(c));
    const norm = normOf(R0);
    const scores = (Rs) => Rs.map((r) => score(r, val, norm));
    const after = (idx) => {
      mb.reset();
      for (let i = 0; i < pairings; i++) mb.reinforce(codes[idx], us, strength);
      return scores(codes.map((c) => mb.mbonResponse(c)));
    };
    const s0 = scores(R0);
    const sA = after(0);
    const sB = after(1);
    const byBeta = {};
    for (const beta of betas) {
      const p = (x, y) => choiceProbability(x, y, beta);
      const h1 = p(sA[1], sA[0]) - p(sA[0], sA[1]);
      const h2 = p(sB[0], sB[1]) - p(sB[1], sB[0]);
      byBeta[beta] = {
        PI: 0.5 * (h1 + h2),
        innateBiasAvsB: p(s0[0], s0[1]) - 0.5,
        PChoosePunishedAvsB: p(sA[0], sA[1]),
      };
    }
    return {
      norm,
      scoresNaive: s0,
      scoresAfterPunishingA: sA,
      scoresAfterPunishingB: sB,
      learnedScoreShift: { A: s0[0] - sA[0], B: s0[1] - sB[1] },
      byBeta,
      status: 'sign and order: wiring; size: the fitted motor gain beta. A modelled choice, not a fly.',
    };
  } finally {
    mb.setWeights(saved);
  }
}
