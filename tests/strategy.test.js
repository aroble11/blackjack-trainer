import { describe, it, expect } from 'vitest';
import { bestAction } from '../src/teaching/advisor.js';
import { parseCards, parseCard } from '../src/engine/cards.js';
import { withRules } from './helpers/rules.js';

// 6-deck, S17, DAS, late surrender (the shipped ruleset) and an H17 variant.
const LS = withRules({ player: { surrender: 'late' } });
const H17 = withRules({ player: { surrender: 'late' }, dealer: { hitsSoft17: true } });

const rec = (hand, up, rules = LS) => bestAction(parseCards(hand), parseCard(up), rules).action;

describe('basic strategy — hard totals (S17, DAS, LS)', () => {
  it('stands on all hard 17+', () => {
    expect(rec(['10S', '7H'], '2D')).toBe('stand');
    expect(rec(['10S', '7H'], 'AD')).toBe('stand');
    expect(rec(['10S', '9H'], '10D')).toBe('stand');
  });

  it('hits the low and 12-vs-2/3 totals', () => {
    expect(rec(['5S', '3H'], '6D')).toBe('hit'); // 8
    expect(rec(['10S', '2H'], '2D')).toBe('hit'); // 12 vs 2
    expect(rec(['10S', '2H'], '3D')).toBe('hit'); // 12 vs 3
    expect(rec(['10S', '2H'], '7D')).toBe('hit'); // 12 vs 7
  });

  it('stands on stiff totals vs a weak dealer, hits vs a strong one', () => {
    expect(rec(['10S', '2H'], '4D')).toBe('stand'); // 12 vs 4
    expect(rec(['10S', '3H'], '2D')).toBe('stand'); // 13 vs 2
    expect(rec(['10S', '6H'], '6D')).toBe('stand'); // 16 vs 6
    expect(rec(['10S', '6H'], '7D')).toBe('hit'); // 16 vs 7
    expect(rec(['10S', '5H'], '7D')).toBe('hit'); // 15 vs 7
  });

  it('doubles 9 / 10 / 11 on the right upcards', () => {
    expect(rec(['5S', '4H'], '6D')).toBe('double'); // 9 vs 6
    expect(rec(['5S', '4H'], '2D')).toBe('hit'); // 9 vs 2
    expect(rec(['6S', '4H'], '9D')).toBe('double'); // 10 vs 9
    expect(rec(['6S', '4H'], '10D')).toBe('hit'); // 10 vs 10
    expect(rec(['6S', '5H'], '5D')).toBe('double'); // 11 vs 5
    expect(rec(['6S', '5H'], '10D')).toBe('double'); // 11 vs 10
  });

  it('surrenders the worst stiffs (S17, LS)', () => {
    expect(rec(['10S', '6H'], '10D')).toBe('surrender'); // 16 vs 10
    expect(rec(['10S', '6H'], 'AD')).toBe('surrender'); // 16 vs A
    expect(rec(['10S', '5H'], '10D')).toBe('surrender'); // 15 vs 10
    expect(rec(['10S', '5H'], 'AD')).toBe('hit'); // 15 vs A -> hit under S17
  });
});

describe('basic strategy — soft totals (S17, DAS)', () => {
  it('plays A,7 (soft 18) by the book', () => {
    expect(rec(['AS', '7H'], '2D')).toBe('stand');
    expect(rec(['AS', '7H'], '6D')).toBe('double');
    expect(rec(['AS', '7H'], '8D')).toBe('stand');
    expect(rec(['AS', '7H'], '9D')).toBe('hit');
  });

  it('stands A,8 vs 6 under S17', () => {
    expect(rec(['AS', '8H'], '6D')).toBe('stand');
  });

  it('doubles the small soft hands at the clear cells', () => {
    expect(rec(['AS', '2H'], '6D')).toBe('double'); // soft 13 vs 6
    expect(rec(['AS', '2H'], '4D')).toBe('hit'); // soft 13 vs 4
    expect(rec(['AS', '3H'], '5D')).toBe('double'); // soft 14 vs 5
    expect(rec(['AS', '6H'], '4D')).toBe('double'); // soft 17 vs 4
    expect(rec(['AS', '6H'], '2D')).toBe('hit'); // soft 17 vs 2
  });

  it('treats A,2 vs 5 as the knife-edge cell it is (hit vs double within ~0.01 EV)', () => {
    // The infinite-deck model picks hit here by < 0.01 EV; many charts say double.
    // This is THE canonical marginal soft-double cell — exactly why the app tells
    // you to cross-check an authoritative chart for the closest decisions.
    const { evs } = bestAction(parseCards(['AS', '2H']), parseCard('5D'), LS);
    expect(Math.abs(evs.hit - evs.double)).toBeLessThan(0.01);
  });
});

describe('basic strategy — pairs (DAS)', () => {
  it('always splits aces and eights', () => {
    for (const up of ['2D', '7D', '10D', 'AD']) {
      expect(rec(['AS', 'AH'], up)).toBe('split');
      expect(rec(['8S', '8H'], up)).toBe('split');
    }
  });

  it('never splits tens or fives', () => {
    expect(rec(['10S', '10H'], '6D')).toBe('stand');
    expect(rec(['5S', '5H'], '6D')).toBe('double'); // play 5,5 as a hard 10
    expect(rec(['5S', '5H'], '10D')).toBe('hit');
  });

  it('splits nines except vs 7 / 10 / A', () => {
    expect(rec(['9S', '9H'], '6D')).toBe('split');
    expect(rec(['9S', '9H'], '9D')).toBe('split');
    expect(rec(['9S', '9H'], '7D')).toBe('stand');
    expect(rec(['9S', '9H'], '10D')).toBe('stand');
  });

  it('splits 2,2 / 7,7 / 6,6 vs the small cards', () => {
    expect(rec(['2S', '2H'], '7D')).toBe('split');
    expect(rec(['2S', '2H'], '8D')).toBe('hit');
    expect(rec(['7S', '7H'], '7D')).toBe('split');
    expect(rec(['7S', '7H'], '8D')).toBe('hit');
    expect(rec(['6S', '6H'], '6D')).toBe('split');
    expect(rec(['6S', '6H'], '7D')).toBe('hit');
  });
});

describe('basic strategy — rule sensitivity', () => {
  it('A,8 vs 6: stand under S17, double under H17', () => {
    expect(rec(['AS', '8H'], '6D', LS)).toBe('stand');
    expect(rec(['AS', '8H'], '6D', H17)).toBe('double');
  });

  it('11 vs A: doubles under H17', () => {
    expect(rec(['6S', '5H'], 'AD', H17)).toBe('double');
  });

  it('15 vs A: hit under S17, surrender under H17', () => {
    expect(rec(['10S', '5H'], 'AD', LS)).toBe('hit');
    expect(rec(['10S', '5H'], 'AD', H17)).toBe('surrender');
  });

  it('4,4 vs 5: splits with DAS, hits without', () => {
    expect(rec(['4S', '4H'], '5D', withRules({ player: { doubleAfterSplit: true } }))).toBe('split');
    expect(rec(['4S', '4H'], '5D', withRules({ player: { doubleAfterSplit: false } }))).toBe('hit');
  });
});
