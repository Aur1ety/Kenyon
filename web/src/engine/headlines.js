// The headline numbers, each with its status. Computed live by this engine on odours A to H of the results (the
// seed-0 draw); the similarity ladder and the partial cue use one odour per level drawn by export_web_data.py for
// the page, not the results' own. The page sets them next to the stored results (the ten-draw spreads in
// results/mb_seeds.json and the other files in public/data/results, read by src/ui/extractResults.js), so no
// quoted number is typed in here. The body effect (the recurrent model's descending neurons) is not computed here:
// the page reads it from the stored motor*.json files.
//
// Rules the site must keep (README, docs/RESULTS.md):
//   - the 0.90 paired drop is a CALIBRATION, not a result;
//   - the wiring decides where the memory lands, its specificity, its spread to similar odours, and the direction
//     of the modelled choice;
//   - negatives: no pattern completion; two memories in the same compartment overwrite each other;
//   - the effect on the body is faint: 2 of 1,314 descending neurons, 2.8% and 0.91% of their rates, resting
//     on nine synapses in one reconstruction.

import { MushroomBody } from './model.js';
import { drop, shareOfLostDrive, normOf, score, choiceProbability, tmaze } from './readout.js';
import { PRESET_ODOURS, sharedChannels } from './odours.js';
import { shuffledMapSeed0, LESIONS } from './controls.js';
import { STATUS } from './status.js';
import { DEFAULT_BETA as BETA_WALKTHROUGH, TABLES_BETA as BETA_TABLES } from './simulation.js';

const EIGHT = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const FOUR = ['A', 'B', 'C', 'D'];
const LADDER = ['A_share5', 'A_share4', 'A_share3', 'A_share1', 'A_share0'];

function codesFor(mb, names) {
  const out = {};
  for (const n of names) out[n] = mb.encode(PRESET_ODOURS[n].channels).code;
  return out;
}

