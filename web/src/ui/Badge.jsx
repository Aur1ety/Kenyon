import { STATUS } from '../engine/index.js';
import { PLAIN_STATUS, badgeTitle } from './copy.js';

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

/**
 * A status label. The text is always written out, so the colour is never the only cue.
 * Plain mode (the default) says it in everyday words ("set by me"); `technical` shows the status itself
 * ("calibration"), as the "For scientists" part of the page does. Either way the tooltip gives both.
 */
export default function Badge({ status, children, title, technical = false }) {
  const cls = CLASS[status] || 'control';
  const text = children || (technical ? status.toLowerCase() : PLAIN_STATUS[status] || status.toLowerCase());
  return (
    <span className={`badge badge--${cls}${technical ? '' : ' badge--plain'}`} title={title || badgeTitle(status, technical) || undefined}>
      {text}
    </span>
  );
}

export { STATUS };
