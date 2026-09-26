// Small numeric helpers shared by the engine.

/** float32 rounding. The Python model runs in torch float32; applying this after every +, -, * reproduces it
 * exactly (a double holds any float32 +, -, * result before rounding without double-rounding error). */
export const f32 = Math.fround;

/** Python 3's round(): round half to even (used for k = round(sparsity * n_drivable)). */
export function roundHalfEven(x) {
  const r = Math.round(x);
  // Math.round rounds halves up; Python rounds them to the even neighbour
  if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2);
  return r;
}

export function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/** Sum of a[i] over the indices where mask[i] is set (mask: typed array or array of 0/1 or booleans). */
export function maskedSum(a, mask) {
  let s = 0;
  for (let i = 0; i < a.length; i++) if (mask[i]) s += a[i];
  return s;
}

/** Small seeded PRNG (mulberry32) for the browser's own random odours. It is NOT NumPy's generator: odours drawn
 * with it are new odours, not the ones in the results files. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    random: next,
    /** integer in [0, n) */
    int: (n) => Math.floor(next() * n),
    /** `size` distinct items of `pool`, in draw order */
    sample(pool, size) {
      const p = Array.from(pool);
      if (size > p.length) throw new Error('sample: size larger than the pool');
      for (let i = 0; i < size; i++) {
        const j = i + Math.floor(next() * (p.length - i));
        [p[i], p[j]] = [p[j], p[i]];
      }
      return p.slice(0, size);
    },
  };
}
