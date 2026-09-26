// Text versions of the 3D view: a plain one-paragraph summary for the default view (the canvas points to it with
// aria-describedby) and a per-group table for "For scientists". Display only: every count is the circuit's or the
// engine's current frame.

import { int, weakerText } from './format.js';
import { describeName } from './useKenyon.js';
import { COPY, nouns } from './copy.js';

export function sumMask(a, mask) {
  let s = 0;
  for (let i = 0; i < a.length; i++) if (mask[i]) s += a[i];
  return s;
}

export function intersectCount(a, b) {
  if (!a || !b) return 0;
  const s = new Set(a);
  let n = 0;
  for (const x of b) if (s.has(x)) n++;
  return n;
}

/** How many cells of a population have a position flag in [lo, hi] (0 scanned soma, 1 neurite point, 2+ stand-in). */
export function flagged(pop, lo, hi = Infinity) {
  let n = 0;
  for (const f of pop.posFlag) if (f >= lo && f <= hi) n++;
  return n;
}

/** The plain summary of what the canvas shows right now. `showShared`: the yellow shared cells are drawn. */
export function describeScene(model, showShared) {
  const { circuit, current, modality } = model;
  if (!circuit) return COPY.loading;
  const N = nouns(modality === 'visual');
  const nOther = circuit.mbon.n + circuit.dan.n + circuit.pn.n + circuit.vpn.n + circuit.apl.n;
  if (!current) return COPY.scene.resting({ N, nKc: int(circuit.kc.n), nOther: int(nOther) });
  const parts = [COPY.scene.active({ N, name: describeName(current.odour.name), nOn: int(current.kcActive.length), nIn: int(current.pnActive.length) })];
  const d = current.readout.dropMBON11;
  if (d != null && Math.abs(d) >= 0.005) parts.push(COPY.scene.change({ weaker: weakerText(d) }));
  if (showShared) parts.push(COPY.scene.shared({ N }));
  return parts.join(' ');
}

/** One row per drawn group, with plain and technical names (the "For scientists" text view). */
export function sceneRows(model) {
  const { circuit, current, modality, lastPair } = model;
  if (!circuit) return [];
  return [
    { label: 'Memory neurons (Kenyon cells)', n: circuit.kc.n, lit: current ? `${int(current.kcActive.length)} on` : 'none' },
    { label: 'Smell-input neurons (olfactory projection neurons)', n: circuit.pn.n, lit: current && modality === 'olfactory' ? `${int(current.pnActive.length)} on` : 'none' },
    { label: 'Sight-input neurons (visual projection neurons)', n: circuit.vpn.n, lit: current && modality === 'visual' ? `${int(current.pnActive.length)} on` : 'none' },
    { label: 'Output neurons (MBONs)', n: circuit.mbon.n, lit: current ? 'brightness = drive now' : 'resting' },
    {
      label: `Punishment group (PPL1 dopamine neurons; PPL1-γ1pedc, ${circuit.dan.punishIdx.length} cells, is the punishment signal)`,
      n: circuit.dan.family.filter((f) => f === 'PPL1').length,
      lit: lastPair?.us === 'punish' ? 'PPL1-γ1pedc flashed at the last lesson' : 'resting',
    },
    { label: 'Reward signal (PAM dopamine neurons)', n: circuit.dan.family.filter((f) => f === 'PAM').length, lit: lastPair?.us === 'reward' ? 'flashed at the last lesson' : 'resting' },
    { label: 'Brake neuron (APL)', n: circuit.apl.n, lit: 'drawn, not simulated' },
  ];
}
