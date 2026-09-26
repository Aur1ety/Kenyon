// Turns the engine's circuit (prepareCircuit() output of circuit.json) into point arrays for the 3D view.
// Display only: nothing here touches the model.
//
// Positions are the raw MaleCNS voxel coordinates from circuit.json (soma locations). The export measured
// the axes from the data: x grows toward the fly's LEFT, y grows dorsal -> ventral, z grows anterior ->
// posterior. The scene maps them to three.js as (x, -y, -z), which is a proper rotation (no mirror): with
// the camera on +Z you see the brain from the front, dorsal up, the fly's left on your right.

// Per cell class: label = the full name (key tooltip and screen readers), everyday words first and the technical
// name in brackets; short = the key's everyday name; tech = the technical short name (shown when "Scientific
// names" is on); line = one plain line on what the colour stands for. A text that needs a count is a function of
// the layout (read it with classText), so no number is typed here.
export const CLASSES = [
  {
    id: 'kc', label: 'Memory neurons (Kenyon cells)', short: 'Memory neurons', tech: 'Kenyon cells',
    line: 'Store the memory. A smell switches on a small set.', color: '#5fd4f0', size: 12,
  },
  {
    id: 'pn', label: 'Smell-input neurons (olfactory projection neurons)', short: 'Smell input', tech: 'Smell PNs',
    line: 'Carry a smell to the memory neurons.', color: '#ffa94d', size: 16,
  },
  {
    id: 'vpn', label: 'Sight-input neurons (visual projection neurons)', short: 'Sight input', tech: 'Vision PNs',
    line: 'Carry sight to the memory neurons.', color: '#b197fc', size: 15,
  },
  {
    id: 'mbon', label: 'Output neurons (mushroom-body output neurons, MBONs)', short: 'Output neurons', tech: 'MBONs',
    line: 'Read the memory neurons; brighter means a stronger signal.', color: '#f1f3f5', size: 24,
  },
  {
    id: 'ppl1',
    label: (L) => `Punishment group: ${L.counts.ppl1} dopamine neurons (PPL1); ${L.ppl101.length} of them (PPL1-γ1pedc) are the model's punishment signal`,
    short: 'Punishment group', tech: 'PPL1',
    line: (L) => `The ${L.ppl101.length} big ones carry the punishment signal.`, color: '#ff6b6b', size: 20,
  },
  {
    id: 'pam', label: 'Reward signal: dopamine neurons (PAM)', short: 'Reward signal', tech: 'PAM',
    line: 'Carry the reward signal.', color: '#69db7c', size: 13,
  },
  {
    id: 'apl', label: 'Brake neuron (APL): keeps only a few memory neurons on; drawn, not simulated', short: 'Brake neuron', tech: 'APL',
    line: 'Keeps most memory neurons quiet. Drawn, not simulated.', color: '#adb5bd', size: 26,
  },
];
export const CLASS_INDEX = Object.fromEntries(CLASSES.map((c, i) => [c.id, i]));

/** A CLASSES text field, filled in from the layout when it needs a count. */
export function classText(c, layout, field) {
  const v = c[field];
  return typeof v === 'function' ? (layout ? v(layout) : '') : v;
}

export const SCALE = 1 / 10000; // voxels -> scene units

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function mean(list) {
  const m = [0, 0, 0];
  if (!list.length) return m;
  for (const p of list) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }
  return m.map((v) => v / list.length);
}

/**
 * @param {object} circuit the engine's prepared circuit (src/engine/circuit.js)
 * @returns layout with Float32Array positions (scene units) and per-point metadata
 */
