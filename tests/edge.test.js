import { describe, it, expect } from 'vitest';
import {
  createGame,
  setBet,
  deal,
  hit,
  stand,
  double,
  split,
  canDouble,
  canSplit,
  takeInsurance,
  Phase,
} from '../src/engine/game.js';
import { settle, decideOutcome } from '../src/engine/settlement.js';
import { playDealerHand } from '../src/engine/dealer.js';
import { handValue } from '../src/engine/hand.js';
import { createShoe } from '../src/engine/shoe.js';
import { parseCards } from '../src/engine/cards.js';
import { withRules } from './helpers/rules.js';

const START = 50000;
const ranks = (cards) => cards.map((c) => c.rank);
const h = (codes) => handValue(parseCards(codes));
const dealt = (rules, stack, bet = 500) => {
  const g = createGame(rules, { cards: parseCards(stack) });
  setBet(g, bet);
  deal(g);
  return g;
};

describe('multi-ace totals', () => {
  it('counts only one ace as 11 across many aces', () => {
    expect(h(['AS', 'AH', 'AD', 'AC', 'AS'])).toEqual({ total: 15, soft: true }); // five aces -> soft 15
    expect(h(['AS', 'AH', 'AD', '8C'])).toEqual({ total: 21, soft: true }); // soft 21
  });

  it('handles a long hard 21', () => {
    expect(h(['AS', '2H', '3D', '4C', '5S', '6H'])).toEqual({ total: 21, soft: false });
  });
});

describe('deep splits', () => {
  it('re-splits eights up to maxSplitHands and refuses the next', () => {
    // P 8,8 ; each re-split keeps drawing another 8 to the left hand.
    const stack = ['8S', '2H', '8D', '3C', '8H', '4D', '8C', '5S', '8H', '6D'];
    const g = dealt(withRules(), stack); // up 2 -> no peek/insurance
    split(g); // 2 hands
    expect(canSplit(g)).toBe(true);
    split(g); // 3 hands
    expect(canSplit(g)).toBe(true);
    split(g); // 4 hands (the cap)
    expect(g.playerHands).toHaveLength(4);
    expect(ranks(g.playerHands[0].cards)).toEqual(['8', '8']); // still a pair...
    expect(canSplit(g)).toBe(false); // ...but the cap blocks a 5th hand
  });

  it('does not draw for the dealer when every split hand busts', () => {
    const stack = ['7S', '10H', '7D', '8C', '10S', '9D', '10H', '10C'];
    const g = dealt(withRules(), stack); // P 7,7 vs dealer 10,8
    split(g); // hand0 = 7,10 = 17 ; hand1 = 7,9 = 16
    hit(g); // hand0 -> +10 = 27 bust
    hit(g); // hand1 -> +10 = 26 bust
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.dealerCards).toHaveLength(2); // dealer stood pat
    expect(g.playerHands.map((x) => x.outcome)).toEqual(['lose', 'lose']);
    expect(g.bankrollCents).toBe(START - 1000);
  });

  it('a 21 on a split hand is paid as 21, never as a blackjack', () => {
    const stack = ['10S', '6H', '10D', '5C', 'AS', 'AD', '10H'];
    const g = dealt(withRules(), stack); // split tens, each draws an ace -> 21
    split(g); // both hands auto-stand on 21, dealer draws to 21
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands.map((x) => x.outcome)).toEqual(['push', 'push']);
    expect(g.playerHands.some((x) => x.outcome === 'blackjack')).toBe(false);
    expect(g.bankrollCents).toBe(START);
  });
});

