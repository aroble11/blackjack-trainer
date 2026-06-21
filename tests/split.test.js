import { describe, it, expect } from 'vitest';
import {
  createGame,
  setBet,
  deal,
  stand,
  double,
  split,
  canSplit,
  canDouble,
  Phase,
} from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { withRules } from './helpers/rules.js';

const START = 50000;
const ranks = (cards) => cards.map((c) => c.rank);

const dealt = (rules, stack, bet = 500) => {
  const g = createGame(rules, { cards: parseCards(stack) });
  setBet(g, bet);
  deal(g);
  return g;
};

describe('basic split (eights)', () => {
  // deal: P 8,8  D 9(up),5(hole). split draws 3 (left) then 2 (right);
  // dealer then draws 10 and busts.
  const stack = ['8S', '9H', '8D', '5C', '3S', '2H', '10D'];

  it('creates two staked hands, one card dealt to each', () => {
    const g = dealt(withRules(), stack);
    expect(canSplit(g)).toBe(true);
    split(g);
    expect(g.playerHands).toHaveLength(2);
    expect(g.bankrollCents).toBe(START - 500 - 500); // two stakes committed
    expect(ranks(g.playerHands[0].cards)).toEqual(['8', '3']);
    expect(ranks(g.playerHands[1].cards)).toEqual(['8', '2']);
    expect(g.playerHands.every((h) => h.fromSplit)).toBe(true);
    expect(g.activeHandIndex).toBe(0); // still playing the left hand
  });

  it('settles both hands against the dealer (dealer busts -> both win)', () => {
    const g = dealt(withRules(), stack);
    split(g);
    stand(g); // left hand (11)
    expect(g.activeHandIndex).toBe(1);
    stand(g); // right hand (10)
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands.map((h) => h.outcome)).toEqual(['win', 'win']);
    expect(g.bankrollCents).toBe(START - 1000 + 2000); // +$10
  });
});

describe('split aces', () => {
  // deal: P A,A  D 9(up),7(hole). Aces get one card each: K then 9.
  // dealer draws 2 -> 18.
  const stack = ['AS', '9H', 'AD', '7C', 'KS', '9D', '2H'];

  it('gives one card each, stands automatically, and 21 is NOT a blackjack', () => {
    const g = dealt(withRules(), stack);
    split(g); // both ace hands resolve immediately -> dealer plays -> settle
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.playerHands).toHaveLength(2);
    expect(ranks(g.playerHands[0].cards)).toEqual(['A', 'K']); // 21, but...
    expect(g.playerHands[0].outcome).toBe('win'); // ...paid as 21, not 3:2
    expect(g.playerHands[1].outcome).toBe('win'); // A,9 = 20 vs 18
    expect(g.bankrollCents).toBe(START - 1000 + 2000);
  });
});

describe('re-split cap (maxSplitHands)', () => {
  it('refuses a further split once the cap is reached', () => {
    const rules = withRules({ player: { maxSplitHands: 2 } });
    // P 8,8 -> split -> left draws another 8 (pair again), right draws 2.
    const g = dealt(rules, ['8S', '9H', '8D', '5C', '8H', '2C', '5S', '5D']);
    split(g);
    expect(ranks(g.playerHands[0].cards)).toEqual(['8', '8']); // a pair again
    expect(canSplit(g)).toBe(false); // but we're already at 2 hands
  });
});

describe('double after split (DAS)', () => {
  const stack = ['8S', '9H', '8D', '5C', '3S', '2H', '10D', '4S'];

  it('allows doubling a split hand when DAS is on', () => {
    const g = dealt(withRules(), stack);
    split(g); // left 8,3=11 ; right 8,2=10
    expect(canDouble(g)).toBe(true);
    double(g); // left: +10 = 21, stake doubled
    expect(g.playerHands[0].stakeCents).toBe(1000);
    expect(g.activeHandIndex).toBe(1);
    stand(g); // right stands on 10
    expect(g.phase).toBe(Phase.RoundOver);
    // dealer 9,5 = 14 -> +4 = 18. left 21 wins (stake 1000), right 10 loses.
    expect(g.playerHands[0].outcome).toBe('win');
    expect(g.playerHands[1].outcome).toBe('lose');
    expect(g.bankrollCents).toBe(START - 500 - 500 - 500 + 2000); // +$5 net
  });

  it('forbids doubling a split hand when DAS is off', () => {
    const rules = withRules({ player: { doubleAfterSplit: false } });
    const g = dealt(rules, stack);
    split(g);
    expect(canDouble(g)).toBe(false);
  });
});

describe('split gating', () => {
  it('is false for a non-pair', () => {
    const g = dealt(withRules(), ['8S', '9H', '9D', '5C']); // 8,9
    expect(canSplit(g)).toBe(false);
  });

  it('is false when the bankroll cannot fund the second bet', () => {
    const rules = withRules({ table: { startingBankroll: 5 } }); // exactly one $5 bet
    const g = dealt(rules, ['8S', '9H', '8D', '5C']);
    expect(g.bankrollCents).toBe(0);
    expect(canSplit(g)).toBe(false);
  });
});
