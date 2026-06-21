import { describe, it, expect } from 'vitest';
import { dealerOutcomeDistribution } from '../src/teaching/dealer-odds.js';
import { withRules } from './helpers/rules.js';

const S17 = withRules({ dealer: { hitsSoft17: false } });
const H17 = withRules({ dealer: { hitsSoft17: true } });
const sum = (d) => Object.values(d).reduce((a, b) => a + b, 0);
const bustOf = (up, rules = S17) => dealerOutcomeDistribution(up, rules).bust;

describe('dealer outcome distribution', () => {
  it('every upcard distribution sums to 1', () => {
    for (const up of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      expect(sum(dealerOutcomeDistribution(up, S17))).toBeCloseTo(1, 9);
    }
  });

  it('bust probabilities sit at well-known values (S17)', () => {
    expect(bustOf(6)).toBeGreaterThan(0.4);
    expect(bustOf(6)).toBeLessThan(0.44);
    expect(bustOf(7)).toBeGreaterThan(0.24);
    expect(bustOf(7)).toBeLessThan(0.28);
  });

  it('weak upcards bust far more often than strong ones', () => {
    expect(bustOf(5)).toBeGreaterThan(bustOf(7));
    expect(bustOf(6)).toBeGreaterThan(bustOf(10));
    expect(bustOf(7)).toBeGreaterThan(bustOf(11)); // ace (peeked) busts least
  });

  it('an upcard of 7 most often finishes on 17', () => {
    const d = dealerOutcomeDistribution(7, S17);
    for (const k of ['18', '19', '20', '21', 'bust']) {
      expect(d['17']).toBeGreaterThan(d[k]);
    }
  });

  it('H17 busts a 6 more often than S17 (extra soft-17 draws)', () => {
    expect(bustOf(6, H17)).toBeGreaterThan(bustOf(6, S17));
  });
});
