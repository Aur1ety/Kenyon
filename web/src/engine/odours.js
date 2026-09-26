// Odours for the engine. Every odour is synthetic: a set of glomeruli (or, for vision, visual projection-neuron
// types) whose projection neurons are all switched on; the antennal lobe is bypassed. A set of channel indices
// into circuit.glomeruli (or circuit.visualChannels).
//
// The presets are the exact odours the results files and fixtures.json use (NumPy seed-0 draws and the
// generalisation / partial-cue odours of export_web_data.py); tests/engine.parity.test.js checks them against
// fixtures.json. Odours drawn in the browser use a different generator, so they are new odours, and the UI should
// say so.

import { makeRng } from './numeric.js';

const O = 'olfactory';
const V = 'visual';

/** @type {Record<string, {modality: string, channels: number[], note: string}>} */
export const PRESET_ODOURS = {
  A: { modality: O, channels: [2, 12, 15, 24, 29, 38], note: 'odour A of the results (seed-0 draw): the trained odour' },
  B: { modality: O, channels: [23, 28, 31, 35, 41, 46], note: 'odour B of the results (seed-0 draw)' },
  C: { modality: O, channels: [0, 1, 18, 27, 30, 41], note: 'odour C of the results (seed-0 draw): the rewarded odour in the two-memory runs' },
  D: { modality: O, channels: [1, 3, 14, 24, 25, 38], note: 'odour D of the results (seed-0 draw): left untouched' },
  E: { modality: O, channels: [0, 12, 24, 30, 31, 49], note: 'odour E of the results (seed-0 draw)' },
  F: { modality: O, channels: [17, 31, 32, 42, 44, 45], note: 'odour F of the results (seed-0 draw)' },
  G: { modality: O, channels: [15, 18, 25, 26, 33, 39], note: 'odour G of the results (seed-0 draw)' },
  H: { modality: O, channels: [12, 16, 24, 28, 32, 42], note: 'odour H of the results (seed-0 draw)' },

  A_share5: { modality: O, channels: [12, 15, 24, 29, 38, 48], note: "shares 5 of odour A's 6 glomeruli" },
  A_share4: { modality: O, channels: [2, 12, 15, 17, 29, 44], note: "shares 4 of odour A's 6 glomeruli" },
  A_share3: { modality: O, channels: [6, 12, 15, 35, 38, 42], note: "shares 3 of odour A's 6 glomeruli" },
  A_share1: { modality: O, channels: [9, 23, 29, 35, 42, 46], note: "shares 1 of odour A's 6 glomeruli" },
  A_share0: { modality: O, channels: [20, 30, 32, 35, 42, 49], note: "shares none of odour A's 6 glomeruli" },

  A_part5: { modality: O, channels: [2, 12, 15, 24, 38], note: "5 of odour A's 6 glomeruli only (a partial cue)" },
  A_part4: { modality: O, channels: [2, 15, 24, 29], note: "4 of odour A's 6 glomeruli only (a partial cue)" },
  A_part3: { modality: O, channels: [2, 29, 38], note: "3 of odour A's 6 glomeruli only (a partial cue)" },
  A_part2: { modality: O, channels: [2, 29], note: "2 of odour A's 6 glomeruli only (a partial cue)" },
  A_part1: { modality: O, channels: [29], note: "1 of odour A's 6 glomeruli only (a partial cue)" },

  A_s1: { modality: O, channels: [1, 7, 21, 23, 35, 45], note: 'second odour set (seed-1 draw), odour A' },
  B_s1: { modality: O, channels: [12, 19, 20, 32, 38, 47], note: 'second odour set (seed-1 draw), odour B' },
  C_s1: { modality: O, channels: [15, 22, 24, 37, 38, 39], note: 'second odour set (seed-1 draw), odour C' },
  D_s1: { modality: O, channels: [6, 9, 17, 18, 25, 43], note: 'second odour set (seed-1 draw), odour D' },
  E_s1: { modality: O, channels: [5, 22, 36, 45, 47, 48], note: 'second odour set (seed-1 draw), odour E' },
  F_s1: { modality: O, channels: [7, 12, 15, 21, 33, 47], note: 'second odour set (seed-1 draw), odour F' },
  G_s1: { modality: O, channels: [17, 20, 29, 35, 37, 45], note: 'second odour set (seed-1 draw), odour G' },
  H_s1: { modality: O, channels: [2, 16, 20, 21, 31, 38], note: 'second odour set (seed-1 draw), odour H' },

  vA: { modality: V, channels: [4, 26, 30, 50, 61, 81], note: 'visual object A of the results (seed-0 draw)' },
  vB: { modality: V, channels: [48, 59, 63, 72, 87, 96], note: 'visual object B of the results (seed-0 draw)' },
  vC: { modality: V, channels: [0, 3, 38, 55, 64, 84], note: 'visual object C of the results (seed-0 draw)' },
  vD: { modality: V, channels: [2, 7, 29, 48, 53, 82], note: 'visual object D of the results (seed-0 draw)' },
  vE: { modality: V, channels: [0, 25, 51, 62, 64, 65], note: 'visual object E of the results (seed-0 draw)' },
  vF: { modality: V, channels: [36, 65, 67, 84, 94, 98], note: 'visual object F of the results (seed-0 draw)' },
  vG: { modality: V, channels: [31, 37, 52, 55, 69, 82], note: 'visual object G of the results (seed-0 draw)' },
  vH: { modality: V, channels: [25, 35, 51, 57, 66, 89], note: 'visual object H of the results (seed-0 draw)' },
};