export function buildLayout(circuit) {
  const groups = [
    ['kc', circuit.kc],
    ['pn', circuit.pn],
    ['vpn', circuit.vpn],
    ['mbon', circuit.mbon],
    ['dan', circuit.dan],
    ['apl', circuit.apl],
  ];
  const count = groups.reduce((s, [, g]) => s + g.n, 0);

  // Centre on the mushroom-body core (every drawn soma except the visual projection neurons, whose cell
  // bodies sit far out in the optic lobes and would pull the view off the midline).
  const box = (list) => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const [, g] of list) {
      for (let i = 0; i < g.n; i++) {
        for (let a = 0; a < 3; a++) {
          const v = g.pos[3 * i + a];
          if (v < lo[a]) lo[a] = v;
          if (v > hi[a]) hi[a] = v;
        }
      }
    }
    return { lo, hi };
  };
  const core = box(groups.filter(([k]) => k !== 'vpn'));
  const every = box(groups);
  const centre = core.lo.map((v, a) => (v + core.hi[a]) / 2);
  const halfExtent = (b) => b.lo.map((v, a) => (Math.max(Math.abs(v - centre[a]), Math.abs(b.hi[a] - centre[a]))) * SCALE);

  const positions = new Float32Array(count * 3);
  const cls = new Uint8Array(count);
  const shape = new Uint8Array(count); // 0 scanned soma, 1 point on the neurite, 2 display stand-in
  const offset = {};
  const members = { kc: [], pn: [], vpn: [], mbon: [], ppl1: [], pam: [], apl: [] };

  let p = 0;
  for (const [key, g] of groups) {
    offset[key] = p;
    for (let i = 0; i < g.n; i++, p++) {
      const x = g.pos[3 * i], y = g.pos[3 * i + 1], z = g.pos[3 * i + 2];
      positions[3 * p] = (x - centre[0]) * SCALE;
      positions[3 * p + 1] = -(y - centre[1]) * SCALE;
      positions[3 * p + 2] = -(z - centre[2]) * SCALE;
      let c = key;
      if (key === 'dan') c = g.family[i] === 'PAM' ? 'pam' : 'ppl1';
      cls[p] = CLASS_INDEX[c];
      const f = g.posFlag ? g.posFlag[i] : 0;
      shape[p] = f === 0 ? 0 : f === 1 ? 1 : 2;
      members[c].push(p);
    }
  }

  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const c = CLASSES[cls[i]];
    const rgb = hexToRgb(c.color);
    colors.set(rgb, 3 * i);
    sizes[i] = c.size;
  }

  const at = (i) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];

  // named cells the story needs
  const mbonType = circuit.mbon.type;
  const mbonIdx = (pred) => mbonType.map((t, i) => (pred(t, i) ? i : -1)).filter((i) => i >= 0);
  const mbon11 = mbonIdx((t) => t === 'MBON11');
  const thr = circuit.constants.compartment_threshold ?? 0.5;
  const punishComp = mbonIdx((t, i) => circuit.mbon.deltaPunish[i] >= thr);
  const rewardComp = mbonIdx((t, i) => circuit.mbon.deltaReward[i] >= thr);
  // the dopamine cells the model uses: PPL101 for punishment, every PAM cell for reward
  const ppl101 = Array.from(circuit.dan.punishIdx);
  const pam = Array.from(circuit.dan.rewardIdx);

  // enlarge the story's cells so they read at a glance
  for (const m of mbon11) sizes[offset.mbon + m] = 34;
  for (const d of ppl101) sizes[offset.dan + d] = 32;

  // label anchors: population centroids per side, and the named cells
  const bySide = (key, list, sideArr) => {
    const L = [], R = [];
    for (const local of list) {
      const s = sideArr[local];
      (s === 'L' ? L : R).push(at(offset[key] + local));
    }
    return { L: mean(L), R: mean(R) };
  };
  const all = (n) => Array.from({ length: n }, (_, i) => i);
  const anchors = {
    kc: bySide('kc', all(circuit.kc.n), circuit.kc.side),
    pn: bySide('pn', all(circuit.pn.n), circuit.pn.side),
    vpn: bySide('vpn', all(circuit.vpn.n), circuit.vpn.side),
    pam: bySide('dan', pam, circuit.dan.side),
    mbon11: mbon11.map((m) => ({ side: circuit.mbon.side[m], p: at(offset.mbon + m) })),
    ppl101: ppl101.map((d) => ({ side: circuit.dan.side[d], p: at(offset.dan + d) })),
  };

  let radius = 0;
  for (let i = 0; i < count; i++) {
    const r = Math.hypot(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]);
    if (r > radius) radius = r;
  }

  return {
    count, positions, colors, sizes, cls, shape, offset, members, centre, radius, anchors,
    // half extents in scene units (x, y, z before the axis flip), for framing the camera
    extentCore: halfExtent(core),
    extentAll: halfExtent(every),
    mbon11, punishComp, rewardComp, ppl101, pam,
    counts: Object.fromEntries(Object.entries(members).map(([k, v]) => [k, v.length])),
    standIns: {
      kc: circuit.kc.posFlag.filter((f) => f >= 2).length,
      mbon: circuit.mbon.posFlag.filter((f) => f >= 2).length,
      neuriteKc: circuit.kc.posFlag.filter((f) => f === 1).length,
      neuritePn: circuit.pn.posFlag.filter((f) => f === 1).length,
    },
    at,
  };
}

