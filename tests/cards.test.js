import { describe, it, expect } from 'vitest';
import {
  SUITS,
  RANKS,
  cardValue,
  isAce,
  isTenValue,
  cardLabel,
  parseCard,
  parseCards,
} from '../src/engine/cards.js';

describe('cards', () => {
  it('values number cards by pips, faces as 10, ace as 11', () => {
    expect(cardValue({ rank: '2', suit: '♠' })).toBe(2);
    expect(cardValue({ rank: '9', suit: '♣' })).toBe(9);
    expect(cardValue({ rank: '10', suit: '♦' })).toBe(10);
    expect(cardValue({ rank: 'J', suit: '♥' })).toBe(10);
    expect(cardValue({ rank: 'Q', suit: '♠' })).toBe(10);
    expect(cardValue({ rank: 'K', suit: '♣' })).toBe(10);
    expect(cardValue({ rank: 'A', suit: '♦' })).toBe(11);
  });

  it('identifies aces and 10-valued cards', () => {
    expect(isAce(parseCard('AS'))).toBe(true);
    expect(isAce(parseCard('KS'))).toBe(false);
    expect(isTenValue(parseCard('KS'))).toBe(true);
    expect(isTenValue(parseCard('10D'))).toBe(true);
    expect(isTenValue(parseCard('9D'))).toBe(false);
  });

  it('has 13 ranks and 4 suits', () => {
    expect(RANKS).toHaveLength(13);
    expect(SUITS).toHaveLength(4);
  });

  it('parses compact codes, including T for ten and letter suits', () => {
    expect(parseCard('AS')).toEqual({ rank: 'A', suit: '♠' });
    expect(parseCard('10H')).toEqual({ rank: '10', suit: '♥' });
    expect(parseCard('TD')).toEqual({ rank: '10', suit: '♦' });
    expect(cardLabel(parseCard('QC'))).toBe('Q♣');
    expect(parseCards(['AS', 'KH'])).toEqual([
      { rank: 'A', suit: '♠' },
      { rank: 'K', suit: '♥' },
    ]);
  });
});
