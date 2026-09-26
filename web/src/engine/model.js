// The feedforward mushroom body of kenyon/model/mushroom_body.py, on the exported wiring.
//
//   odour (a set of glomeruli) -> projection neurons -> Kenyon cells (top 5%, binary) -> MBONs
//   dopamine: punishment = PPL101 (PPL1-gamma1pedc), reward = PAM; each reaches the MBONs its synapses reach
//   learning, on KC->MBON synapses only (Gkanias et al. 2022):
//       dW = -lr * delta[mbon] * strength * (code[kc] + recover_rate * (W - 1)),  W clamped to [0, 2]
//
// Arithmetic follows the Python model's torch float32 operations one for one (Math.fround after each), in the
// same edge order, so the MBON drives and weights are bit-identical to the Python model's.
//
// What is set by hand and what the wiring decides (docs/RESULTS.md 1.3):
//   - lr is a CALIBRATION: set once so one pairing drops the trained odour's drive onto MBON11 by 0.90
//     (Hige et al. 2015). That 0.90 is not a result.
//   - the top-5% rule (k-winners-take-all), the binary code and the synthetic odours are choices.
//   - the wiring decides where the memory lands, how specific it is, how it spreads to similar odours, and
//     the direction of the modelled choice.

import { f32, roundHalfEven, maskedSum } from './numeric.js';

export const W_REST = 1.0;
export const HIGE_CHARGE_DROP = 0.9;

export class MushroomBody {
  /**
   * @param circuit  the output of prepareCircuit()
   * @param opts.modality 'olfactory' (projection neurons from the antennal lobe) or 'visual' (visual PNs)
   * @param opts.sparsity fraction of the drivable Kenyon cells that fire (0.05; 1.0 = APL lesion, dense code)
   * @param opts.lr learning rate (0.9 = the CALIBRATED value; see calibrateLr)
   * @param opts.recoverRate 1 = the published rule; anything else is a rule change
   * @param opts.wMax upper weight bound (2)
   * @param opts.deltaPunish / opts.deltaReward per-MBON dopamine dose overrides (the shuffled-map control)
   * @param opts.silencedKcTypePrefixes Kenyon-cell types silenced after the competition (the KCg-m lesion)
   */
  constructor(circuit, opts = {}) {
    const c = circuit.constants;
    this.circuit = circuit;
    this.modality = opts.modality || 'olfactory';
    if (this.modality !== 'olfactory' && this.modality !== 'visual') throw new Error(`unknown modality ${this.modality}`);
    this.sparsity = opts.sparsity ?? c.sparsity.value;
    this.lr = opts.lr ?? c.lr.value;
    this.lrCapped = false;
    this.recoverRate = opts.recoverRate ?? c.recover_rate.value;
    this.wMax = opts.wMax ?? c.w_max;
    this.wMin = c.w_min ?? 0;

    const inp = this.modality === 'visual' ? circuit.weights.vpnKc : circuit.weights.pnKc;
    this.inputWeights = inp;
    this.inputPop = this.modality === 'visual' ? circuit.vpn : circuit.pn;
    this.channelNames = this.modality === 'visual' ? circuit.visualChannels : circuit.glomeruli;
    this.nInput = inp.nCols;
    this.nKc = inp.nRows;
    this.nMbon = circuit.mbon.n;
    this.nEdges = circuit.nEdges;
    this.nDrivable = circuit.kc.nDrivable[this.modality];
    this.k = opts.k ?? Math.max(1, roundHalfEven(this.sparsity * this.nDrivable));

    this.deltaPunish = opts.deltaPunish ? Float32Array.from(opts.deltaPunish, f32) : circuit.mbon.deltaPunish;
    this.deltaReward = opts.deltaReward ? Float32Array.from(opts.deltaReward, f32) : circuit.mbon.deltaReward;
    if (this.deltaPunish.length !== this.nMbon || this.deltaReward.length !== this.nMbon) {
      throw new Error('delta overrides must have one value per MBON');
    }

    this.silencedKcTypePrefixes = (opts.silencedKcTypePrefixes || []).slice();
    this.silenced = null;
    if (this.silencedKcTypePrefixes.length) {
      this.silenced = new Uint8Array(this.nKc);
      const t = circuit.kc.type;
      for (let i = 0; i < this.nKc; i++) {
        if (this.silencedKcTypePrefixes.some((p) => t[i].startsWith(p))) this.silenced[i] = 1;
      }
    }

    this.W = new Float32Array(this.nEdges).fill(1);
  }

