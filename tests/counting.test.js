import { describe, it, expect } from 'vitest';
import { createGame, setBet, deal, stand, surrender, split, Phase } from '../src/engine/game.js';
import { createShoe, reshuffle, draw } from '../src/engine/shoe.js';
import { parseCards, parseCard } from '../src/engine/cards.js';
import {
  hiLoTag,
  runningCount,
  trueCount,
  countFromShoe,
  isSupportedSystem,
} from '../src/teaching/counting.js';
import { withRules } from './helpers/rules.js';

// Deal order consumes the stack as: player, dealer-up, player, dealer-hole.
const dealt = (rules, stack, bet = 500) => {
  const g = createGame(rules, { cards: parseCards(stack) });
  setBet(g, bet);
  deal(g);
  return g;
};
const running = (g) => countFromShoe(g.shoe).running;

describe('Hi-Lo tags', () => {
  it('tags 2–6 as +1, 7–9 as 0, and 10–A as −1', () => {
    for (const r of ['2', '3', '4', '5', '6']) expect(hiLoTag(parseCard(r + 'S'))).toBe(1);
    for (const r of ['7', '8', '9']) expect(hiLoTag(parseCard(r + 'S'))).toBe(0);
    for (const r of ['10', 'J', 'Q', 'K', 'A']) expect(hiLoTag(parseCard(r + 'S'))).toBe(-1);
  });

  it('sums a running count over a list of cards', () => {
    expect(runningCount(parseCards(['2S', '3H', 'KD', 'AS', '7C']))).toBe(0); // +1 +1 −1 −1 0
    expect(runningCount(parseCards(['5S', '6H', '4D']))).toBe(3);
  });
});

describe('true count', () => {
  it('is the running count per deck remaining', () => {
    expect(trueCount(6, 2)).toBe(3);
    expect(trueCount(3, 1.5)).toBe(2);
    expect(trueCount(-4, 2)).toBe(-2);
  });

  it('guards an empty shoe instead of dividing by zero', () => {
    expect(trueCount(5, 0)).toBe(0);
  });

  it('derives decks remaining from the physical shoe', () => {
    const shoe = createShoe({ shoe: {} }, { cards: parseCards(['2S', '3H', '4D', '5C']) });
    shoe.seenCards.push(parseCard('2S'), parseCard('3H')); // running +2
    const r = countFromShoe(shoe);
    expect(r.running).toBe(2);
    expect(r.decksRemaining).toBeCloseTo(4 / 52);
    expect(r.trueCount).toBeCloseTo(2 / (4 / 52));
  });
});

describe('only Hi-Lo is implemented', () => {
  it('reports support and quietly falls back for others', () => {
    expect(isSupportedSystem('hi-lo')).toBe(true);
    expect(isSupportedSystem('ko')).toBe(false);
    // An unsupported system still computes (falls back to Hi-Lo) rather than throwing.
    expect(runningCount(parseCards(['5S', '5H']), 'ko')).toBe(2);
  });
});

describe('counts cards as the player sees them', () => {
  const rules = withRules();

  it('counts the player cards + dealer upcard at the deal, but NOT the hole', () => {
    const g = dealt(rules, ['10S', '7D', '10H', 'KC']); // P 10,10 ; D up 7, hole K
    expect(g.shoe.seenCards).toHaveLength(3);
    // 10(−1) + 7(0) + 10(−1) = −2 ; the hole K is excluded (it would make −3)
    expect(running(g)).toBe(-2);
  });

  it('adds the hole card only once it is revealed at showdown', () => {
    const g = dealt(rules, ['10S', '7D', '10H', 'KC']); // dealer 7+K = 17, stands pat
    expect(running(g)).toBe(-2); // before the reveal
    stand(g);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.dealerHoleRevealed).toBe(true);
    expect(g.dealerCards).toHaveLength(2); // dealer did not draw
    expect(g.shoe.seenCards).toHaveLength(4);
    expect(running(g)).toBe(-3); // hole K (−1) now counted
  });

  it('counts the hole immediately when a natural ends the round', () => {
    const g = dealt(rules, ['AS', '9D', 'KH', '5C']); // player A,K = blackjack ; D 9, hole 5
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.dealerHoleRevealed).toBe(true);
    // A(−1) + 9(0) + K(−1) + hole 5(+1) = −1
    expect(running(g)).toBe(-1);
  });

  it('counts the hole when the player surrenders', () => {
    const ls = withRules({ player: { surrender: 'late' } });
    const g = dealt(ls, ['10S', '9D', '6H', '5C']); // P 16 ; D up 9, hole 5
    expect(running(g)).toBe(0); // 10(−1) + 9(0) + 6(+1), hole still hidden
    surrender(g);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.dealerHoleRevealed).toBe(true);
    expect(running(g)).toBe(1); // + hole 5(+1)
  });

  it('counts dealer draws as they are turned up', () => {
    // P 20 stands; dealer 9+6 = 15 draws a 4 -> 19 (S17).
    const g = dealt(rules, ['10S', '9D', '10H', '6C', '4S']);
    stand(g);
    expect(g.dealerCards).toHaveLength(3); // drew once
    expect(g.shoe.seenCards).toHaveLength(5); // 3 dealt + hole + 1 draw
    // 10(−1) + 9(0) + 10(−1) + hole 6(+1) + draw 4(+1) = 0
    expect(running(g)).toBe(0);
  });

  it('does not double-count the moved card on a split', () => {
    // P 8,8 split; left draws 5, right draws 2. Dealer 9 up, hole 9, stands on 18.
    const g = dealt(rules, ['8S', '9D', '8H', '9C', '5S', '2H']);
    split(g);
    // seen so far: 8,8,9up (deal) + 5,2 (the two new split cards) = 5 (hole still hidden)
    expect(g.shoe.seenCards).toHaveLength(5);
    expect(running(g)).toBe(2); // 8(0)+8(0)+9(0)+5(+1)+2(+1)
  });
});

describe('reshuffle resets the count', () => {
  it('clears seenCards so a fresh shoe starts at zero', () => {
    const shoe = createShoe({ shoe: {} }, { cards: parseCards(['2S', '3H', '4D', '5C']) });
    expect(shoe.seenCards).toEqual([]);
    draw(shoe);
    shoe.seenCards.push(parseCard('2S'));
    reshuffle(shoe);
    expect(shoe.seenCards).toEqual([]);
    expect(shoe.pos).toBe(0);
  });

  it('returns the running count to 0 after a real deal then reshuffle', () => {
    const g = dealt(withRules(), ['5S', '6D', '4H', '3C', '2S', '7D', '8H', '9C']);
    expect(running(g)).not.toBe(0);
    reshuffle(g.shoe);
    expect(running(g)).toBe(0);
  });
});
