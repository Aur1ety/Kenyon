// A stateful session for the UI: an odour set, a model that learns, and per-step frames for animation.
//
// Every frame says which cells are active at that step (projection neurons, Kenyon cells, dopamine neurons,
// MBONs) plus the numbers behind them. It is the feedforward model of docs/RESULTS.md sections 1 and 2 on the
// scanned wiring: a model of the wiring, not a recording of a fly.

import { MushroomBody } from './model.js';
import { drop, shareOfLostDrive, normOf, score, choiceProbability, tmaze } from './readout.js';
import { presetOdour } from './odours.js';
import { shuffledMapSeed0, LESIONS } from './controls.js';
import { STATUS } from './status.js';

export const DEFAULT_BETA = 11; // the walkthrough's and video's fitted gain
export const TABLES_BETA = 8; // the tables' fitted gain (behaviour.py and lesion.py; results/lesion.json anchor.beta)

function resolveOdour(circuit, o) {
  return typeof o === 'string' ? presetOdour(circuit, o) : o;
}

/** Model options for a named condition: 'intact', 'shuffled_map', 'APL_disinhibited', 'KCg-m_silenced',
 * 'no_recovery' (a RULE CHANGE: recover_rate 0). */
export function conditionOptions(circuit, condition = 'intact') {
  switch (condition) {
    case 'intact': return {};
    case 'shuffled_map': return shuffledMapSeed0(circuit);
    case 'no_recovery': return { recoverRate: 0 };
    default:
      if (LESIONS[condition]) return { ...LESIONS[condition].options };
      throw new Error(`unknown condition ${condition}`);
  }
}

export class Simulation {
  /**
   * @param circuit prepareCircuit() output
   * @param opts.odours odour objects or preset names; they set the choice normalisation N (behaviour.py)
   * @param opts.modality 'olfactory' | 'visual'
   * @param opts.condition see conditionOptions()
   * @param opts.beta fitted motor gain for choices (11 walkthrough, 8 tables)
   * @param opts.model extra MushroomBody options (lr, recoverRate, ...)
   */
  constructor(circuit, opts = {}) {
    this.circuit = circuit;
    this.condition = opts.condition || 'intact';
    this.modality = opts.modality || 'olfactory';
    this.beta = opts.beta ?? DEFAULT_BETA;
    const modelOpts = { modality: this.modality, ...conditionOptions(circuit, this.condition), ...(opts.model || {}) };
    this.mb = new MushroomBody(circuit, modelOpts);
    // The lesions keep the rate calibrated on the intact circuit (lesion.py); with a binary code that is 0.9.
    this.lrStatus = STATUS.CALIBRATION;
    this.recoveryStatus = this.mb.recoverRate === 1 ? 'published rule (Gkanias et al. 2022)' : `${STATUS.RULE_CHANGE}: recover_rate ${this.mb.recoverRate}, not the published rule`;
    this.masks = {
      MBON11: this.mb.typeMask('MBON11'),
      punish: this.mb.compartmentMask('punish'),
      reward: this.mb.compartmentMask('reward'),
    };
    this.history = [];
    this._cache = new Map();
    this.setOdours(opts.odours || (this.modality === 'visual'
      ? ['vA', 'vB', 'vC', 'vD', 'vE', 'vF', 'vG', 'vH']
      : ['A', 'B', 'C', 'D']));
  }

  // ------------------------------------------------------------------ odours
  setOdours(list) {
    const odours = list.map((o) => resolveOdour(this.circuit, o));
    for (const o of odours) {
      if (o.modality !== this.modality) throw new Error(`odour ${o.name} is ${o.modality}; this session is ${this.modality}`);
    }
    const names = odours.map((o) => o.name);
    if (new Set(names).size !== names.length) throw new Error('odour names must be unique');
    this.odours = odours;
    this._norm = null;
  }