  // ------------------------------------------------------------------ circuit
  /** Projection-neuron input for an odour: every PN of each listed channel set to `strength` (MB 160-164). */
  inputVector(channels, strength = 1.0) {
    if (!(strength > 0)) throw new Error('odour strength must be positive');
    const want = new Uint8Array(this.channelNames.length);
    for (const ch of channels) {
      if (!Number.isInteger(ch) || ch < 0 || ch >= want.length) throw new Error(`channel ${ch} out of range`);
      want[ch] = 1;
    }
    const ch = this.inputPop.channel;
    const v = new Float64Array(this.nInput);
    for (let j = 0; j < this.nInput; j++) if (want[ch[j]]) v[j] = strength;
    return v;
  }

  /** Indices of the projection neurons an odour turns on. */
  activeInputs(channels) {
    const want = new Set(channels);
    const ch = this.inputPop.channel;
    const out = [];
    for (let j = 0; j < this.nInput; j++) if (want.has(ch[j])) out.push(j);
    return Int32Array.from(out);
  }

  /** Feedforward Kenyon-cell drive: synapse counts times PN input, summed per KC (exact: integers). */
  kcDrive(input) {
    const { indptr, cols, counts } = this.inputWeights;
    const d = new Float64Array(this.nKc);
    for (let i = 0; i < this.nKc; i++) {
      let s = 0;
      for (let e = indptr[i]; e < indptr[i + 1]; e++) s += counts[e] * input[cols[e]];
      d[i] = s;
    }
    return d;
  }

  /**
   * k-winners-take-all on the drive (MB 166-179): order KCs by drive (descending), ties by the model's fixed
   * random rank, take the first k, drop any with zero drive. Binary code. Silenced KC types are zeroed AFTER
   * the competition, without re-running it (lesion.py 74-85).
   * @returns {{code: Float32Array, active: Int32Array, driven: number}} active = sorted winner indices
   */
  kcCodeFromDrive(drive) {
    const rank = this.circuit.kc.tiebreakRank;
    const cand = [];
    for (let i = 0; i < this.nKc; i++) if (drive[i] > 0) cand.push(i);
    cand.sort((a, b) => drive[b] - drive[a] || rank[a] - rank[b]);
    const win = cand.slice(0, this.k);
    const code = new Float32Array(this.nKc);
    for (const i of win) code[i] = 1;
    if (this.silenced) for (let i = 0; i < this.nKc; i++) if (this.silenced[i]) code[i] = 0;
    const active = [];
    for (let i = 0; i < this.nKc; i++) if (code[i] !== 0) active.push(i);
    return { code, active: Int32Array.from(active), driven: cand.length };
  }

  /** Odour channels -> everything the feedforward pass computes. */
  encode(channels, strength = 1.0) {
    const input = this.inputVector(channels, strength);
    const drive = this.kcDrive(input);
    const { code, active, driven } = this.kcCodeFromDrive(drive);
    return { channels: channels.slice(), input, pnActive: this.activeInputs(channels), drive, code, active, driven };
  }

  /** The binary Kenyon-cell code of an odour. */
  kcCode(channels, strength = 1.0) {
    return this.encode(channels, strength).code;
  }

  /**
   * Summed plastic drive onto each MBON (MB 181-186): r_m = sum over its edges of counts * W * code, accumulated
   * in float32 in edge order (torch index_add_). Returns a Float32Array; with W = 1 every value is an integer.
   */
  mbonResponse(code, W = this.W) {
    const { indptr, kc, counts } = this.circuit.weights.kcMbon;
    const out = new Float32Array(this.nMbon);
    for (let m = 0; m < this.nMbon; m++) {
      let acc = 0;
      for (let e = indptr[m]; e < indptr[m + 1]; e++) {
        const k = code[kc[e]];
        if (k !== 0) acc = f32(acc + f32(f32(counts[e] * W[e]) * k));
      }
      out[m] = acc;
    }
    return out;
  }

