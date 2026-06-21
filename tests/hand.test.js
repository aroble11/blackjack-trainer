import { describe, it, expect } from 'vitest';
import { handValue, isBlackjack, isBust, isPair } from '../src/engine/hand.js';
import { parseCards } from '../src/engine/cards.js';

const h = (codes) => handValue(parseCards(codes));

describe('handValue', () => {
  it('totals hard hands', () => {
    expect(h(['10S', '7H'])).toEqual({ total: 17, soft: false });
    expect(h(['10S', '6H', '5D'])).toEqual({ total: 21, soft: false });
  });

  it('treats an ace as 11 when it fits (soft)', () => {
    expect(h(['AS', '6H'])).toEqual({ total: 17, soft: true });
    expect(h(['AS', '9H'])).toEqual({ total: 20, soft: true });
  });

  it('downgrades the ace to 1 when 11 would bust (hard)', () => {
    expect(h(['AS', '6H', '10D'])).toEqual({ total: 17, soft: false });
    expect(h(['AS', '10H', '5D'])).toEqual({ total: 16, soft: false });
  });

  it('handles multiple aces', () => {
    expect(h(['AS', 'AH'])).toEqual({ total: 12, soft: true });
    expect(h(['AS', 'AH', 'AD'])).toEqual({ total: 13, soft: true });
    expect(h(['AS', 'AH', '9D'])).toEqual({ total: 21, soft: true });
    expect(h(['AS', 'AH', 'AD', 'AC', '10S'])).toEqual({ total: 14, soft: false });
  });
});

describe('isBlackjack', () => {
  it('is true for a two-card 21', () => {
    expect(isBlackjack(parseCards(['AS', 'KH']))).toBe(true);
    expect(isBlackjack(parseCards(['10S', 'AH']))).toBe(true);
  });

  it('is false for 21 made of three or more cards', () => {
    expect(isBlackjack(parseCards(['7S', '7H', '7D']))).toBe(false);
    expect(isBlackjack(parseCards(['AS', '5H', '5D']))).toBe(false);
  });
});

describe('isBust / isPair', () => {
  it('detects busts', () => {
    expect(isBust(parseCards(['10S', '10H', '5D']))).toBe(true);
    expect(isBust(parseCards(['10S', '10H']))).toBe(false);
  });

  it('treats any two 10-valued cards as a pair (split by value)', () => {
    expect(isPair(parseCards(['KS', 'QH']))).toBe(true);
    expect(isPair(parseCards(['10S', 'JH']))).toBe(true);
    expect(isPair(parseCards(['AS', 'AH']))).toBe(true);
    expect(isPair(parseCards(['KS', '9H']))).toBe(false);
    expect(isPair(parseCards(['8S', '8H', '8D']))).toBe(false);
  });
});
