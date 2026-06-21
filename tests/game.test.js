import { describe, it, expect } from 'vitest';
import {
  createGame,
  setBet,
  addToBet,
  clearBet,
  canDeal,
  deal,
  hit,
  stand,
  double,
  canDouble,
  isBroke,
  rebuy,
  withinDoubleRestriction,
  Phase,
} from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { withRules } from './helpers/rules.js';

const rules = withRules();
const START = 50000; // $500 starting bankroll, in cents

// Deal order consumes the stack as: player, dealer-up, player, dealer-hole, then
// hits / dealer draws.
const gameWith = (stack) => createGame(rules, { cards: parseCards(stack) });
const dealt = (stack, bet = 500) => {
  const g = gameWith(stack);
  setBet(g, bet);
  deal(g);
  return g;
};

describe('deal', () => {
  it('sets up the round and commits the stake', () => {
    const g = dealt(['10S', '7H', '9D', '5C']);
    expect(g.phase).toBe(Phase.PlayerTurn);
    expect(g.bankrollCents).toBe(START - 500);
    expect(g.playerHands).toHaveLength(1);
    expect(g.playerHands[0].cards.map((c) => c.rank)).toEqual(['10', '9']);
    expect(g.dealerCards.map((c) => c.rank)).toEqual(['7', '5']);
    expect(g.dealerHoleRevealed).toBe(false);
  });

  it('throws when the bet is below the table minimum', () => {
    const g = gameWith(['10S', '7H', '9D', '5C']);
    setBet(g, 100); // $1
    expect(canDeal(g)).toBe(false);
    expect(() => deal(g)).toThrow();
  });
});

describe('round outcomes', () => {
  it('player stands, dealer draws to 17+, player wins', () => {
    const g = dealt(['10S', '7H', '9D', '5C', '6S']); // P19 vs D 12->18
    stand(g);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands[0].outcome).toBe('win');
    expect(g.bankrollCents).toBe(START - 500 + 1000); // +$5
  });

  it('player bust loses immediately and the dealer does not draw', () => {
    const g = dealt(['10S', '9H', '6D', '2C', '10H']); // P16 hit 10 = 26 bust; D 11
    hit(g);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands[0].outcome).toBe('lose');
    expect(g.dealerCards).toHaveLength(2); // stood pat
    expect(g.bankrollCents).toBe(START - 500);
  });

  it('equal totals push', () => {
    const g = dealt(['10S', '10H', '9D', '9C']); // P19 vs D19
    expect(g.phase).toBe(Phase.PlayerTurn); // no naturals
    stand(g);
    expect(g.playerHands[0].outcome).toBe('push');
    expect(g.bankrollCents).toBe(START);
  });
});

describe('naturals + peek', () => {
  it('player blackjack pays 3:2 immediately (no dealer draw)', () => {
    const g = dealt(['AS', '9H', 'KD', '5C']); // P A,K=BJ; D up 9 (no peek)
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands[0].outcome).toBe('blackjack');
    expect(g.dealerCards).toHaveLength(2);
    expect(g.bankrollCents).toBe(START - 500 + 1250); // +$7.50
  });

  it('dealer blackjack (revealed by peek) ends the round; player loses', () => {
    const g = dealt(['10S', 'AH', '9D', 'KC']); // P19; D A,K=BJ
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands[0].outcome).toBe('lose');
    expect(g.dealerHoleRevealed).toBe(true);
    expect(g.bankrollCents).toBe(START - 500);
  });

  it('both blackjack pushes', () => {
    const g = dealt(['AS', 'AH', 'KD', 'JC']); // P A,K=BJ; D A,J=BJ
    expect(g.playerHands[0].outcome).toBe('push');
    expect(g.bankrollCents).toBe(START);
  });
});

describe('double down', () => {
  it('commits a matching stake, draws exactly one card, then the dealer plays', () => {
    const g = dealt(['5S', '9H', '6D', '8C', '10H']); // P11 -> double 10 = 21; D17
    expect(canDouble(g)).toBe(true);
    double(g);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands[0].cards).toHaveLength(3);
    expect(g.playerHands[0].stakeCents).toBe(1000);
    expect(g.playerHands[0].outcome).toBe('win');
    expect(g.bankrollCents).toBe(START - 500 - 500 + 2000); // +$10
  });
});

describe('withinDoubleRestriction', () => {
  it("'any' allows hard and soft", () => {
    expect(withinDoubleRestriction(parseCards(['10S', '2H']), 'any')).toBe(true);
    expect(withinDoubleRestriction(parseCards(['AS', '5H']), 'any')).toBe(true);
  });
  it("'9-11' is a hard range and excludes soft hands", () => {
    expect(withinDoubleRestriction(parseCards(['5S', '6H']), '9-11')).toBe(true); // 11
    expect(withinDoubleRestriction(parseCards(['4S', '5H']), '9-11')).toBe(true); // 9
    expect(withinDoubleRestriction(parseCards(['10S', '2H']), '9-11')).toBe(false); // 12
    expect(withinDoubleRestriction(parseCards(['AS', '8H']), '9-11')).toBe(false); // soft 19
  });
  it("'10-11' only", () => {
    expect(withinDoubleRestriction(parseCards(['5S', '5H']), '10-11')).toBe(true); // 10
    expect(withinDoubleRestriction(parseCards(['4S', '5H']), '10-11')).toBe(false); // 9
  });
});

describe('betting + bankroll', () => {
  it('addToBet accumulates chips, clearBet resets, setBet clamps', () => {
    const g = gameWith(['2S', '3H', '4D', '5C']);
    addToBet(g, 2500);
    addToBet(g, 2500);
    expect(g.betCents).toBe(5000);
    clearBet(g);
    expect(g.betCents).toBe(0);
    setBet(g, 99999999);
    expect(g.betCents).toBe(START); // min(maxBet, bankroll)
  });

  it('rebuy restores the starting bankroll when broke', () => {
    const g = gameWith(['2S', '3H', '4D', '5C']);
    g.bankrollCents = 300; // below the $5 minimum
    expect(isBroke(g)).toBe(true);
    rebuy(g);
    expect(g.bankrollCents).toBe(START);
    expect(isBroke(g)).toBe(false);
  });
});
