import { describe, it, expect } from 'vitest';
import { martingale, flat, createSystem, BETTING_SYSTEMS } from '../src/sim/betting-systems.js';
import { withRules } from './helpers/rules.js';

describe('Martingale', () => {
  it('starts at the base bet and doubles after each loss', () => {
    const m = martingale({ baseBetCents: 500, tableMaxCents: 50000 });
    expect(m.bet()).toBe(500);
    m.settle(-500);
    expect(m.bet()).toBe(1000);
    m.settle(-1000);
    expect(m.bet()).toBe(2000);
    m.settle(-2000);
    expect(m.bet()).toBe(4000);
  });

  it('resets to the base after a win', () => {
    const m = martingale({ baseBetCents: 500, tableMaxCents: 50000 });
    m.settle(-500); // -> 1000
    m.settle(-1000); // -> 2000
    expect(m.bet()).toBe(2000);
    m.settle(+2000); // win
    expect(m.bet()).toBe(500);
  });

  it('holds the bet on a push', () => {
    const m = martingale({ baseBetCents: 500, tableMaxCents: 50000 });
    m.settle(-500); // -> 1000
    m.settle(0); // push -> unchanged
    expect(m.bet()).toBe(1000);
  });

  it('caps the progression at the table maximum and stays there', () => {
    const m = martingale({ baseBetCents: 500, tableMaxCents: 5000 }); // $50 cap
    const seq = [];
    for (let i = 0; i < 6; i++) {
      seq.push(m.bet());
      m.settle(-1); // any loss doubles
    }
    // 500, 1000, 2000, 4000, 5000 (capped from 8000), 5000 (stuck at the cap)
    expect(seq).toEqual([500, 1000, 2000, 4000, 5000, 5000]);
  });

  it('resets to the base from the cap after a win', () => {
    const m = martingale({ baseBetCents: 500, tableMaxCents: 5000 });
    for (let i = 0; i < 5; i++) m.settle(-1); // drive to the cap
    expect(m.bet()).toBe(5000);
    m.settle(+1);
    expect(m.bet()).toBe(500);
  });
});

describe('Flat', () => {
  it('bets the base every hand regardless of the result', () => {
    const f = flat({ baseBetCents: 500 });
    expect(f.bet()).toBe(500);
    f.settle(-500);
    expect(f.bet()).toBe(500);
    f.settle(+500);
    expect(f.bet()).toBe(500);
  });
});

describe('createSystem', () => {
  it('builds a system from the table rules (base = min, cap = max)', () => {
    const rules = withRules({ table: { minBet: 5, maxBet: 500 } });
    const m = createSystem('martingale', rules);
    expect(m.bet()).toBe(500); // $5 base
    expect(BETTING_SYSTEMS.martingale.label).toBe('Martingale');
    expect(BETTING_SYSTEMS.flat.label).toBe('Flat');
  });

  it('throws on an unknown system', () => {
    expect(() => createSystem('fibonacci', withRules())).toThrow();
  });
});
