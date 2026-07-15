import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listStrategies,
  recommend,
  chartAction,
  validateUserStrategies,
} from '../src/teaching/strategies.js';
import { bestAction } from '../src/teaching/advisor.js';
import { parseCards, parseCard } from '../src/engine/cards.js';
import { withRules } from './helpers/rules.js';
import { USER_STRATEGIES } from '../config/user-strategies.config.js';

const RULES = withRules({ player: { surrender: 'late' } });

// A chart exercising every code, including per-upcard maps.
const CHART = {
  id: 'test-chart',
  label: 'Test chart',
  hard: {
    9: 'D', // double else hit
    16: { 9: 'R', 10: 'R', A: 'Rs' }, // surrender else hit / else stand; silent vs 2–8
    18: 'Ds', // double else stand (nonsense play, but exercises the code)
    20: 'S',
  },
  soft: {
    17: 'D',
    18: 'S',
  },
  pairs: {
    8: 'P',
    10: 'S', // a non-P pairs cell is used directly
  },
};

const act = (hand, up, rules = RULES, context = {}) =>
  chartAction(CHART, parseCards(hand), parseCard(up), rules, context);

afterEach(() => vi.restoreAllMocks());

describe('chart interpreter — cell codes', () => {
  it('resolves H/S/D/Ds/P/R/Rs on their happy paths', () => {
    expect(act(['5S', '4H'], '6D')).toBe('double'); // D, allowed
    expect(act(['10S', '10H'], '5D')).toBe('stand'); // pairs 10 -> S
    expect(act(['8S', '8H'], '10D')).toBe('split'); // pairs 8 -> P
    expect(act(['10S', '6H'], '10D')).toBe('surrender'); // R, allowed
    expect(act(['10S', '6H'], 'AD')).toBe('surrender'); // Rs, allowed
    expect(act(['AS', '6H'], '4D')).toBe('double'); // soft 17 D
    expect(act(['AS', '7H'], '9D')).toBe('stand'); // soft 18 S
  });

  it('falls back D→hit and Ds→stand when doubling is unavailable', () => {
    // Three cards: no double.
    expect(act(['2S', '3H', '4D'], '6D')).toBe('hit'); // hard 9 D -> hit
    expect(act(['5S', '6H', '7D'], '5D')).toBe('stand'); // hard 18 Ds -> stand
    // Doubling disabled by rule.
    const noDouble = withRules({ player: { doubleAllowed: false } });
    expect(act(['5S', '4H'], '6D', noDouble)).toBe('hit');
    // Double restriction excludes the total.
    const tenElevenOnly = withRules({ player: { doubleRestriction: '10-11' } });
    expect(act(['5S', '4H'], '6D', tenElevenOnly)).toBe('hit'); // hard 9
    // No DAS: a post-split hand can't double.
    const noDas = withRules({ player: { doubleAfterSplit: false } });
    expect(act(['5S', '4H'], '6D', noDas, { fromSplit: true })).toBe('hit');
  });

  it('falls back R→hit and Rs→stand when surrender is unavailable', () => {
    const noSurrender = withRules({ player: { surrender: 'none' } });
    expect(act(['10S', '6H'], '10D', noSurrender)).toBe('hit');
    expect(act(['10S', '6H'], 'AD', noSurrender)).toBe('stand');
    // Surrender is first-decision only: not on 3+ cards or after a split.
    expect(act(['5S', '5H', '6D'], '10D')).toBe('hit'); // 16 in three cards
    expect(act(['10S', '6H'], '10D', RULES, { fromSplit: true })).toBe('hit');
  });

  it("falls a 'P' through to the totals rows when splitting is unavailable", () => {
    const noSplit = withRules({ player: { splitAllowed: false } });
    // 8,8 = hard 16 vs 10 -> the hard-16 'R' row (surrender allowed).
    expect(act(['8S', '8H'], '10D', withRules({ player: { splitAllowed: false, surrender: 'late' } }))).toBe(
      'surrender'
    );
    // After a split, pairs can't re-split here (advisor convention): 8,8 vs 9 -> hard 16 'R' -> hit (no surrender after split).
    expect(act(['8S', '8H'], '9D', noSplit)).toBe('hit');
  });

  it('returns null for hands the chart does not cover', () => {
    expect(act(['10S', '2H'], '2D')).toBeNull(); // hard 12: no row
    expect(act(['10S', '6H'], '2D')).toBeNull(); // hard 16 vs 2: map has no '2'
    expect(act(['AS', '2H'], '5D')).toBeNull(); // soft 13: no row
  });
});

