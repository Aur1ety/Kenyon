// Reads the numbers the page quotes out of the stored result files (results/*.json, copied verbatim into
// public/data/results). Pure functions, no browser or Node imports: the page and tests/results.test.js share them.
//
// Nothing here is computed by the page's engine. These are the Python model's own outputs: the spreads over ten
// odour draws, the recurrent whole-brain model's descending-neuron readout, and the negatives. Every value carries
// the file it came from, so the page can cite it.

import { resultPath } from './resultFiles.js';

const stat = (s) => ({ mean: s.mean, sd: s.sd, min: s.min, max: s.max, n: s.n });
const pair = ([mean, sd]) => ({ mean, sd });

/** The share of lesion rows that are identities of the rule or the readout (lesion.json flags them). */
function lesions(raw) {
  const rows = raw.lesion.lesions;
  const row = (id) => rows.find((r) => r.lesion === id);
  const need = (id) => {
    const r = row(id);
    if (!r) throw new Error(`lesion.json has no row ${id}`);
    return r;
  };
  return {
    src: resultPath('lesion'),
    nRows: rows.length,
    nIdentities: rows.filter((r) => !r.independent_wiring_test).length,
    intactUnpaired: need('none').memory_unpaired_MBON11,
    aplUnpaired: need('APL_disinhibited').memory_unpaired_MBON11,
    aplShiftFrac: need('APL_disinhibited').learned_shift_frac_of_intact,
    kcgmShiftFrac: need('KCg-m_silenced').learned_shift_frac_of_intact,
    beta: raw.lesion.anchor.beta,
  };
}

/** Per-cell change as a fraction of the cell's own rate, averaged over the odour draws that list the cell.
 * Each recurrent run stores only its eight largest movers by absolute change. */
export function topMovers(json) {
  const acc = new Map();
  for (const s of json.per_seed) {
    for (const d of s.top_DNs_by_abs_change) {
      const key = `${d.type || 'untyped'} ${d.side === 'other' ? '' : d.side}`.trim();
      const a = acc.get(key) || { key, type: d.type, side: d.side, sum: 0, n: 0, base: 0 };
      a.sum += Math.abs(d.change) / d.base_rate;
      a.base += d.base_rate;
      a.n += 1;
      acc.set(key, a);
    }
  }
  return [...acc.values()]
    .map((a) => ({ key: a.key, type: a.type, side: a.side, frac: a.sum / a.n, baseRate: a.base / a.n, draws: a.n }))
    .sort((a, b) => b.frac - a.frac);
}

/** The smallest absolute change among a run's stored movers: every cell not listed changed by less. */
export function absFloor(json) {
  let m = Infinity;
  for (const s of json.per_seed) for (const d of s.top_DNs_by_abs_change) m = Math.min(m, Math.abs(d.change));
  return m;
}

/** In every odour draw, how many of the stored movers change by more than `thr` of their own rate (the smallest
 * count over the draws). A lower bound on the true count; docs/RESULTS.md 4.8 has the per-cell file. */
export function countAbove(json, thr) {
  let n = Infinity;
  for (const s of json.per_seed) {
    const k = s.top_DNs_by_abs_change.filter((d) => Math.abs(d.change) / d.base_rate > thr).length;
    n = Math.min(n, k);
  }
  return n;
}

