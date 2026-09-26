// Number formatting for the page. Display only.

const intFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export const int = (x) => (x == null || Number.isNaN(x) ? '–' : intFmt.format(Math.round(x)));
export const frac = (x, d = 2) => (x == null || Number.isNaN(x) ? '–' : x.toFixed(d));
export const pct = (x, d = 0) => (x == null || Number.isNaN(x) ? '–' : `${(x * 100).toFixed(d)}%`);
export const signedPct = (x, d = 0) => {
  if (x == null || Number.isNaN(x)) return '–';
  const v = x * 100;
  const s = v.toFixed(d);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s.replace('-', '')}%`;
};
/** A drop (0..1) as a change, e.g. 0.9 -> "−90%". */
export const dropAsChange = (d, digits = 0) => (d == null || Number.isNaN(d) ? '–' : signedPct(-d, digits));
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
/** 0.0001191 -> "1.2 × 10⁻⁴" */
export const sci = (x, d = 1) => {
  if (x == null || Number.isNaN(x)) return '–';
  const [m, e] = x.toExponential(d).split('e');
  const exp = String(Number(e)).split('').map((c) => SUP[c]).join('');
  return `${m} × 10${exp}`;
};
/** A mean ± SD from a results file, e.g. {mean: 0.0929, sd: 0.0257} -> "0.09 ± 0.03". */
export const pm = (s, d = 2) => (s == null || s.mean == null ? '–' : s.sd ? `${s.mean.toFixed(d)} ± ${s.sd.toFixed(d)}` : s.mean.toFixed(d));
/** Small counts in words, as the write-up prints them ("nine of ten"). */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const words = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : int(n));
/** 19513953 -> "19.5 million"; 151856684 -> "151.9 million". */
export const millions = (x, d = 1) => (x == null || Number.isNaN(x) ? '–' : `${(x / 1e6).toFixed(d)} million`);
/** A share (0..1) as a whole percentage that never rounds up to a full 100% it hasn't reached: 0.999 -> "99.9%",
 * 0.99999 -> "over 99.9%". */
export const pctUnder = (x) => {
  if (x == null || Number.isNaN(x)) return '–';
  if (x < 1 && pct(x) === '100%') return pct(x, 1) === '100.0%' ? 'over 99.9%' : pct(x, 1);
  return pct(x);
};
/** The same as a signed change for a drop: 0.9 -> "−90%", 0.999 -> "−99.9%". */
export const dropAsChangeUnder = (d) => {
  if (d == null || Number.isNaN(d)) return '–';
  if (d > 0 && d < 1 && pct(d) === '100%') return pct(d, 1) === '100.0%' ? '−99.9%' : `−${pct(d, 1)}`;
  return dropAsChange(d);
};
/** A drop (0..1) as plain words: 0.9 -> "90% weaker", -0.1 -> "10% stronger". */
export const weakerText = (d) => (d == null || Number.isNaN(d) ? '–' : d >= 0 ? `${pctUnder(d)} weaker` : `${pct(-d)} stronger`);
/** A drop (0..1) as a verb phrase: 0.06 -> "fell by 6%", -0.1 -> "rose by 10%". */
export const fellText = (d) => (d == null || Number.isNaN(d) ? '–' : d >= 0 ? `fell by ${pctUnder(d)}` : `rose by ${pct(-d)}`);
/** A drop (0..1) as a short change: 0.06 -> "down 6%". */
export const downText = (d) => (d == null || Number.isNaN(d) ? '–' : d >= 0 ? `down ${pctUnder(d)}` : `up ${pct(-d)}`);
/** 0.000119 -> "about one part in 8,400" (two significant figures). */
export const onePartIn = (x) => {
  if (!(x > 0)) return '–';
  const n = 1 / x;
  const p = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return `about one part in ${int(Math.round(n / p) * p)}`;
};
