// Turns the engine's circuit (prepareCircuit() output of circuit.json) into point arrays for the 3D view.
// Display only: nothing here touches the model.
//
// Positions are the raw MaleCNS voxel coordinates from circuit.json (soma locations). The export measured
// the axes from the data: x grows toward the fly's LEFT, y grows dorsal -> ventral, z grows anterior ->
// posterior. The scene maps them to three.js as (x, -y, -z), which is a proper rotation (no mirror): with
// the camera on +Z you see the brain from the front, dorsal up, the fly's left on your right.

export const CLASSES = [
  { id: 'kc', label: 'Kenyon cells', short: 'Kenyon cells', color: '#5fd4f0', size: 12 },
  { id: 'pn', label: 'Olfactory projection neurons', short: 'Smell PNs', color: '#ffa94d', size: 16 },
  { id: 'vpn', label: 'Visual projection neurons', short: 'Vision PNs', color: '#b197fc', size: 15 },
  { id: 'mbon', label: 'Mushroom-body output neurons (MBONs)', short: 'MBONs', color: '#f1f3f5', size: 24 },
  { id: 'ppl1', label: "PPL1 dopamine neurons (the PPL1-γ1pedc cells among them are the model's punishment signal)", short: 'PPL1', color: '#ff6b6b', size: 20 },
  { id: 'pam', label: "PAM dopamine neurons (the model's reward signal)", short: 'PAM', color: '#69db7c', size: 13 },
  { id: 'apl', label: 'APL (feedback inhibition, anatomy only)', short: 'APL', color: '#adb5bd', size: 26 },
];
export const CLASS_INDEX = Object.fromEntries(CLASSES.map((c, i) => [c.id, i]));

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
  for (const d of ppl101) sizes[offset.dan + d] = 28;

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

/** Human-readable description of one drawn point (hover card and text view). */
export function describePoint(circuit, layout, i) {
  const { offset } = layout;
  const flagText = (f) =>
    f === 0 ? 'scanned soma' : f === 1 ? 'scanned point on the neurite (soma missing)' : 'display stand-in (mean of its type)';
  const pick = (key) => i - offset[key];
  let key = 'kc';
  for (const k of ['apl', 'dan', 'mbon', 'vpn', 'pn', 'kc']) {
    if (i >= offset[k]) { key = k; break; }
  }
  const j = pick(key);
  const g = circuit[key];
  const base = { body: g.body[j], side: g.side[j], where: flagText(g.posFlag[j]) };
  switch (key) {
    case 'kc':
      return { ...base, kind: 'Kenyon cell', type: g.type[j], index: j };
    case 'pn':
      return { ...base, kind: 'Olfactory projection neuron', type: g.type[j], extra: `glomerulus ${circuit.glomeruli[g.channel[j]]}`, index: j };
    case 'vpn':
      return { ...base, kind: 'Visual projection neuron', type: circuit.visualChannels[g.channel[j]], index: j };
    case 'mbon':
      return { ...base, kind: 'MBON', type: g.type[j], extra: `${g.compartmentLabel[j]} · ${g.nt[j]} (${g.valence[j] > 0 ? 'approach' : 'avoid'} by the rule of thumb)`, index: j };
    case 'dan':
      return { ...base, kind: g.family[j] === 'PAM' ? 'PAM dopamine neuron' : 'PPL1 dopamine neuron', type: g.type[j], extra: g.compartmentLabel[j] || '', index: j };
    default:
      return { ...base, kind: 'APL', type: 'APL', index: j };
  }
}
