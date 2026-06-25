import { describe, it, expect } from 'vitest';
import { runSimulation, runSession } from '../src/sim/simulator.js';
import { withRules } from './helpers/rules.js';

const rules = withRules(); // 6D S17 DAS, $5 min / $500 max / $500 starting bankroll

describe('runSimulation — determinism', () => {
  it('is reproducible for a given seed', () => {
    const opts = { system: 'flat', sessions: 200, handsPerSession: 50, seed: 7 };
    const a = runSimulation(rules, opts);
    const b = runSimulation(rules, opts);
    expect(a.nets).toEqual(b.nets);
    expect(a.meanCents).toBe(b.meanCents);
    expect(a.ruinRate).toBe(b.ruinRate);
  });

  it('produces different results for different seeds', () => {
    const a = runSimulation(rules, { system: 'flat', sessions: 100, handsPerSession: 50, seed: 1 });
    const b = runSimulation(rules, { system: 'flat', sessions: 100, handsPerSession: 50, seed: 2 });
    expect(a.nets).not.toEqual(b.nets);
  });
});

describe('runSimulation — summary stats', () => {
  const r = runSimulation(rules, { system: 'flat', sessions: 400, handsPerSession: 50, seed: 3 });

  it('returns one net per session, sorted ascending', () => {
    expect(r.count).toBe(400);
    expect(r.nets).toHaveLength(400);
    expect([...r.nets].sort((a, b) => a - b)).toEqual(r.nets);
  });

  it('orders worst <= median <= best', () => {
    expect(r.worstCents).toBeLessThanOrEqual(r.medianCents);
    expect(r.medianCents).toBeLessThanOrEqual(r.bestCents);
  });

  it('has win/lose/flat fractions that sum to 1, and a ruin rate in [0,1]', () => {
    expect(r.pctUp + r.pctDown + r.pctFlat).toBeCloseTo(1, 10);
    expect(r.ruinRate).toBeGreaterThanOrEqual(0);
    expect(r.ruinRate).toBeLessThanOrEqual(1);
  });
});

describe('runSimulation — betting-system behavior', () => {
  it('Martingale busts far more often than flat betting', () => {
    const seed = 5;
    const m = runSimulation(rules, { system: 'martingale', sessions: 1200, handsPerSession: 100, seed });
    const f = runSimulation(rules, { system: 'flat', sessions: 1200, handsPerSession: 100, seed });
    expect(m.ruinRate).toBeGreaterThan(f.ruinRate);
    expect(f.ruinRate).toBeLessThan(0.02); // flat almost never busts from $500 in 100 hands
    // Martingale's deepest session loss reaches down near the whole bankroll.
    expect(m.worstCents).toBeLessThan(f.worstCents);
  });

  it('ruins quickly on a tiny bankroll under Martingale', () => {
    const poor = withRules({ table: { startingBankroll: 15, minBet: 5, maxBet: 500 } });
    const r = runSimulation(poor, { system: 'martingale', sessions: 300, handsPerSession: 100, seed: 9 });
    expect(r.ruinRate).toBeGreaterThan(0);
  });
});

describe('runSession', () => {
  it('plays up to the hand cap and reports a coherent net result', () => {
    const r = runSession(rules, 'flat', { handsPerSession: 30, rng: () => 0.42 });
    expect(r.handsPlayed).toBeGreaterThan(0);
    expect(r.handsPlayed).toBeLessThanOrEqual(30);
    expect(r.finalCents).toBe(50000 + r.netCents); // $500 start + net
    expect(typeof r.ruined).toBe('boolean');
  });
});