  addOdour(o) {
    const od = resolveOdour(this.circuit, o);
    this.setOdours([...this.odours.filter((x) => x.name !== od.name), od]);
    return od;
  }

  odour(name) {
    const o = this.odours.find((x) => x.name === name);
    if (!o) throw new Error(`odour ${name} is not in the set`);
    return o;
  }

  /** The feedforward pass for an odour (cached; it does not depend on learning). */
  encode(o) {
    const od = typeof o === 'string' ? this.odour(o) : o;
    if (od.modality && od.modality !== this.modality) {
      throw new Error(`odour ${od.name} is ${od.modality}; this session is ${this.modality}`);
    }
    const key = `${od.modality}:${od.channels.join(',')}:${od.strength ?? 1}`;
    let enc = this._cache.get(key);
    if (!enc) {
      enc = this.mb.encode(od.channels, od.strength ?? 1);
      enc.untrained = this.mb.untrainedResponse(enc.code);
      this._cache.set(key, enc);
    }
    return enc;
  }

  /** N: mean over the odour set of the summed |MBON drive| on the untrained circuit. */
  get norm() {
    if (this._norm === null) this._norm = normOf(this.odours.map((o) => this.encode(o).untrained));
    return this._norm;
  }

  // ------------------------------------------------------------------ frames
  /** Present an odour, no learning. Everything the animation needs for that moment. */
  present(o) {
    const od = typeof o === 'string' ? this.odour(o) : o;
    const enc = this.encode(od);
    const now = this.mb.mbonResponse(enc.code);
    const ratio = new Float64Array(now.length);
    for (let m = 0; m < now.length; m++) ratio[m] = enc.untrained[m] > 0 ? now[m] / enc.untrained[m] : NaN;
    return {
      kind: 'odour',
      odour: od,
      pnActive: enc.pnActive, // projection neurons switched on (olfactory PNs, or visual PNs)
      kcDrive: enc.drive, // synaptic input per Kenyon cell
      kcDriven: enc.driven, // Kenyon cells with any input
      kcActive: enc.active, // the winners of the top-5% competition (binary code)
      danActive: new Int32Array(0),
      mbonDrive: now, // summed KC->MBON drive through the current weights
      mbonUntrained: enc.untrained, // the same with every weight at rest
      mbonRatio: ratio, // now / untrained (NaN where the odour does not drive the MBON)
      mbonActive: indicesWhere(now, (x) => x > 0),
      readout: this._readout(od, enc, now),
    };
  }

  _readout(od, enc, now) {
    const inSet = this.odours.some((x) => x.name === od.name);
    return {
      dropMBON11: drop(enc.untrained, now, this.masks.MBON11),
      dropPunishCompartment: drop(enc.untrained, now, this.masks.punish),
      dropRewardCompartment: drop(enc.untrained, now, this.masks.reward),
      shareOfLostDriveMBON11: shareOfLostDrive(enc.untrained, now, this.masks.MBON11),
      score: inSet ? score(now, this.circuit.mbon.valence, this.norm) : null,
    };
  }