function motor(raw) {
  const full = raw.motorFull;
  const v5 = raw.motorV5;
  const cut = raw.motorCut;
  const contacts = raw.anatomyFull.direct_contacts_readout_type_to_DN || [];
  const contactsV5 = raw.anatomyV5.direct_contacts_readout_type_to_DN || [];
  const byCell = new Map();
  for (const c of contacts) {
    const key = `${c.DN_type} ${c.DN_side}`;
    byCell.set(key, (byCell.get(key) || 0) + c.synapses);
  }
  const agg = full.aggregate;
  const THRESH = 0.005; // the 0.5%-of-own-rate line RESULTS 4.8 counts cells against
  return {
    src: { full: resultPath('motorFull'), v5: resultPath('motorV5'), cut: resultPath('motorCut'), anatomyFull: resultPath('anatomyFull'), anatomyV5: resultPath('anatomyV5') },
    nDN: full.dn_selection.n_DN,
    nDNv5: v5.dn_selection.n_DN,
    // the size of the whole-brain graph each run used (neurons and connections)
    graph: { nodes: full.graph.n_nodes, edges: full.graph.n_edges },
    graphV5: { nodes: v5.graph.n_nodes, edges: v5.graph.n_edges },
    nDraws: full.per_seed.length,
    nStored: Math.min(...full.per_seed.map((x) => x.top_DNs_by_abs_change.length), ...cut.per_seed.map((x) => x.top_DNs_by_abs_change.length)),
    threshold: THRESH,
    nAbove: countAbove(full, THRESH),
    nAboveV5: countAbove(v5, THRESH),
    nAbove5pct: agg.n_DN_gt_5pct.max,
    movers: topMovers(full),
    moversV5: topMovers(v5),
    moversCut: topMovers(cut),
    cutAbsFloor: absFloor(cut),
    cutPooled: cut.aggregate.memory_pooled_L1.mean,
    contacts: contacts.map((c) => ({ dn: `${c.DN_type} ${c.DN_side}`, from: c.from_side, synapses: c.synapses })),
    contactsByCell: [...byCell.entries()].map(([cell, synapses]) => ({ cell, synapses })),
    synapses: contacts.reduce((s, c) => s + c.synapses, 0),
    synapsesV5: contactsV5.reduce((s, c) => s + c.synapses, 0),
    maxFrac: agg.memory_max_frac_of_own_rate.mean,
    maxFracV5: v5.aggregate.memory_max_frac_of_own_rate.mean,
    pooled: agg.memory_pooled_L1.mean,
    pooledV5: v5.aggregate.memory_pooled_L1.mean,
    p95: agg.memory_p95_frac_of_own_rate.mean,
    p95Max: agg.memory_p95_frac_of_own_rate.max, // the largest over the odour draws: the bound "95% move by less than"
    untouchedPooled: agg.untouched_pooled_L1.mean,
    specificity: agg.memory_pooled_L1.mean / agg.untouched_pooled_L1.mean,
    mbon11OnlyCos: agg.MBON11_only_cos_with_full_memory.mean,
    overOdour: agg.memory_over_odour_MB_route.mean,
    overOdourV5: v5.aggregate.memory_over_odour_MB_route.mean,
    crossDrawCos: agg.cross_draw_cosine_of_DN_pattern.mean,
  };
}

/**
 * @param raw {Record<keyof RESULT_FILES, object>} the parsed result files
 * @returns the quoted values, grouped by file, each group with its `src` path
 */