describe('recommend()', () => {
  it("delegates 'basic' and unknown ids to the computed advisor", () => {
    const cards = parseCards(['10S', '6H']);
    const up = parseCard('10D');
    const expected = bestAction(cards, up, RULES);
    for (const id of ['basic', 'no-such-strategy', undefined]) {
      const rec = recommend(id, cards, up, RULES);
      expect(rec.action).toBe(expected.action);
      expect(rec.isUserDefined).toBe(false);
      expect(rec.fallback).toBe(false);
      expect(rec.label).toBe('Basic strategy');
      expect(rec.evs).toBeDefined(); // explainAction needs the EV numbers
    }
  });

  it('plays the shipped mimic-dealer template by its chart', () => {
    const rec = recommend('mimic-dealer', parseCards(['10S', '6H']), parseCard('10D'), RULES);
    expect(rec.action).toBe('hit'); // basic says surrender; the chart mimics the dealer
    expect(rec.isUserDefined).toBe(true);
    expect(rec.fallback).toBe(false);
    expect(rec.label).toBe('Mimic the dealer');
    // Never splits or doubles, stands all 17s.
    expect(recommend('mimic-dealer', parseCards(['8S', '8H']), parseCard('6D'), RULES).action).toBe('hit');
    expect(recommend('mimic-dealer', parseCards(['6S', '5H']), parseCard('6D'), RULES).action).toBe('hit');
    expect(recommend('mimic-dealer', parseCards(['AS', '6H']), parseCard('10D'), RULES).action).toBe('stand');
    expect(recommend('mimic-dealer', parseCards(['10S', '7H']), parseCard('AD'), RULES).action).toBe('stand');
  });

  it('falls back to computed basic strategy on an uncovered hand, flagged', async () => {
    // The shipped template has no gaps, so load the registry against a sparse
    // chart to exercise recommend()'s fallback path end to end.
    vi.resetModules();
    vi.doMock('../config/user-strategies.config.js', () => ({
      USER_STRATEGIES: [{ id: 'sparse', label: 'Sparse', hard: { 20: 'S' } }],
    }));
    const { recommend: rec } = await import('../src/teaching/strategies.js');
    const cards = parseCards(['10S', '2H']); // hard 12: not in the sparse chart
    const up = parseCard('2D');
    const got = rec('sparse', cards, up, RULES);
    expect(got.action).toBe(bestAction(cards, up, RULES).action);
    expect(got.isUserDefined).toBe(true);
    expect(got.fallback).toBe(true);
    expect(got.label).toBe('Sparse');
    expect(got.evs).toBeDefined(); // the hint panel explains the computed move
    vi.doUnmock('../config/user-strategies.config.js');
    vi.resetModules();
  });
});

describe('validation', () => {
  it('accepts the shipped user strategies without warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const valid = validateUserStrategies(USER_STRATEGIES);
    expect(valid.map((s) => s.id)).toContain('mimic-dealer');
    expect(valid).toHaveLength(USER_STRATEGIES.length);
    expect(warn).not.toHaveBeenCalled();
  });

  it('lists basic first, then the shipped template', () => {
    const ids = listStrategies().map((s) => s.id);
    expect(ids[0]).toBe('basic');
    expect(ids).toContain('mimic-dealer');
  });

  it('skips malformed entries with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = [
      null, // not an object
      { label: 'No id' },
      { id: 'basic', label: 'Reserved id' },
      { id: 'dup', label: 'A', hard: { 12: 'S' } },
      { id: 'dup', label: 'B' }, // duplicate id
      { id: 'bad-code', label: 'X', hard: { 12: 'Q' } },
      { id: 'bad-row', label: 'X', hard: { 3: 'S' } }, // hard 3 impossible
      { id: 'bad-col', label: 'X', hard: { 12: { 11: 'S' } } },
      { id: 'p-outside-pairs', label: 'X', hard: { 12: 'P' } },
      { id: 'ok', label: 'Fine', soft: { 18: 'S' } },
    ];
    const valid = validateUserStrategies(bad);
    expect(valid.map((s) => s.id)).toEqual(['dup', 'ok']);
    expect(warn).toHaveBeenCalledTimes(bad.length - valid.length);
  });
});
