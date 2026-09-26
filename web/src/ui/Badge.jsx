import { STATUS, STATUS_MEANING } from '../engine/index.js';

const CLASS = {
  [STATUS.CALIBRATION]: 'calibration',
  [STATUS.WIRING]: 'wiring',
  [STATUS.NEGATIVE]: 'negative',
  [STATUS.FITTED]: 'fitted',
  [STATUS.CONTROL]: 'control',
  [STATUS.RULE_CHANGE]: 'rule',
  [STATUS.QUOTED]: 'quoted',
  [STATUS.MODELLED_CHOICE]: 'choice',
  'SET BY ME': 'calibration',
  'FROM THE SCAN': 'wiring',
};

/** A status label. The text is always written out, so the colour is never the only cue. */
export default function Badge({ status, children, title }) {
  const cls = CLASS[status] || 'control';
  return (
    <span className={`badge badge--${cls}`} title={title || STATUS_MEANING[status] || undefined}>
      {children || status.toLowerCase()}
    </span>
  );
}

export { STATUS };
