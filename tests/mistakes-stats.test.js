import { describe, it, expect } from 'vitest';
import { parseCards, parseCard } from '../src/engine/cards.js';
import { createShoe } from '../src/engine/shoe.js';
import { bestAction } from '../src/teaching/advisor.js';
import { decisionCost, situationKey, formatCostPerDollar, insuranceOdds } from '../src/teaching/mistakes.js';
import {
  emptyStats, normalizeStats, recordDecision, recordRound, recordInsurance, recordQuiz, topMisses,
} from '../src/teaching/stats.js';
import { withRules } from './helpers/rules.js';

const noSurrender = withRules({ player: { surrender: 'none' } });

describe('decisionCost', () => {
  it('is the gap between the recommended and chosen computed EVs', () => {
    const cards = parseCards(['10S', '6H']);
    const up = parseCard('10D');
    const { evs, action } = bestAction(cards, up, noSurrender);
    expect(action).toBe('hit');
    const cost = decisionCost(cards, up, noSurrender, {}, 'stand', 'hit');
    expect(cost).toBeCloseTo(evs.hit - evs.stand, 12);
    expect(cost).toBeGreaterThan(0);
  });

  it('is zero for the recommended play and null for an unavailable one', () => {
    const cards = parseCards(['10S', '6H']);
    const up = parseCard('10D');
    expect(decisionCost(cards, up, noSurrender, {}, 'hit', 'hit')).toBe(0);
    expect(decisionCost(cards, up, noSurrender, {}, 'split', 'hit')).toBeNull();
  });
});

describe('situationKey / formatCostPerDollar', () => {
  it('labels hard, soft and pair hands', () => {
    expect(situationKey(parseCards(['10S', '6H']), parseCard('10D'))).toBe('Hard 16 vs 10');
    expect(situationKey(parseCards(['AS', '7H']), parseCard('9D'))).toBe('Soft 18 vs 9');
    expect(situationKey(parseCards(['8S', '8H']), parseCard('AD'))).toBe('Pair of 8s vs A');
    expect(situationKey(parseCards(['KS', 'QH']), parseCard('5D'))).toBe('Pair of 10s vs 5');
  });

  it('formats per-$1 costs', () => {
    expect(formatCostPerDollar(0.004)).toBe('under 1¢');
    expect(formatCostPerDollar(0.08)).toBe('8¢');
    expect(formatCostPerDollar(1.2)).toBe('$1.20');
  });
});

describe('insuranceOdds', () => {
  it('a fresh shoe has 4/13 tens: insurance loses 1/13 per $1', () => {
    const shoe = createShoe(withRules());
    const { pTen, ev, breakEven } = insuranceOdds(shoe, withRules());
    expect(pTen).toBeCloseTo(4 / 13, 12);
    expect(ev).toBeCloseTo(-1 / 13, 12);
    expect(breakEven).toBeCloseTo(1 / 3, 12);
  });

  it('uses only the seen cards (low cards seen → more tens left → can turn positive)', () => {
    const shoe = createShoe(withRules({ shoe: { numberOfDecks: 1 } }));
    shoe.seenCards = parseCards(['2S', '3S', '4S', '5S', '6S', '2H', '3H', '4H', '5H', '6H', '7H', '8H', 'AD']);
    const { pTen, ev } = insuranceOdds(shoe, withRules());
    expect(pTen).toBeCloseTo(16 / 39, 12);
    expect(ev).toBeGreaterThan(0);
  });
});

describe('stats', () => {
  it('records decisions, rounds, insurance and quiz answers', () => {
    const s = emptyStats(0);
    recordDecision(s, 'Hard 16 vs 10', false, 0.03);
    recordDecision(s, 'Hard 16 vs 10', true);
    recordDecision(s, 'Soft 18 vs 9', false, 0.1);
    recordRound(s, 2500);
    recordRound(s, -500);
    recordInsurance(s, true);
    recordQuiz(s, false);
    expect(s).toMatchObject({ decisions: 3, correct: 1, hands: 2, netCents: 2000 });
    expect(s.costEV).toBeCloseTo(0.13, 12);
    expect(s.insurance).toEqual({ offered: 1, declined: 1 });
    expect(s.quiz).toEqual({ asked: 1, right: 0 });
    expect(topMisses(s).map((m) => m.key)).toEqual(['Soft 18 vs 9', 'Hard 16 vs 10']);
  });

  it('normalizes saved data and drops junk', () => {
    const s = normalizeStats({ hands: 3, netCents: 'x', situations: { a: { seen: 2, wrong: 1 }, b: null }, extra: 1 });
    expect(s.hands).toBe(3);
    expect(s.netCents).toBe(0);
    expect(s.situations).toEqual({ a: { seen: 2, wrong: 1, cost: 0 } });
    expect(s).not.toHaveProperty('extra');
    expect(normalizeStats(null).decisions).toBe(0);
  });
});