  /**
   * One pairing block: the odour arrives with punishment (PPL101 -> MBON11) or reward (PAM -> MBON03/05/06).
   * Returns the frames in order: odour, dopamine, plasticity, after. `odour` null = dopamine alone.
   */
  pair(o, us = 'punish', { strength = 1.0 } = {}) {
    const od = o == null ? null : (typeof o === 'string' ? this.odour(o) : o);
    const before = od ? this.present(od) : null;
    const code = od ? this.encode(od).code : null;
    const delta = this.mb.deltaFor(us);
    const dan = us === 'punish' ? this.circuit.dan.punishIdx : this.circuit.dan.rewardIdx;
    const W0 = this.mb.getWeights();
    const changed = this.mb.reinforce(code, us, strength);
    const dW = new Float64Array(this.mb.nMbon);
    const { indptr, counts } = this.circuit.weights.kcMbon;
    for (let m = 0; m < this.mb.nMbon; m++) {
      let s = 0;
      for (let e = indptr[m]; e < indptr[m + 1]; e++) s += counts[e] * (this.mb.W[e] - W0[e]);
      dW[m] = s;
    }
    this.history.push({ odour: od ? od.name : null, channels: od ? od.channels.slice() : null, us, strength });
    const after = od ? this.present(od) : null;
    const dopamine = {
      kind: 'dopamine',
      us,
      danActive: dan, // PPL101 cells for punishment; all PAM cells for reward (the model pools them)
      mbonDose: delta, // dopamine dose per MBON, 0..1, from DAN->MBON synapse counts
      mbonTargeted: indicesWhere(delta, (x) => x >= (this.circuit.constants.compartment_threshold ?? 0.5)),
      kcActive: before ? before.kcActive : new Int32Array(0),
      pnActive: before ? before.pnActive : new Int32Array(0),
    };
    const plasticity = {
      kind: 'plasticity',
      us,
      synapsesChanged: changed,
      weightChangeByMbon: dW, // sum over each MBON's synapses of counts * dW (negative = depressed)
      danActive: dan,
      kcActive: before ? before.kcActive : new Int32Array(0),
    };
    const frames = [];
    if (before) frames.push(before);
    frames.push(dopamine, plasticity);
    if (after) frames.push({ ...after, kind: 'after' });
    return { frames, pairing: this.history.length };
  }

  reset() {
    this.mb.reset();
    this.history = [];
  }

  /** Remove the last pairing (reset and replay the rest). */
  undo() {
    const h = this.history.slice(0, -1);
    this.reset();
    for (const s of h) {
      const code = s.channels ? this.mb.encode(s.channels).code : null;
      this.mb.reinforce(code, s.us, s.strength);
    }
    this.history = h;
  }

  // ------------------------------------------------------------------ readouts
  /** Memory readout for one odour, relative to the untrained circuit. */
  readout(o) {
    const od = typeof o === 'string' ? this.odour(o) : o;
    const enc = this.encode(od);
    return this._readout(od, enc, this.mb.mbonResponse(enc.code));
  }

  /** Approach scores for the odour set, now and untrained. */
  scores() {
    const val = this.circuit.mbon.valence;
    const out = {};
    for (const o of this.odours) {
      const enc = this.encode(o);
      out[o.name] = { now: score(this.mb.mbonResponse(enc.code), val, this.norm), untrained: score(enc.untrained, val, this.norm) };
    }
    return out;
  }

  /** Modelled P(choose x over y), through the valence rule of thumb and the fitted beta. Not a fly's choice. */
  choice(x, y, beta = this.beta) {
    const s = this.scores();
    if (!s[x] || !s[y]) throw new Error('both odours must be in the set');
    return {
      x, y, beta,
      P: choiceProbability(s[x].now, s[y].now, beta),
      PUntrained: choiceProbability(s[x].untrained, s[y].untrained, beta),
      status: STATUS.MODELLED_CHOICE,
    };
  }

  /** Reciprocal T-maze on (a, b), normalised over the odour set; leaves the session's weights untouched. */
  tmaze(a, b, { betas = [8, this.beta] } = {}) {
    const order = [a, b, ...this.odours.map((o) => o.name).filter((n) => n !== a && n !== b)];
    const codes = order.map((n) => this.encode(n).code);
    return tmaze(this.mb, codes, { betas });
  }

  /** Which pairings have been applied, for the UI's log. */
  describeHistory() {
    return this.history.map((h, i) => `${i + 1}. ${h.odour ?? 'no odour'} + ${h.us === 'punish' ? 'punishment (PPL101)' : 'reward (PAM)'}`);
  }
}

function indicesWhere(a, pred) {
  const out = [];
  for (let i = 0; i < a.length; i++) if (pred(a[i])) out.push(i);
  return Int32Array.from(out);
}
