import { describe, it, expect } from 'vitest';
import { settle, decideOutcome } from '../src/engine/settlement.js';
import { parseCards } from '../src/engine/cards.js';
import { withRules } from './helpers/rules.js';

const rules = withRules();
const settleHand = (playerCodes, dealerCodes, { fromSplit = false, stakeCents = 500 } = {}) =>
  settle({
    playerCards: parseCards(playerCodes),
    dealerCards: parseCards(dealerCodes),
    fromSplit,
    stakeCents,
    rules,
  });

describe('decideOutcome', () => {
  it('win on higher total / dealer bust, lose on lower / own bust', () => {
    expect(decideOutcome(parseCards(['10S', '9H']), false, parseCards(['10D', '7C']))).toBe('win');
    expect(decideOutcome(parseCards(['10S', '7H']), false, parseCards(['10D', '6C', '10H']))).toBe('win'); // dealer bust
    expect(decideOutcome(parseCards(['10S', '7H']), false, parseCards(['10D', '9C']))).toBe('lose');
    expect(decideOutcome(parseCards(['10S', '10H', '5D']), false, parseCards(['10D', '7C']))).toBe('lose'); // own bust
  });

  it('pushes equal totals', () => {
    expect(decideOutcome(parseCards(['10S', '9H']), false, parseCards(['10D', '9C']))).toBe('push');
  });

  it('a natural blackjack beats a plain 21 but pushes another natural', () => {
    expect(decideOutcome(parseCards(['AS', 'KH']), false, parseCards(['10D', '9C']))).toBe('blackjack');
    expect(decideOutcome(parseCards(['AS', 'KH']), false, parseCards(['AD', 'QC']))).toBe('push');
  });

  it('21 made on a split hand is NOT a natural', () => {
    expect(decideOutcome(parseCards(['AS', 'KH']), true, parseCards(['10D', '9C']))).toBe('win');
  });
});

describe('settle payouts (cents)', () => {
  it('returns stake + winnings on a regular win', () => {
    expect(settleHand(['10S', '9H'], ['10D', '7C'])).toEqual({ outcome: 'win', returnCents: 1000 });
  });

  it('returns nothing on a loss', () => {
    expect(settleHand(['10S', '7H'], ['10D', '9C'])).toEqual({ outcome: 'lose', returnCents: 0 });
  });

  it('returns the stake on a push', () => {
    expect(settleHand(['10S', '9H'], ['10D', '9C'])).toEqual({ outcome: 'push', returnCents: 500 });
  });

  it('pays 3:2 on a natural ($5 -> $7.50 = 1250c back)', () => {
    expect(settleHand(['AS', 'KH'], ['10D', '9C'])).toEqual({ outcome: 'blackjack', returnCents: 1250 });
  });

  it('pays 6:5 when configured ($5 -> $6 = 1100c back)', () => {
    const sixToFive = withRules({ payouts: { blackjack: 1.2 } });
    const r = settle({
      playerCards: parseCards(['AS', 'KH']),
      dealerCards: parseCards(['10D', '9C']),
      stakeCents: 500,
      rules: sixToFive,
    });
    expect(r).toEqual({ outcome: 'blackjack', returnCents: 1100 });
  });
});
