// Controls and lesions from the results, as engine options.
//
// The shuffled dopamine-to-MBON map is the control that can fail (docs/RESULTS.md 1.4, 1.5): with the map
// scrambled across MBON types, punishment lands on MBON10 and the T-maze index at beta 8 falls from 0.35 to 0.02.
// The per-type doses below are the Python model's own shuffle (MushroomBody shuffle='dan_mbon', seed 0), copied
// from fixtures.json (S15/S16); tests check them against it. NumPy's permutation cannot be regenerated in the
// browser, so a fresh shuffle (shuffledMapRandom) is a different draw and must be labelled that way.

import { makeRng } from './numeric.js';

/** type -> [punish dose, reward dose] under the seed-0 shuffle (punish and reward were permuted separately). */
export const SHUFFLED_MAP_SEED0 = {
  MBON01: [0.0, 0.00781580061],
  MBON02: [0.00173085241, 0.000422475714],
  MBON03: [0.0090869749, 0.0],
  MBON04: [0.0402423181, 0.0],
  MBON05: [0.0, 0.000633713556],
  MBON06: [0.0, 0.368821293],
  MBON07: [0.000432713103, 0.292141944],
  MBON09: [0.0, 0.280312628],
  MBON10: [1.0, 0.000316856778],
  MBON11: [0.000432713103, 0.0642163083],
  MBON12: [0.0, 0.827629924],
  MBON13: [0.00173085241, 0.0],
  MBON14: [0.0, 0.000211237857],
  MBON15: [0.000432713103, 0.00147866493],
  'MBON15-like': [0.000432713103, 0.0318969153],
  MBON16: [0.0, 1.0],
  MBON17: [0.0, 0.489438117],
  'MBON17-like': [0.00129813934, 0.127376422],
  MBON18: [0.0, 0.00168990286],
  MBON19: [9.61584665e-5, 0.00200675963],
  MBON20: [0.00129813934, 0.215251371],
  MBON21: [0.0, 0.0],
  MBON22: [0.0207702294, 0.0],
  MBON23: [0.0, 0.000211237857],
  MBON24: [0.0, 0.382129282],
  MBON25: [0.0, 0.126742706],
  'MBON25-like': [0.00973604526, 0.722433448],
  MBON26: [0.00822154898, 0.0194808245],
  MBON27: [0.0, 0.0278833974],
  MBON28: [0.000216356551, 0.00718208682],
  MBON29: [0.0, 0.242289811],
  MBON30: [0.00151449593, 0.0101394169],
  MBON31: [0.0302899182, 0.0023236163],
  MBON32: [0.0437040254, 0.104140259],
  MBON33: [0.0, 0.0],
  MBON34: [0.0, 0.00190114067],
  MBON35: [0.0, 0.0010561893],
};

function perMbon(circuit, byType) {
  const t = circuit.mbon.type;
  const deltaPunish = new Float32Array(t.length);
  const deltaReward = new Float32Array(t.length);
  for (let i = 0; i < t.length; i++) {
    const v = byType[t[i]];
    if (!v) throw new Error(`no shuffled dose for MBON type ${t[i]}`);
    deltaPunish[i] = Math.fround(v[0]);
    deltaReward[i] = Math.fround(v[1]);
  }
  return { deltaPunish, deltaReward };
}

/** Model options for the results' shuffled-map control (the seed-0 shuffle of the Python model). */
export function shuffledMapSeed0(circuit) {
  return perMbon(circuit, SHUFFLED_MAP_SEED0);
}

/** A NEW shuffle of the per-type doses, drawn in the browser (not the results' control; label it as such). */
export function shuffledMapRandom(circuit, rng = makeRng(Date.now())) {
  const t = circuit.mbon.type;
  const types = [...new Set(t)].sort();
  const val = (arr) => Object.fromEntries(types.map((tp) => [tp, arr[t.indexOf(tp)]]));
  const vp = val(circuit.mbon.deltaPunish);
  const vr = val(circuit.mbon.deltaReward);
  const pp = rng.sample(types, types.length);
  const pr = rng.sample(types, types.length);
  const byType = Object.fromEntries(types.map((tp, i) => [tp, [vp[pp[i]], vr[pr[i]]]]));
  return perMbon(circuit, byType);
}

/** The lesions of docs/RESULTS.md 4.2 that are real wiring tests, as model options. The learning rate is
 * calibrated once on the INTACT circuit and kept (lesion.py). The other lesion rows are identities of the rule or
 * the readout (they cannot fail) and are not offered here. */
export const LESIONS = {
  APL_disinhibited: {
    label: 'APL removed: every driven Kenyon cell fires (dense code)',
    options: { sparsity: 1.0 },
    realFly: 'memory loses odour specificity (Lin et al. 2014)',
    independentWiringTest: true,
  },
  'KCg-m_silenced': {
    label: 'KCg-m Kenyon cells silenced',
    options: { silencedKcTypePrefixes: ['KCg-m'] },
    realFly: 'short-term aversive memory impaired (Aso et al. 2014)',
    independentWiringTest: true,
  },
};