export function extractResults(raw) {
  const olf = raw.seeds.per_modality.olfactory;
  const vis = raw.seeds.per_modality.visual;
  const gen = olf.generalisation_drop_MBON11;
  const beh = raw.behaviour;
  const wild = (beh.ground_truth_PI.match(/\d+\.\d+/g) || []).map(Number);
  if (wild.length < 2) throw new Error('beh5_olf.json: could not read the wild-type index range');
  const byBeta = (o, f) => Object.fromEntries(Object.entries(o).map(([b, v]) => [b, f(v)]));
  const mm = beh.multi_memory_choices;
  const choice = (k) => {
    const v = Object.entries(mm).find(([key]) => key.startsWith(`P(${k}`));
    if (!v) throw new Error(`beh5_olf.json: no choice ${k}`);
    return [v[1].before, v[1].after];
  };
  const sparseKeys = ['sparseNone', 'sparse2', 'sparse5', 'sparse10'];
  const sparse = sparseKeys.map((k) => ({
    src: resultPath(k),
    vrest: raw[k].kc_vrest,
    frac: raw[k].with_APL.kc_frac_active_mean,
  }));
  const on = sparse.filter((s) => s.frac > 0).map((s) => s.frac);
  const mag = raw.magnitude.measured_test_pulse_arms;

  return {
    seeds: {
      src: resultPath('seeds'),
      n: raw.seeds.n_seeds,
      paired: stat(olf.paired_A_MBON11),
      unpaired: stat(olf.unpaired_MBON11_mean),
      worst: stat(olf.unpaired_MBON11_worst_odour),
      share: stat(olf.share_of_depression_in_MBON11),
      ladder: Object.entries(gen).map(([k, v]) => {
        const m = /shared_(\d+)_of_(\d+)/.exec(k);
        return { shared: Number(m[1]), of: Number(m[2]), ...stat(v) };
      }),
      rewardCompartments: stat(olf.reward_C_reward_compartments),
      rewardAtMBON11: stat(olf.reward_C_at_MBON11),
      coexistA: stat(olf.coexist_A_punish_C_reward_A_MBON11),
      coexistC: stat(olf.coexist_A_punish_C_reward_C_compartments),
      retained: stat(olf.same_compartment_A_retained_fraction),
      kcCosine: stat(olf.kc_cross_odour_cos_mean),
      visual: {
        unpaired: stat(vis.unpaired_MBON11_mean),
        worst: stat(vis.unpaired_MBON11_worst_odour),
        ladder: Object.entries(vis.generalisation_drop_MBON11).map(([k, v]) => {
          const m = /shared_(\d+)_of_(\d+)/.exec(k);
          return { shared: Number(m[1]), of: Number(m[2]), ...stat(v) };
        }),
        retained: stat(vis.same_compartment_A_retained_fraction),
        nDrivable: vis.circuit.n_drivable_KC,
      },
      nDrivable: olf.circuit.n_drivable_KC,
    },
    behaviour: {
      src: resultPath('behaviour'),
      wildType: [Math.min(...wild), Math.max(...wild)],
      wildTypeText: beh.ground_truth_PI,
      piSeed0: byBeta(beh.tmaze_PI_by_beta, (v) => v.PI_trained),
      piTenPairs: byBeta(beh.tmaze_PI_over_seeds.by_beta, (v) => pair(v.PI_mean_sd)),
      nPairs: beh.tmaze_PI_over_seeds.n_seeds,
      scoreShift: pair(beh.tmaze_PI_over_seeds.learned_score_shift_mean_sd),
      choiceBeta: mm.beta,
      choices: { 'C over A': choice('C_rewarded over A'), 'D over A': choice('D_untouched over A'), 'C over D': choice('C_rewarded over D') },
      punishTypes: beh.punish_compartment_types,
      rewardTypes: beh.reward_compartment_types,
      valenceCounts: beh.mbon_valence_counts,
    },
    behaviourVisual: {
      src: resultPath('behaviourVisual'),
      piTenPairs: byBeta(raw.behaviourVisual.tmaze_PI_over_seeds.by_beta, (v) => pair(v.PI_mean_sd)),
      nPairs: raw.behaviourVisual.tmaze_PI_over_seeds.n_seeds,
      // how strongly the untrained circuit already prefers one stimulus of a pair, and how the index falls with it
      innateBias: byBeta(raw.behaviourVisual.tmaze_PI_over_seeds.by_beta, (v) => pair(v.abs_innate_bias_mean_sd)),
      corrWithBias: byBeta(raw.behaviourVisual.tmaze_PI_over_seeds.by_beta, (v) => v.corr_PI_vs_abs_innate_bias),
      innateBiasSmell: byBeta(beh.tmaze_PI_over_seeds.by_beta, (v) => pair(v.abs_innate_bias_mean_sd)),
      // the drop in the punished stimulus's approach score: the size of what one pairing writes, free of beta
      scoreShift: pair(raw.behaviourVisual.tmaze_PI_over_seeds.learned_score_shift_mean_sd),
    },
    shuffled: {
      src: resultPath('behaviourShuffled'),
      piSeed0: byBeta(raw.behaviourShuffled.tmaze_PI_by_beta, (v) => v.PI_trained),
      punishTypes: raw.behaviourShuffled.punish_compartment_types,
    },
    recall: {
      src: resultPath('recall'),
      slope: raw.recall.recall_vs_cue_slope,
      byCue: Object.entries(raw.recall.partial_cue_by_glomeruli).map(([k, v]) => ({ cue: k, recall: v.recall_fraction, overlap: v.overlap_at_MBON11 })),
    },
    lesion: lesions(raw),
    magnitude: {
      src: resultPath('magnitude'),
      measured: mag.measured.ratio,
      sem: mag.measured.sem_propagated,
      trace: mag.candidates.eligibility_trace.ratio,
      nCandidates: Object.keys(mag.candidates).length,
      closest: mag.closest_to_measurement,
      separates: mag.does_it_separate_them,
    },
    apl: {
      src: resultPath('apl'),
      nSeeds: raw.apl.n_seeds,
      uniformAtLeastAsDistinct: Math.round(raw.apl.support_fractions.uniform_le_real * raw.apl.n_seeds),
    },
    sparse: {
      src: sparse.map((s) => s.src),
      rows: sparse,
      activeRange: on.length ? [Math.min(...on), Math.max(...on)] : null,
      nAllOff: sparse.filter((s) => s.frac === 0).length,
      nThresholds: sparse.length,
    },
    pathway: {
      src: resultPath('pathway'),
      pctModulated: raw.pathway.steerDN_input_pct_memory_modulated, // already a percentage
      steering: raw.pathway.steering_DNs,
      directSynapses: raw.pathway.direct_MBON_to_steerDN_synapses,
    },
    motor: motor(raw),
  };
}
