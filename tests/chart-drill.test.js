import { describe, it, expect } from 'vitest';
import { strategyChart, UPCARDS } from '../src/teaching/chart.js';
import { newQuestion, legalMoves, gradeAnswer, DRILLS } from '../src/teaching/drill.js';
import { handValue, isPair } from '../src/engine/hand.js';
import { recommend } from '../src/teaching/strategies.js';
import { mulberry32 } from './helpers/rng.js';
import { withRules } from './helpers/rules.js';

// 6 decks, S17, DAS, late surrender — the canonical chart this is checked against.
const RULES = withRules({ player: { surrender: 'late' } });
const col = (up) => UPCARDS.indexOf(up);

describe('generated strategy chart', () => {
  const chart = strategyChart(RULES);

  it('matches canonical anchor cells (6D S17 DAS LS)', () => {
    expect(chart.hard[11][col('A')]).toBe('H'); // S17: 11 vs A hits
    expect(chart.hard[11][col('10')]).toBe('Dh');
    expect(chart.hard[12][col('2')]).toBe('H');
    expect(chart.hard[12][col('4')]).toBe('S');
    expect(chart.hard[16][col('10')]).toBe('Rh');
    expect(chart.hard[15][col('10')]).toBe('Rh');
    expect(chart.hard[17][col('A')]).toBe('S');
    expect(chart.soft[7][col('2')]).toBe('S'); // A,7 vs 2
    expect(chart.soft[7][col('3')]).toBe('Ds');
    expect(chart.soft[7][col('9')]).toBe('H');
    expect(chart.pairs['8'].every((c) => c === 'P')).toBe(true);
    expect(chart.pairs['10'].every((c) => c === 'S')).toBe(true);
    expect(chart.pairs['A'].every((c) => c === 'P')).toBe(true);
    expect(chart.pairs['9'][col('7')]).toBe('S');
  });

  it('follows the rules: H17 doubles 11 vs A', () => {
    const h17 = strategyChart(withRules({ player: { surrender: 'late' }, dealer: { hitsSoft17: true } }));
    expect(h17.hard[11][col('A')]).toBe('Dh');
  });

  it('agrees with the live hint for 6-deck rules, cell by cell', () => {
    const ACTION = { H: 'hit', S: 'stand', P: 'split', Dh: 'double', Ds: 'double', Rh: 'surrender', Rs: 'surrender' };
    const toCard = (r, s) => ({ rank: r, suit: s });
    for (const [x, codes] of Object.entries(chart.soft)) {
      codes.forEach((c, i) => {
        const rec = recommend('basic', [toCard('A', '♠'), toCard(x, '♥')], toCard(UPCARDS[i], '♦'), RULES);
        expect(rec.action).toBe(ACTION[c]);
      });
    }
  });
});

describe('drills', () => {
  it('deals hands of the requested kind', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const soft = newQuestion('soft', rng);
      expect(handValue(soft.cards).soft).toBe(true);
      expect(isPair(soft.cards)).toBe(false);
      const pair = newQuestion('pairs', rng);
      expect(isPair(pair.cards)).toBe(true);
      const stiff = newQuestion('stiff', rng);
      const v = handValue(stiff.cards);
      expect(v.soft).toBe(false);
      expect(v.total).toBeGreaterThanOrEqual(12);
      expect(v.total).toBeLessThanOrEqual(16);
      expect(isPair(stiff.cards)).toBe(false);
      const any = newQuestion('all', rng);
      expect(any.cards).toHaveLength(2);
      expect(handValue(any.cards).total).toBeLessThanOrEqual(21);
    }
    expect(Object.keys(DRILLS)).toContain('all');
  });

  it('offers only legal moves and grades against basic strategy', () => {
    const q = { cards: [{ rank: '8', suit: '♠' }, { rank: '8', suit: '♥' }], upcard: { rank: '10', suit: '♦' } };
    expect(legalMoves(q, RULES)).toEqual(['hit', 'stand', 'double', 'split', 'surrender']);
    expect(legalMoves(q, withRules())).toEqual(['hit', 'stand', 'double', 'split']);
    expect(gradeAnswer(q, 'split', RULES).correct).toBe(true);
    expect(gradeAnswer(q, 'stand', RULES)).toMatchObject({ correct: false, rec: { action: 'split' } });
  });
});