  /** MBON drive with every weight at rest (W = 1), whatever has been learned. */
  untrainedResponse(code) {
    return this.mbonResponse(code, ONES_CACHE.get(this.nEdges));
  }

  // ------------------------------------------------------------------ learning
  deltaFor(us) {
    if (us === 'punish') return this.deltaPunish;
    if (us === 'reward') return this.deltaReward;
    throw new Error(`unknown reinforcement ${us} (use 'punish' or 'reward')`);
  }

  /**
   * One pairing block (MB 189-193), float32 as in torch:
   *   dW = -lr * (delta[m] * strength) * (code[kc] + recover_rate * (W - 1));  W = clamp(W + dW, 0, w_max)
   * `code` null (or all zero) = dopamine with no odour: with W = 1 nothing changes.
   * @returns {number} how many synapses changed
   */
  reinforce(code, us, strength = 1.0) {
    const delta = this.deltaFor(us);
    const { indptr, kc } = this.circuit.weights.kcMbon;
    const W = this.W;
    const negLr = f32(-this.lr);
    const s = f32(strength);
    const rr = f32(this.recoverRate);
    const wMin = f32(this.wMin);
    const wMax = f32(this.wMax);
    let changed = 0;
    for (let m = 0; m < this.nMbon; m++) {
      const a = f32(negLr * f32(delta[m] * s));
      if (a === 0) continue; // no dopamine reaches this MBON: dW = 0 for every synapse
      for (let e = indptr[m]; e < indptr[m + 1]; e++) {
        const w = W[e];
        const k = code ? code[kc[e]] : 0;
        const t = f32(k + f32(rr * f32(w - W_REST)));
        let nw = f32(w + f32(a * t));
        if (nw < wMin) nw = wMin;
        else if (nw > wMax) nw = wMax;
        if (nw !== w) changed++;
        W[e] = nw;
      }
    }
    return changed;
  }

  reset() {
    this.W.fill(1);
  }

  getWeights() {
    return this.W.slice();
  }

  setWeights(W) {
    if (W.length !== this.nEdges) throw new Error('weight vector has the wrong length');
    this.W.set(W);
  }

  // ------------------------------------------------------------------ compartments
  typeMask(name) {
    const t = this.circuit.mbon.type;
    const m = new Uint8Array(this.nMbon);
    for (let i = 0; i < this.nMbon; i++) m[i] = t[i] === name ? 1 : 0;
    return m;
  }

  /** MBONs whose type receives at least `thr` of the maximal dose: PPL101 -> MBON11, PAM -> MBON03/05/06.
   * Falls back to MBON11 if nothing qualifies (MB 152-157). */
  compartmentMask(us = 'punish', thr = this.circuit.constants.compartment_threshold ?? 0.5) {
    const d = this.deltaFor(us);
    const m = new Uint8Array(this.nMbon);
    let any = false;
    for (let i = 0; i < this.nMbon; i++) if (d[i] >= thr) { m[i] = 1; any = true; }
    return any ? m : this.typeMask('MBON11');
  }

  /** Types in a mask, sorted, for labels. */
  typesIn(mask) {
    const s = new Set();
    for (let i = 0; i < this.nMbon; i++) if (mask[i]) s.add(this.circuit.mbon.type[i]);
    return [...s].sort();
  }

  // ------------------------------------------------------------------ calibration and closed forms
  /** Per-MBON sums S1 = sum counts*code and S2 = sum counts*code^2 (float32, edge order). */
  _s1s2(code, codeB = null) {
    const { indptr, kc, counts } = this.circuit.weights.kcMbon;
    const S1 = new Float32Array(this.nMbon);
    const S2 = new Float32Array(this.nMbon);
    for (let m = 0; m < this.nMbon; m++) {
      let a1 = 0, a2 = 0;
      for (let e = indptr[m]; e < indptr[m + 1]; e++) {
        const k = code[kc[e]];
        if (k === 0) continue;
        const ek = f32(counts[e] * k);
        a1 = f32(a1 + ek);
        a2 = f32(a2 + f32(ek * (codeB ? codeB[kc[e]] : k)));
      }
      S1[m] = a1;
      S2[m] = a2;
    }
    return { S1, S2 };
  }

