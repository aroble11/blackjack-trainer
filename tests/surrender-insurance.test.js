import { describe, it, expect } from 'vitest';
import {
  createGame,
  setBet,
  deal,
  hit,
  split,
  surrender,
  canSurrender,
  takeInsurance,
  declineInsurance,
  Phase,
} from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { withRules } from './helpers/rules.js';

const START = 50000;
const lateSurrender = withRules({ player: { surrender: 'late' } });
const withInsurance = withRules({ player: { insuranceAllowed: true } });

const dealt = (rules, stack, bet = 500) => {
  const g = createGame(rules, { cards: parseCards(stack) });
  setBet(g, bet);
  deal(g);
  return g;
};

describe('late surrender', () => {
  it('forfeits half the bet and ends the round', () => {
    const g = dealt(lateSurrender, ['10S', '9H', '6D', '5C']); // P16 vs D up 9
    expect(canSurrender(g)).toBe(true);
    surrender(g);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands[0].outcome).toBe('surrender');
    expect(g.playerHands[0].returnCents).toBe(250);
    expect(g.bankrollCents).toBe(START - 500 + 250); // lost half of $5
    expect(g.dealerHoleRevealed).toBe(true);
  });

  it('is only a first-action option (not after a hit)', () => {
    const g = dealt(lateSurrender, ['10S', '9H', '6D', '5C', '2H']);
    hit(g); // now three cards
    expect(canSurrender(g)).toBe(false);
  });

  it('is not allowed after a split', () => {
    const g = dealt(lateSurrender, ['8S', '9H', '8D', '5C', '3S', '2H']);
    split(g);
    expect(canSurrender(g)).toBe(false);
  });

  it("is unavailable (and throws) when surrender is 'none'", () => {
    const g = dealt(withRules(), ['10S', '9H', '6D', '5C']);
    expect(canSurrender(g)).toBe(false);
    expect(() => surrender(g)).toThrow();
  });
});

describe('insurance', () => {
  it('is offered only on a dealer Ace upcard, when enabled', () => {
    // ten upcard -> no offer
    expect(dealt(withInsurance, ['10S', '10H', '6D', '8C']).phase).toBe(Phase.PlayerTurn);
    // Ace upcard but insurance disabled -> no offer
    expect(dealt(withRules(), ['10S', 'AH', '6D', '5C']).phase).toBe(Phase.PlayerTurn);
    // Ace upcard, enabled -> offer
    expect(dealt(withInsurance, ['10S', 'AH', '6D', '5C']).phase).toBe(Phase.Insurance);
  });

  it('taken + dealer blackjack pays 2:1, so the hand breaks even', () => {
    const g = dealt(withInsurance, ['10S', 'AH', '6D', 'KC']); // D A,K = blackjack
    expect(g.phase).toBe(Phase.Insurance);
    takeInsurance(g);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands[0].outcome).toBe('lose');
    expect(g.bankrollCents).toBe(START); // -500 hand, -250 insurance, +750 insurance payout
  });

  it('declined + dealer blackjack loses the full bet', () => {
    const g = dealt(withInsurance, ['10S', 'AH', '6D', 'KC']);
    declineInsurance(g);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands[0].outcome).toBe('lose');
    expect(g.bankrollCents).toBe(START - 500);
  });

  it('taken + dealer no blackjack loses the side bet and play continues', () => {
    const g = dealt(withInsurance, ['10S', 'AH', '6D', '5C']); // D A,5 = 16, no BJ
    takeInsurance(g);
    expect(g.phase).toBe(Phase.PlayerTurn);
    expect(g.insuranceCents).toBe(250);
    expect(g.bankrollCents).toBe(START - 500 - 250);
  });

  it('gives even money: player blackjack insured vs dealer blackjack nets +1 bet', () => {
    const g = dealt(withInsurance, ['AS', 'AH', 'KD', 'QC']); // P A,K=BJ ; D A,Q=BJ
    expect(g.phase).toBe(Phase.Insurance);
    takeInsurance(g);
    expect(g.playerHands[0].outcome).toBe('push'); // both blackjack
    expect(g.bankrollCents).toBe(START + 500); // push on hand, +500 net from insurance
  });

  // The round-over overlay reports its net as
  //   sum(hand.returnCents - hand.stakeCents) + (insuranceReturnCents - insuranceCents)
  // which must equal the actual change in bankroll over the round.
  const overlayNet = (g) =>
    g.playerHands.reduce((s, h) => s + (h.returnCents - h.stakeCents), 0) +
    (g.insuranceReturnCents - g.insuranceCents);

  it('records the insurance return so the readout reflects it', () => {
    const g = dealt(withInsurance, ['10S', 'AH', '6D', 'KC']); // D A,K = blackjack
    takeInsurance(g);
    expect(g.insuranceCents).toBe(250);
    expect(g.insuranceReturnCents).toBe(750); // 250 stake + 500 winnings (2:1)
    expect(overlayNet(g)).toBe(0); // fully hedged: reads as a push, not a loss
    expect(overlayNet(g)).toBe(g.bankrollCents - START);
  });

  it('declined + dealer blackjack: no insurance return, overlay shows the full loss', () => {
    const g = dealt(withInsurance, ['10S', 'AH', '6D', 'KC']);
    declineInsurance(g);
    expect(g.insuranceReturnCents).toBe(0);
    expect(overlayNet(g)).toBe(-500);
    expect(overlayNet(g)).toBe(g.bankrollCents - START);
  });

  it('even money: overlay net is +1 bet and matches the bankroll change', () => {
    const g = dealt(withInsurance, ['AS', 'AH', 'KD', 'QC']); // both blackjack
    takeInsurance(g);
    expect(g.insuranceReturnCents).toBe(750);
    expect(overlayNet(g)).toBe(500);
    expect(overlayNet(g)).toBe(g.bankrollCents - START);
  });
});
