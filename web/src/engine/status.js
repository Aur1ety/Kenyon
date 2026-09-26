// The labels the site must attach to every number, so a reader can tell a calibration from a result.

export const STATUS = {
  CALIBRATION: 'CALIBRATION',
  WIRING: 'WIRING',
  NEGATIVE: 'NEGATIVE',
  FITTED: 'FITTED',
  CONTROL: 'CONTROL',
  RULE_CHANGE: 'RULE CHANGE',
  QUOTED: 'QUOTED',
  MODELLED_CHOICE: 'MODELLED CHOICE',
};

export const STATUS_MEANING = {
  [STATUS.CALIBRATION]: 'Set by hand to match a measurement (one learning rate, set so one pairing gives the drop Hige et al. 2015 measured). Not a result.',
  [STATUS.WIRING]: 'Decided by the scanned wiring and the published rule; it could have come out wrong.',
  [STATUS.NEGATIVE]: 'Where the model fails, or cannot test the claim; reported next to the successes.',
  [STATUS.FITTED]: 'Its size comes from one fitted number (the motor gain beta).',
  [STATUS.CONTROL]: 'A control that can fail: the wiring is scrambled to see the result disappear.',
  [STATUS.RULE_CHANGE]: 'Not the published rule (Gkanias et al. 2022); shown to explain a negative, not as a fix.',
  [STATUS.QUOTED]: 'Read from the stored outputs of the recurrent whole-brain model (results/*.json, docs/RESULTS.md); not computed by this page.',
  [STATUS.MODELLED_CHOICE]: 'A modelled choice, read through a transmitter rule of thumb (Aso et al. 2014) and a fitted gain; not a fly\'s behaviour and not the simulated descending neurons.',
};

export const MODEL_DISCLAIMER =
  'A model of the fly\'s wiring (MaleCNS v1.0 connectome), not a recording of a fly. Odours are synthetic sets of glomeruli; ' +
  'the Kenyon-cell code is a winners-take-all rule standing in for APL inhibition; the learning rate is calibrated.';