/**
 * Description of one drawn point for the hover card: everyday words first, the technical name in brackets.
 * `side` is the brain's own left or right; `where` says how the point was placed. `science` (the "Scientific
 * names" switch) swaps the plain extra line of output and signal neurons for their compartment and transmitter.
 */
export function describePoint(circuit, layout, i, science = false) {
  const { offset } = layout;
  const flagText = (f) =>
    f === 0 ? 'scanned cell body' : f === 1 ? 'a scanned point on its branch (no cell body)' : 'average spot for its type';
  const sideText = (s) => (s === 'L' ? 'left side' : s === 'R' ? 'right side' : s);
  const pick = (key) => i - offset[key];
  let key = 'kc';
  for (const k of ['apl', 'dan', 'mbon', 'vpn', 'pn', 'kc']) {
    if (i >= offset[k]) { key = k; break; }
  }
  const j = pick(key);
  const g = circuit[key];
  const base = { body: g.body[j], side: sideText(g.side[j]), where: flagText(g.posFlag[j]) };
  switch (key) {
    case 'kc':
      return { ...base, kind: 'Memory neuron (Kenyon cell)', type: g.type[j], index: j };
    case 'pn':
      return {
        ...base, kind: 'Smell-input neuron (olfactory projection neuron)', type: g.type[j],
        extra: `smell channel ${circuit.glomeruli[g.channel[j]]} (glomerulus)`, index: j,
      };
    case 'vpn':
      return { ...base, kind: 'Sight-input neuron (visual projection neuron)', type: circuit.visualChannels[g.channel[j]], extra: 'sight channel', index: j };
    case 'mbon': {
      const way = g.valence[j] > 0 ? '‘go toward’' : '‘stay away’';
      const mbon11 = g.type[j] === 'MBON11';
      // plain words: what its signal counts as (the author's rule of thumb, not a measured fact), and for the
      // go-toward neuron why a lesson turns the model away
      const rule = `its signal counts as ${way} (a rule of thumb from studies of real flies)`;
      const plain = mbon11 && g.valence[j] > 0
        ? `${rule}; a lesson weakens it, so the model turns away from what was punished`
        : rule;
      return {
        ...base,
        kind: mbon11 ? 'Go-toward neuron (MBON11)' : 'Output neuron (MBON)',
        type: g.type[j],
        extra: science ? `${g.compartmentLabel[j]} · ${g.nt[j]} · counts as ${way} by the transmitter rule` : plain,
        index: j,
      };
    }
    case 'dan': {
      const punish = Array.prototype.includes.call(g.punishIdx, j);
      const pam = g.family[j] === 'PAM';
      const kind = pam
        ? 'Reward-signal neuron (PAM dopamine)'
        : punish ? 'Punishment-signal neuron (PPL1-γ1pedc)' : 'Punishment-group neuron (PPL1 dopamine)';
      const plain = pam ? 'fires with the reward' : punish ? 'fires with the punishment' : '';
      return { ...base, kind, type: g.type[j], extra: science ? g.compartmentLabel[j] || '' : plain, index: j };
    }
    default:
      return { ...base, kind: 'Brake neuron (APL)', type: 'APL', index: j };
  }
}
