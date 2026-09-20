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

describe('runSimulation — robust across configs', () => {
  // Different deck counts and rule sets must all complete cleanly: the engine
  // reshuffles only between rounds, and the simulator's safety net handles the
  // rare small-deck mid-round shoe exhaustion instead of throwing.
  const variants = {
    'single deck': withRules({ shoe: { numberOfDecks: 1 } }),
    'double deck H17 6:5': withRules({
      shoe: { numberOfDecks: 2 },
      dealer: { hitsSoft17: true },
      payouts: { blackjack: 1.2, insurance: 2.0, regularWin: 1.0 },
    }),
    'no double / split / surrender': withRules({
      player: { doubleAllowed: false, splitAllowed: false, surrender: 'none' },
    }),
    'insurance offered': withRules({ player: { insuranceAllowed: true } }),
  };

  for (const [name, variant] of Object.entries(variants)) {
    it(`completes cleanly with ${name}`, () => {
      const r = runSimulation(variant, { system: 'martingale', sessions: variant.shoe.numberOfDecks <= 2 ? 8 : 300, handsPerSession: variant.shoe.numberOfDecks <= 2 ? 12 : 80, seed: 8 });
      expect(r.count).toBe(variant.shoe.numberOfDecks <= 2 ? 8 : 300);
      expect(Number.isFinite(r.meanCents)).toBe(true);
      expect(r.pctUp + r.pctDown + r.pctFlat).toBeCloseTo(1, 10);
    }, 60000);
  }

  it('completes a deep-penetration single-deck run with finite-deck decisions', () => {
    // The reserve/recovery engine is shared with live play. Keep finite-deck
    // integration samples small; statistical comparisons use the fast 6D model.
    const extreme = withRules({ shoe: { numberOfDecks: 1, penetration: 0.9 } });
    const r = runSimulation(extreme, { system: 'martingale', sessions: 8, handsPerSession: 12, seed: 3 });
    expect(r.count).toBe(8);
    expect(Number.isFinite(r.meanCents)).toBe(true);
    expect(r.pctUp + r.pctDown + r.pctFlat).toBeCloseTo(1, 10);
  }, 60000);
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