describe('dealer drawing', () => {
  it('draws multiple cards to a hard stand', () => {
    const shoe = createShoe({ shoe: {} }, { cards: parseCards(['5S', '6H']) });
    const result = playDealerHand(parseCards(['3S', '4D']), shoe, withRules()); // 7 -> 12 -> 18
    expect(ranks(result)).toEqual(['3', '4', '5', '6']);
    expect(handValue(result).total).toBe(18);
  });

  it('keeps hitting a soft 17 it makes mid-draw under H17', () => {
    const H17 = withRules({ dealer: { hitsSoft17: true } });
    const shoe = createShoe({ shoe: {} }, { cards: parseCards(['4S', 'AD']) });
    const result = playDealerHand(parseCards(['AS', '2H']), shoe, H17); // soft13 -> soft17 -> soft18
    expect(handValue(result)).toEqual({ total: 18, soft: true });
  });
});

describe('insurance edges', () => {
  it('is not offered when the player has bet their whole bankroll', () => {
    const rules = withRules({ player: { insuranceAllowed: true }, table: { startingBankroll: 5 } });
    const g = dealt(rules, ['9S', 'AH', '9D', '5C']); // dealer Ace up, but bankroll is 0 after the bet
    expect(g.bankrollCents).toBe(0);
    expect(g.phase).toBe(Phase.PlayerTurn); // no insurance prompt
  });

  it('is not offered on a ten upcard even when enabled', () => {
    const rules = withRules({ player: { insuranceAllowed: true } });
    const g = dealt(rules, ['9S', '10H', '9D', '5C']); // ten up, no blackjack
    expect(g.phase).toBe(Phase.PlayerTurn);
  });

  it('insuring a blackjack against a non-blackjack dealer loses the side bet', () => {
    const rules = withRules({ player: { insuranceAllowed: true } });
    const g = dealt(rules, ['AS', 'AH', 'KD', '5C']); // P A,K=BJ ; dealer A,5 (no BJ)
    expect(g.phase).toBe(Phase.Insurance);
    takeInsurance(g);
    expect(g.playerHands[0].outcome).toBe('blackjack');
    // -$5 deal, -$2.50 insurance, +$12.50 (stake + 3:2) => +$5 net
    expect(g.bankrollCents).toBe(START + 500);
  });

  it('resolves a dealer ten-up blackjack with no insurance prompt', () => {
    const rules = withRules({ player: { insuranceAllowed: true } });
    const g = dealt(rules, ['9S', '10H', '9D', 'AC']); // dealer 10,A = blackjack
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands[0].outcome).toBe('lose');
    expect(g.bankrollCents).toBe(START - 500);
  });
});

describe('money + bankroll guards', () => {
  it('pays 6:5 in exact cents on a larger bet', () => {
    const rules = withRules({ payouts: { blackjack: 1.2 } });
    const r = settle({
      playerCards: parseCards(['AS', 'KH']),
      dealerCards: parseCards(['10D', '9C']),
      stakeCents: 2500, // $25
      rules,
    });
    expect(r).toEqual({ outcome: 'blackjack', returnCents: 5500 }); // 2500 + 3000
  });

  it('forbids double/split when the bankroll cannot fund the extra stake', () => {
    const rules = withRules({ table: { startingBankroll: 5 } }); // one $5 bet empties the bankroll
    const dbl = dealt(rules, ['5S', '9H', '6D', '8C']); // 11, would normally double
    expect(dbl.bankrollCents).toBe(0);
    expect(canDouble(dbl)).toBe(false);
    const spl = dealt(rules, ['8S', '9H', '8D', '3C']); // a pair, would normally split
    expect(canSplit(spl)).toBe(false);
  });
});

describe('settlement edges', () => {
  it('a three-card 21 beats a dealer 20 (as a win, not a blackjack)', () => {
    const g = dealt(withRules(), ['9S', '10H', '5D', '10C', '7S']); // hit 9,5 -> 21 vs dealer 20
    hit(g);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands[0].outcome).toBe('win');
    expect(g.bankrollCents).toBe(START - 500 + 1000);
  });

  it('a player bust loses even when the dealer also busts', () => {
    expect(
      decideOutcome(parseCards(['10S', '10H', '5D']), false, parseCards(['10D', '10C', '5S']))
    ).toBe('lose');
  });
});