function responses(mb, codes, names) {
  const out = {};
  for (const n of names) out[n] = mb.mbonResponse(codes[n]);
  return out;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Compute every headline on a fresh model. Takes a few tens of milliseconds. */
export function computeHeadlines(circuit) {
  const mb = new MushroomBody(circuit);
  const m11 = mb.typeMask('MBON11');
  const cp = mb.compartmentMask('punish');
  const cr = mb.compartmentMask('reward');
  const names = [...EIGHT, ...LADDER, 'A_part3'];
  const codes = codesFor(mb, names);
  const R0 = responses(mb, codes, names);
  const val = circuit.mbon.valence;
  const items = [];

  // one pairing, A + punishment
  mb.reset();
  mb.reinforce(codes.A, 'punish');
  const R1 = responses(mb, codes, names);
  const unpaired = EIGHT.slice(1).map((n) => drop(R0[n], R1[n], m11));
  items.push({
    id: 'paired_drop', status: STATUS.CALIBRATION,
    label: "Drop in odour A's drive onto MBON11 after one pairing with punishment",
    value: drop(R0.A, R1.A, m11), lr: mb.lr,
    note: 'Set by hand: one learning rate chosen so one pairing gives the drop Hige et al. 2015 measured. Not a result.',
  });
  items.push({
    id: 'unpaired_drop', status: STATUS.WIRING,
    label: 'Drop for the odours that were not paired (B to H), mean',
    value: mean(unpaired), perOdour: Object.fromEntries(EIGHT.slice(1).map((n, i) => [n, unpaired[i]])),
    worst: Math.max(...unpaired),
    note: 'Set by how many Kenyon cells each odour shares with A (the drop is the learning rate times that overlap). One odour draw (seed 0).',
  });
  items.push({
    id: 'share_on_MBON11', status: STATUS.WIRING,
    label: 'Share of all the drive odour A lost that was lost at MBON11',
    value: shareOfLostDrive(R0.A, R1.A, m11),
    note: 'Where the memory lands is set by the dopamine-to-MBON wiring.',
  });
  const shares = LADDER.map((n) => sharedChannels(PRESET_ODOURS.A, PRESET_ODOURS[n]));
  const nA = PRESET_ODOURS.A.channels.length;
  items.push({
    id: 'generalisation', status: STATUS.WIRING,
    label: `Drop at MBON11 for odours sharing ${shares.join(', ')} of A's ${nA} glomeruli`,
    value: LADDER.map((n) => drop(R0[n], R1[n], m11)), shares,
    note: "One odour per level, drawn for this page (not the results' own); the stored multi-draw values average many odours per level. Spread follows shared Kenyon cells.",
  });

  // partial cue: recall equals the overlap (no completion)
  const partDrop = drop(R0.A_part3, R1.A_part3, m11);
  const partOverlap = mb.overlap(codes.A, codes.A_part3, m11);
  items.push({
    id: 'partial_cue', status: STATUS.NEGATIVE,
    label: `Part of odour A (${PRESET_ODOURS.A_part3.channels.length} of its ${nA} glomeruli; one cue drawn for this page, not recall.py's): drop at MBON11`,
    value: partDrop, overlap: partOverlap, recallFraction: partDrop / drop(R0.A, R1.A, m11), cue: [PRESET_ODOURS.A_part3.channels.length, nA],
    note: 'No pattern completion: a partial cue recalls in proportion to its Kenyon-cell overlap with A (the drop is the learning rate times that overlap). In this feedforward circuit that is forced by construction, so it is not a test that could have shown completion.',
  });

  // two memories in the same compartment: A then B, both punished
  mb.reset();
  mb.reinforce(codes.A, 'punish');
  mb.reinforce(codes.B, 'punish');
  const AB = responses(mb, codes, ['A', 'B']);
  const aAfterB = drop(R0.A, AB.A, m11);
  items.push({
    id: 'overwrite', status: STATUS.NEGATIVE,
    label: 'A punished, then B punished: how much of A\'s memory is left',
    value: aAfterB / drop(R0.A, R1.A, m11), dropA: aAfterB, dropB: drop(R0.B, AB.B, m11),
    note: 'Memories in the same compartment overwrite each other under the published rule (its recovery term). Real flies hold several. Turning the term down fixes it, but that is a rule change.',
  });

  // reward, and two memories in different compartments
  mb.reset();
  mb.reinforce(codes.C, 'reward');
  const RC = responses(mb, codes, ['C']);
  items.push({
    id: 'reward', status: STATUS.WIRING,
    label: 'Odour C paired once with reward (PAM): drop in the reward compartments / at MBON11',
    value: [drop(R0.C, RC.C, cr), drop(R0.C, RC.C, m11)],
    rewardCompartments: mb.typesIn(cr),
    note: 'Reward also works by depression, in other compartments (Owald et al. 2015).',
  });
  mb.reset();
  mb.reinforce(codes.A, 'punish');
  mb.reinforce(codes.C, 'reward');
  const RAC = responses(mb, codes, EIGHT);
  items.push({
    id: 'coexistence', status: STATUS.WIRING,
    label: 'A punished and C rewarded: A\'s drop at MBON11 / C\'s drop in the reward compartments',
    value: [drop(R0.A, RAC.A, cp), drop(R0.C, RAC.C, cr)],
    note: 'Memories in different compartments coexist.',
  });
  const n8 = normOf(EIGHT.map((n) => R0[n]));
  const s0 = Object.fromEntries(EIGHT.map((n) => [n, score(R0[n], val, n8)]));
  const s1 = Object.fromEntries(EIGHT.map((n) => [n, score(RAC[n], val, n8)]));
  const pc = (s, x, y) => choiceProbability(s[x], s[y], BETA_TABLES);
  items.push({
    id: 'multi_memory_choices', status: STATUS.MODELLED_CHOICE, beta: BETA_TABLES,
    label: `Modelled choices after A punished and C rewarded (β ${BETA_TABLES})`,
    value: {
      'C over A': [pc(s0, 'C', 'A'), pc(s1, 'C', 'A')],
      'D over A': [pc(s0, 'D', 'A'), pc(s1, 'D', 'A')],
      'C over D': [pc(s0, 'C', 'D'), pc(s1, 'C', 'D')],
    },
    note: 'Before and after. The order is set by the wiring with no extra fitting; the size by the fitted beta.',
  });

  // T-maze, and the control that can fail
  const pi = tmaze(mb, EIGHT.map((n) => codes[n]), { betas: [BETA_TABLES, BETA_WALKTHROUGH] });
  items.push({
    id: 'tmaze', status: STATUS.FITTED,
    label: 'Reciprocal T-maze performance index, A versus B',
    value: { [BETA_TABLES]: pi.byBeta[BETA_TABLES].PI, [BETA_WALKTHROUGH]: pi.byBeta[BETA_WALKTHROUGH].PI },
    betas: [BETA_TABLES, BETA_WALKTHROUGH],
    note: 'Sign and order come from the wiring; the size comes from one fitted motor gain (β). A modelled choice, not a fly.',
  });
  const shuf = new MushroomBody(circuit, shuffledMapSeed0(circuit));
  const piShuf = tmaze(shuf, EIGHT.map((n) => shuf.encode(PRESET_ODOURS[n].channels).code), { betas: [BETA_TABLES] });
  items.push({
    id: 'shuffled_map_control', status: STATUS.CONTROL, beta: BETA_TABLES,
    label: `Same index with the dopamine-to-MBON map shuffled (β ${BETA_TABLES})`,
    value: [pi.byBeta[BETA_TABLES].PI, piShuf.byBeta[BETA_TABLES].PI],
    punishLandsOn: shuf.typesIn(shuf.compartmentMask('punish')),
    note: 'The control that can fail, and does: with the map scrambled the index collapses.',
  });

  // lesions that are real wiring tests (lesion.py): lr kept from the intact circuit
  const lesion = (options) => {
    const L = new MushroomBody(circuit, options);
    const c = codesFor(L, FOUR);
    const before = responses(L, c, FOUR);
    const n = normOf(FOUR.map((x) => before[x]));
    const avoid = (R) => choiceProbability(score(R.B, val, n), score(R.A, val, n), BETA_TABLES);
    L.reinforce(c.A, 'punish');
    const after = responses(L, c, FOUR);
    return {
      unpaired: mean(['B', 'C', 'D'].map((x) => drop(before[x], after[x], m11)).filter((x) => x !== null)),
      shift: avoid(after) - avoid(before),
    };
  };
  const intact = lesion({});
  const apl = lesion(LESIONS.APL_disinhibited.options);
  const kcgm = lesion(LESIONS['KCg-m_silenced'].options);
  items.push({
    id: 'lesion_APL', status: STATUS.WIRING,
    label: 'APL removed (dense code): unpaired odours\' drop at MBON11, intact → lesioned',
    value: [intact.unpaired, apl.unpaired],
    note: 'Without the sparse code the memory leaks onto other odours, as in the animal (Lin et al. 2014). A wiring test that could have failed.',
  });
  items.push({
    id: 'lesion_KCgm', status: STATUS.WIRING, beta: BETA_TABLES,
    label: 'KCg-m Kenyon cells silenced: share of the learned avoidance left',
    value: kcgm.shift / intact.shift,
    note: 'Most of the modelled avoidance survives (Aso et al. 2014 report a mild impairment). A wiring test that could have failed.',
  });

  return {
    items,
    odourSet: 'odours A to H of the results (seed-0 draw), lesions on A to D; the ladder and the partial cue drawn for this page',
    beta: { tables: BETA_TABLES, walkthrough: BETA_WALKTHROUGH },
  };
}
