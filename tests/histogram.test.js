import { describe, it, expect } from 'vitest';
import { buildHistogram } from '../src/sim/histogram.js';

describe('buildHistogram', () => {
  it('returns empty for no values', () => {
    const h = buildHistogram([], 10);
    expect(h.bins).toEqual([]);
    expect(h.maxCount).toBe(0);
  });

  it('places every value in a bin (counts sum to the input size)', () => {
    const values = [-500, -100, -100, 0, 50, 50, 50, 900];
    const h = buildHistogram(values, 10);
    const total = h.bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(values.length);
    expect(h.lo).toBe(-500);
    expect(h.hi).toBe(900);
    expect(h.bins).toHaveLength(10);
  });

  it('includes the maximum in the last bin (no off-by-one overflow)', () => {
    const h = buildHistogram([0, 10], 5);
    expect(h.bins.reduce((s, b) => s + b.count, 0)).toBe(2);
    expect(h.bins[h.bins.length - 1].count).toBe(1); // the 10 lands in the last bin
  });

  it('collapses a single repeated value into one bin', () => {
    const h = buildHistogram([42, 42, 42], 10);
    expect(h.bins).toHaveLength(1);
    expect(h.bins[0].count).toBe(3);
    expect(h.maxCount).toBe(3);
  });

  it('tracks the tallest bin', () => {
    const h = buildHistogram([0, 1, 1, 2, 2, 2], 3);
    // 0 -> bin0 (1); 1,1 -> bin1 (2); 2,2,2 -> bin2 (3)
    expect(h.maxCount).toBe(3);
  });
});