/** Named groups the UI can offer. */
export const PRESET_GROUPS = {
  eight: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], // the tables' odour set (norm over A..H)
  walkthrough: ['A', 'B', 'C', 'D'], // the walkthrough's and lesion.py's set
  similarToA: ['A_share5', 'A_share4', 'A_share3', 'A_share1', 'A_share0'],
  partsOfA: ['A_part5', 'A_part4', 'A_part3', 'A_part2', 'A_part1'],
  secondSet: ['A_s1', 'B_s1', 'C_s1', 'D_s1', 'E_s1', 'F_s1', 'G_s1', 'H_s1'],
  visual: ['vA', 'vB', 'vC', 'vD', 'vE', 'vF', 'vG', 'vH'],
};

export const CHANNELS_PER_ODOUR = 6;

function channelList(circuit, modality) {
  return modality === V ? circuit.visualChannels : circuit.glomeruli;
}

/** A full odour object: {name, modality, channels, names, note, preset}. */
export function makeOdour(circuit, name, channels, modality = O, note = '') {
  const list = channelList(circuit, modality);
  const ch = [...new Set(channels)].sort((a, b) => a - b);
  for (const c of ch) if (!Number.isInteger(c) || c < 0 || c >= list.length) throw new Error(`channel ${c} out of range`);
  return { name, modality, channels: ch, names: ch.map((c) => list[c]), note, preset: false };
}

export function presetOdour(circuit, name) {
  const p = PRESET_ODOURS[name];
  if (!p) throw new Error(`unknown preset odour ${name}`);
  return { ...makeOdour(circuit, name, p.channels, p.modality, p.note), preset: true };
}

/** Build an odour from channel names (e.g. ['DA2', 'VA4']). */
export function odourFromNames(circuit, name, channelNames, modality = O, note = '') {
  const list = channelList(circuit, modality);
  const ch = channelNames.map((n) => {
    const i = list.indexOf(n);
    if (i < 0) throw new Error(`unknown channel ${n}`);
    return i;
  });
  return makeOdour(circuit, name, ch, modality, note);
}

/** A random synthetic odour of `n` channels, drawn in the browser (not one of the results' odours). */
export function randomOdour(circuit, { modality = O, n = CHANNELS_PER_ODOUR, rng = makeRng(Date.now()), name = 'random' } = {}) {
  const list = channelList(circuit, modality);
  const ch = rng.sample(list.keys(), n);
  return makeOdour(circuit, name, ch, modality, `random: ${n} channels drawn in the browser (a new odour, not one of the results' odours)`);
}

/** A random odour sharing exactly `nShared` of `base`'s channels (the generalisation ladder's recipe). */
export function similarOdour(circuit, base, nShared, { n = base.channels.length, rng = makeRng(Date.now()), name } = {}) {
  if (nShared > base.channels.length || nShared > n) throw new Error('cannot share more channels than the odour has');
  const list = channelList(circuit, base.modality);
  const keep = rng.sample(base.channels, nShared);
  const pool = [...list.keys()].filter((c) => !base.channels.includes(c));
  const fresh = rng.sample(pool, n - nShared);
  return makeOdour(circuit, name || `${base.name}_share${nShared}`, [...keep, ...fresh], base.modality,
    `shares ${nShared} of ${base.name}'s ${base.channels.length} channels (drawn in the browser)`);
}

/** Only `keep` of `base`'s channels (a partial cue). */
export function partialOdour(circuit, base, keep, { rng = makeRng(Date.now()), name } = {}) {
  const ch = rng.sample(base.channels, keep);
  return makeOdour(circuit, name || `${base.name}_part${keep}`, ch, base.modality,
    `${keep} of ${base.name}'s ${base.channels.length} channels only (a partial cue, drawn in the browser)`);
}

export function sharedChannels(a, b) {
  const s = new Set(a.channels);
  return b.channels.filter((c) => s.has(c)).length;
}
