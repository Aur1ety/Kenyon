// The stored result files (results/ in the repository) that the website cites. Verbatim copies live in
// public/data/results; scripts/sync_results.mjs refreshes them and tests/results.test.js checks they match.
// Plain data, no browser or Node imports, so the sync script, the tests and the page can all read it.

export const RESULT_FILES = {
  seeds: 'mb_seeds.json', // ten independent odour draws: the spreads the README quotes (seeds.py)
  behaviour: 'beh5_olf.json', // modelled choice and T-maze index, smell (behaviour.py)
  behaviourShuffled: 'beh5_olf_shufdan.json', // the same with the dopamine-to-MBON map shuffled
  behaviourVisual: 'beh5_vis.json', // modelled choice and T-maze index, vision (behaviour.py --modality visual, section 2.3)
  recall: 'recall.json', // partial cue (recall.py, section 4.3)
  lesion: 'lesion.json', // lesions (lesion.py, section 4.2)
  magnitude: 'magnitude.json', // is the size of the memory a prediction? (magnitude.py, section 4.6)
  apl: 'apl.json', // the Kenyon code from the real APL loop (apl.py, section 4.5)
  pathway: 'pathway.json', // MBON11 to the steering neurons, anatomy only (pathway.py, section 4.4)
  sparseNone: 'kcsparse2_none_cpu.json', // recurrent model, Kenyon-cell threshold sweep (section 3.1)
  sparse2: 'kcsparse2_-2_cpu.json',
  sparse5: 'kcsparse2_-5_cpu.json',
  sparse10: 'kcsparse2_-10_cpu.json',
  motorFull: 'motor2_full.json', // recurrent model, descending neurons, unpruned graph (section 4.8)
  motorV5: 'motor2_v5.json', // the same on the Doom graph
  motorCut: 'motor2_full_cut.json', // unpruned graph with MBON11's direct synapses silenced
  anatomyFull: 'motor_anatomy_full.json', // direct MBON11 -> descending-neuron contacts, unpruned graph
  anatomyV5: 'motor_anatomy_v5.json', // the same on the Doom graph
};

/** The repository path a reader can open for a key of RESULT_FILES. */
export const resultPath = (key) => `results/${RESULT_FILES[key]}`;
