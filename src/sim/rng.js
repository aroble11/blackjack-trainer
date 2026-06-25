/**
 * rng.js — a small seedable PRNG (mulberry32) for reproducible simulations.
 *
 * Given a seed it yields a deterministic stream of floats in [0, 1), so a whole
 * Monte Carlo run repeats exactly. Pass the simulator a seed for repeatable
 * results, or omit it to fall back to Math.random.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
