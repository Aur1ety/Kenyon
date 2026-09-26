// Loads circuit.json (exported by web/scripts/export_web_data.py) into typed arrays.
//
// What the file is: the feedforward mushroom body of docs/RESULTS.md sections 1 and 2, with every cell and
// synapse count taken from the MaleCNS v1.0 connectome. It is a model of the wiring, not a recording of a fly.
//
// Cell order is the model's own order (kenyon/model/mushroom_body.py reads the same cache), and the KC->MBON
// synapses are listed in the model's plastic-edge order, so edge e here is weight W[e] in the Python model.

export const CIRCUIT_FORMAT = 'kenyon-web-circuit/1';

const toInt32 = (a) => Int32Array.from(a);
const toUint8 = (a) => Uint8Array.from(a);
const toF64 = (a) => Float64Array.from(a);
// Per-MBON dopamine doses are float32 in the model; the export prints 9 significant digits, which round-trips.
const toF32 = (a) => Float32Array.from(a, (x) => Math.fround(x));

function csr(w, colsKey = 'indices') {
  const [nRows, nCols] = w.shape;
  const indptr = toInt32(w.indptr);
  const cols = toInt32(w[colsKey]);
  const counts = toInt32(w.counts);
  if (indptr.length !== nRows + 1 || cols.length !== counts.length || indptr[nRows] !== counts.length) {
    throw new Error(`circuit.json: malformed CSR block (${w.layout || colsKey})`);
  }
  return { nRows, nCols, indptr, cols, counts };
}

function population(p, extra = {}) {
  const out = {
    n: p.n,
    body: p.body, // body IDs (all below 2^53, safe as JS numbers)
    side: p.side || [],
    pos: p.pos ? toF64(p.pos) : new Float64Array(0), // raw MaleCNS voxel coordinates, flat [x0,y0,z0,x1,...]
    posFlag: p.pos_flag ? toUint8(p.pos_flag) : new Uint8Array(0), // 0 scanned soma, 1 neurite point, 2-4 stand-in
    ...extra,
  };
  if (out.pos.length !== 3 * out.n || out.posFlag.length !== out.n) {
    throw new Error('circuit.json: position arrays do not match the cell count');
  }
  return out;
}

/**
 * Turn the parsed circuit.json object into the engine's circuit: typed arrays plus the labels the UI needs.
 * The input object is not modified.
 */
export function prepareCircuit(json) {
  if (!json || json.format !== CIRCUIT_FORMAT) {
    throw new Error(`expected a ${CIRCUIT_FORMAT} object, got ${json && json.format}`);
  }
  const W = json.weights;
  const pnKc = csr(W.pn_kc, 'indices');
  const vpnKc = csr(W.vpn_kc, 'indices');
  const km = csr(W.kc_mbon, 'kc');

  const nKc = json.kc.n;
  const nMbon = json.mbon.n;
  if (pnKc.nRows !== nKc || vpnKc.nRows !== nKc || km.nRows !== nMbon || km.nCols !== nKc) {
    throw new Error('circuit.json: weight shapes do not match the populations');
  }
  if (pnKc.nCols !== json.pn.n || vpnKc.nCols !== json.vpn.n) {
    throw new Error('circuit.json: input weight columns do not match the projection-neuron counts');
  }

  // edge -> MBON (the CSR row), for per-edge work in the learning rule
  const edgeMbon = new Int32Array(km.counts.length);
  for (let m = 0; m < nMbon; m++) {
    for (let e = km.indptr[m]; e < km.indptr[m + 1]; e++) edgeMbon[e] = m;
  }

  const kcTypeIdx = toInt32(json.kc.type);
  const kcTypeNames = json.kc.type_names.slice();
  const kcType = Array.from(kcTypeIdx, (i) => kcTypeNames[i]);

  const dm = W.dan_mbon;
  const c = json.constants;

  const circuit = {
    format: json.format,
    what: json.what,
    source: json.source,
    coords: json.coords,
    constants: c,
    glomeruli: json.glomeruli.slice(),
    visualChannels: json.visual_channels.slice(),

    pn: population(json.pn, { type: json.pn.type, channel: toInt32(json.pn.glomerulus) }),
    vpn: population(json.vpn, { channel: toInt32(json.vpn.channel) }),
    kc: population(json.kc, {
      typeIndex: kcTypeIdx,
      typeNames: kcTypeNames,
      type: kcType,
      smellDrivable: toUint8(json.kc.smell_drivable),
      visionDrivable: toUint8(json.kc.vision_drivable),
      tiebreakRank: toInt32(json.kc.tiebreak_rank),
    }),
    mbon: population(json.mbon, {
      type: json.mbon.type,
      instance: json.mbon.instance,
      compartment: json.mbon.compartment,
      compartmentLabel: json.mbon.compartment_label,
      nt: json.mbon.nt,
      valence: toF64(json.mbon.valence), // +1 approach (GABA/ACh), -1 avoid (glutamate): a rule of thumb (Aso 2014)
      deltaPunish: toF32(json.mbon.delta_punish),
      deltaReward: toF32(json.mbon.delta_reward),
      inputFromKc: json.mbon.input_from_kc ? toF64(json.mbon.input_from_kc) : null,
      inputTotal: json.mbon.input_total_whole_connectome ? toF64(json.mbon.input_total_whole_connectome) : null,
    }),
    dan: population(json.dan, {
      type: json.dan.type,
      family: json.dan.family,
      instance: json.dan.instance,
      compartment: json.dan.compartment,
      compartmentLabel: json.dan.compartment_label,
      isPunish: toUint8(json.dan.is_punish),
      isReward: toUint8(json.dan.is_reward),
      targetsByType: json.dan.targets_by_type,
    }),
    apl: population(json.apl, { note: json.apl.note }),

    weights: {
      pnKc, // rows = KCs, cols = olfactory PNs
      vpnKc, // rows = KCs, cols = visual PNs
      kcMbon: { ...km, kc: km.cols, edgeMbon }, // rows = MBONs; edge e is plastic synapse e
      danMbon: { mbon: toInt32(dm.mbon), dan: toInt32(dm.dan), counts: toInt32(dm.counts), shape: dm.shape },
    },
    nEdges: km.counts.length,
    mbon11: toInt32(c.mbon11_index),
  };

  // index lists of the dopamine neurons the model uses as the punishment and reward signals
  circuit.dan.punishIdx = indicesWhere(circuit.dan.isPunish);
  circuit.dan.rewardIdx = indicesWhere(circuit.dan.isReward);
  circuit.kc.nDrivable = {
    olfactory: count(circuit.kc.smellDrivable),
    visual: count(circuit.kc.visionDrivable),
  };
  return circuit;
}

function indicesWhere(mask) {
  const out = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i);
  return Int32Array.from(out);
}

function count(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i] ? 1 : 0;
  return n;
}

/**
 * Fetch and prepare circuit.json. In the Vite app the file is served from public/data, so the default URL is
 * 'data/circuit.json' relative to the page; pass `import.meta.env.BASE_URL + 'data/circuit.json'` if the site
 * is not served from the root.
 */
export async function loadCircuit(url = 'data/circuit.json', fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('loadCircuit: no fetch available');
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`loadCircuit: ${url} returned ${res.status}`);
  return prepareCircuit(await res.json());
}
