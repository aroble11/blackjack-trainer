import { describe, it, expect } from 'vitest';
import {
  buildDecks,
  shuffle,
  createShoe,
  draw,
  cardsRemaining,
  needsReshuffle,
  reshuffle,
} from '../src/engine/shoe.js';
import { cardLabel, parseCards } from '../src/engine/cards.js';
import { mulberry32 } from './helpers/rng.js';

const multiset = (cards) => cards.map(cardLabel).sort();

describe('buildDecks', () => {
  it('builds 52 cards per deck', () => {
    expect(buildDecks(1)).toHaveLength(52);
    expect(buildDecks(6)).toHaveLength(312);
  });

  it('builds the right composition (4 aces per deck)', () => {
    const aces = buildDecks(6).filter((c) => c.rank === 'A');
    expect(aces).toHaveLength(24);
  });
});

describe('shuffle', () => {
  it('is a permutation — preserves the exact multiset', () => {
    const deck = buildDecks(2);
    const before = multiset(deck);
    shuffle(deck, mulberry32(42));
    expect(multiset(deck)).toEqual(before);
  });

  it('is deterministic for a given seed', () => {
    const a = buildDecks(1);
    const b = buildDecks(1);
    shuffle(a, mulberry32(7));
    shuffle(b, mulberry32(7));
    expect(a.map(cardLabel)).toEqual(b.map(cardLabel));
  });

  it('actually reorders the deck', () => {
    const deck = buildDecks(1);
    const before = deck.map(cardLabel);
    shuffle(deck, mulberry32(7));
    expect(deck.map(cardLabel)).not.toEqual(before);
  });
});

describe('shoe draw / reshuffle', () => {
  it('draws a pre-stacked deck in order', () => {
    const shoe = createShoe({ shoe: { penetration: 0.75 } }, { cards: parseCards(['AS', 'KH', '5D']) });
    expect(cardLabel(draw(shoe))).toBe('A♠');
    expect(cardLabel(draw(shoe))).toBe('K♥');
    expect(cardLabel(draw(shoe))).toBe('5♦');
    expect(cardsRemaining(shoe)).toBe(0);
  });

  it('throws when drawn past the end', () => {
    const shoe = createShoe({ shoe: {} }, { cards: parseCards(['AS', 'KH']) });
    draw(shoe);
    draw(shoe);
    expect(() => draw(shoe)).toThrow(/exhausted/i);
  });

  it('signals reshuffle once the cut card (penetration) is reached', () => {
    const cards = parseCards(['AS', 'KH', '5D', '6C', '7S', '8H', '9D', '10C', 'JS', 'QH']);
    const shoe = createShoe({ shoe: { penetration: 0.5 } }, { cards }); // cutIndex = 5
    for (let i = 0; i < 4; i++) draw(shoe);
    expect(needsReshuffle(shoe)).toBe(false);
    draw(shoe); // pos = 5
    expect(needsReshuffle(shoe)).toBe(true);
  });

  it('always reshuffles when continuousShuffle is on', () => {
    const shoe = createShoe({ shoe: { continuousShuffle: true } }, { cards: parseCards(['AS', 'KH']) });
    expect(needsReshuffle(shoe)).toBe(true);
  });

  it('reshuffle resets the pointer and keeps the multiset', () => {
    const shoe = createShoe({ shoe: { penetration: 0.75 } }, { rng: mulberry32(1) });
    const before = multiset(shoe.cards);
    draw(shoe);
    draw(shoe);
    reshuffle(shoe);
    expect(shoe.pos).toBe(0);
    expect(multiset(shoe.cards)).toEqual(before);
  });
});
