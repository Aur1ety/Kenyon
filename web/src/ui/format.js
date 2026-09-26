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
/** 0.000119 -> "about one part in 8,400" (two significant figures). */
export const onePartIn = (x) => {
  if (!(x > 0)) return '–';
  const n = 1 / x;
  const p = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return `about one part in ${int(Math.round(n / p) * p)}`;
};