  /**
   * CALIBRATION (MB 199-215): set lr so that ONE pairing of `code` drops the drive of the MBONs in `mask` by
   * `target` (Hige et al. 2015: 0.9). With a binary code this returns 0.9 (to rounding) for any odour, because
   * S1 = S2. Capped at 1 / max(delta in the mask). Sets and returns this.lr. This number is a calibration, not a
   * result.
   */
  calibrateLr(code, mask = this.compartmentMask('punish'), target = HIGE_CHARGE_DROP, us = 'punish', strength = 1.0) {
    const s = f32(strength);
    const delta = this.deltaFor(us);
    const { S1, S2 } = this._s1s2(code);
    let denom = 0, s1 = 0, dmax = 0, any = false;
    for (let m = 0; m < this.nMbon; m++) {
      if (!mask[m]) continue;
      const d = f32(delta[m] * s);
      denom = f32(denom + f32(d * S2[m]));
      s1 = f32(s1 + S1[m]);
      dmax = any ? Math.max(dmax, d) : d;
      any = true;
    }
    if (denom === 0 || dmax === 0) {
      throw new Error('calibrateLr: no reinforcement reaches the masked compartment');
    }
    const lr = (target * s1) / denom;
    const cap = 1.0 / dmax;
    this.lrCapped = lr > cap;
    this.lr = Math.min(lr, cap);
    return this.lr;
  }

  /** Share of the probe's drive onto `mask` that passes through KCs active for the trained odour (MB 227-232).
   * With a binary code and one pairing from W = 1: drop = lr * delta * overlap (0.9 x overlap at MBON11). */
  overlap(codeTrain, codeProbe, mask) {
    const { S1, S2: S12 } = this._s1s2(codeProbe, codeTrain);
    const a = maskedSum(S12, mask);
    const b = maskedSum(S1, mask);
    return b > 0 ? a / b : NaN;
  }

  /** Published rule, p pairings of codeTrain from W = 1, probe codeProbe: the closed-form drop over `mask`
   * (MB 217-225), exact for recover_rate 1 and lr * delta <= 1. */
  analyticDrop(codeTrain, codeProbe, mask, p, us = 'punish', strength = 1.0) {
    const delta = this.deltaFor(us);
    const { S1, S2: S12 } = this._s1s2(codeProbe, codeTrain);
    let num = 0, den = 0;
    for (let m = 0; m < this.nMbon; m++) {
      if (!mask[m]) continue;
      const x = Math.min(1, Math.max(0, 1 - this.lr * delta[m] * strength));
      num += S12[m] * (1 - Math.pow(x, p));
      den += S1[m];
    }
    return den > 0 ? num / den : NaN;
  }

  /** Summary of the plastic weights (what changed, by how much). */
  weightSummary(W = this.W) {
    let sum = 0, min = Infinity, max = -Infinity, nChanged = 0, nBelow = 0;
    for (let e = 0; e < W.length; e++) {
      const w = W[e];
      sum += w;
      if (w < min) min = w;
      if (w > max) max = w;
      if (w !== 1) nChanged++;
      if (w < 0.99) nBelow++;
    }
    return { sum, min, max, nChanged, nBelow099: nBelow };
  }

  /** Per-MBON change in synaptic weight (sum over its edges of counts * (W - 1)): where the memory is written. */
  weightChangeByMbon(W = this.W) {
    const { indptr, counts } = this.circuit.weights.kcMbon;
    const out = new Float64Array(this.nMbon);
    for (let m = 0; m < this.nMbon; m++) {
      let s = 0;
      for (let e = indptr[m]; e < indptr[m + 1]; e++) s += counts[e] * (W[e] - 1);
      out[m] = s;
    }
    return out;
  }
}

// a shared all-ones weight vector for untrained responses (never written to)
const ONES_CACHE = {
  n: 0,
  v: null,
  get(n) {
    if (this.n !== n) {
      this.v = new Float32Array(n).fill(1);
      this.n = n;
    }
    return this.v;
  },
};
