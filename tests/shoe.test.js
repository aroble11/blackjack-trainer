import { describe, it, expect } from 'vitest';
import {
  buildDecks,
  shuffle,
  createShoe,
  draw,
  cardsRemaining,
  needsReshuffle,
  reshuffle,
  setRandomCutCard,
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

  it('ignores continuousShuffle (unimplemented) and reshuffles by penetration', () => {
    // CSM is not implemented; the flag must NOT force a reshuffle — penetration
    // governs, exactly like a normal shoe (see the capability guard + README).
    const cards = parseCards(['AS', 'KH', '2S', '3H', '4D', '5C', '6S', '7H', '8D', '9C']);
    const shoe = createShoe({ shoe: { continuousShuffle: true, penetration: 0.5 } }, { cards }); // cutIndex = 5
    expect(needsReshuffle(shoe)).toBe(false); // fresh shoe, below the cut card
    for (let i = 0; i < 5; i++) draw(shoe); // pos = 5
    expect(needsReshuffle(shoe)).toBe(true); // only now, at the cut
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

describe('random cut card', () => {
  // For a full 6-deck shoe (312 cards) at 0.9 penetration:
  const LEN = 312;
  const LO = Math.floor(LEN * (2 / 3)); // 208 — start of the last third
  const DEEP = Math.floor(LEN * 0.9); //   280 — the safe cap (== fixed cut when off)

  it('off: cut is exactly the fixed penetration depth (unchanged behavior)', () => {
    const shoe = createShoe({ shoe: { penetration: 0.9, randomCutCard: false } }, { rng: mulberry32(1) });
    expect(shoe.cutIndex).toBe(DEEP);
  });

  it('on: cut lands in the last third, never deeper than penetration', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const shoe = createShoe(
        { shoe: { penetration: 0.9, randomCutCard: true } },
        { rng: mulberry32(seed) }
      );
      expect(shoe.cutIndex).toBeGreaterThanOrEqual(LO);
      expect(shoe.cutIndex).toBeLessThanOrEqual(DEEP);
    }
  });

  it('on: the cut actually varies between shoes (is random)', () => {
    const cuts = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      cuts.add(
        createShoe({ shoe: { penetration: 0.9, randomCutCard: true } }, { rng: mulberry32(seed) }).cutIndex
      );
    }
    expect(cuts.size).toBeGreaterThan(1);
  });

  it('reshuffle re-picks a fresh cut within range when on', () => {
    const shoe = createShoe({ shoe: { penetration: 0.9, randomCutCard: true } }, { rng: mulberry32(3) });
    for (let i = 0; i < 5; i++) {
      reshuffle(shoe);
      expect(shoe.cutIndex).toBeGreaterThanOrEqual(LO);
      expect(shoe.cutIndex).toBeLessThanOrEqual(DEEP);
    }
  });

  it('setRandomCutCard toggles the flag and re-picks the cut on the shoe in play', () => {
    const shoe = createShoe({ shoe: { penetration: 0.9, randomCutCard: false } }, { rng: mulberry32(9) });
    expect(shoe.cutIndex).toBe(DEEP);
    setRandomCutCard(shoe, true);
    expect(shoe.randomCutCard).toBe(true);
    expect(shoe.cutIndex).toBeGreaterThanOrEqual(LO);
    expect(shoe.cutIndex).toBeLessThanOrEqual(DEEP);
    setRandomCutCard(shoe, false);
    expect(shoe.cutIndex).toBe(DEEP); // back to the fixed deep cut
  });
});

describe('single-deck reshuffle floor', () => {
  // A 1-deck shoe (52 cards) must reshuffle once <= 20 cards remain, so a hand
  // has a reserve: the cut is capped at 52 - 20 = 32 regardless of
  // penetration or the cut card.
  const FLOOR_CUT = 52 - 20; // 32

  it('caps the cut so >=20 cards remain, even at deep penetration', () => {
    const shoe = createShoe({ shoe: { numberOfDecks: 1, penetration: 0.9 } }, { rng: mulberry32(1) });
    expect(shoe.cutIndex).toBe(FLOOR_CUT); // floor(52*0.9)=46 pulled back to 32
  });

  it('applies even with the random cut card on', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const shoe = createShoe(
        { shoe: { numberOfDecks: 1, penetration: 0.9, randomCutCard: true } },
        { rng: mulberry32(seed) }
      );
      expect(shoe.cutIndex).toBe(FLOOR_CUT); // random range [34,46] is deeper, so capped to 32
    }
  });

  it('reshuffle triggers once 20 or fewer cards remain', () => {
    const shoe = createShoe({ shoe: { numberOfDecks: 1, penetration: 0.9 } }, { rng: mulberry32(2) });
    for (let i = 0; i < 31; i++) draw(shoe); // pos 31 -> 21 cards remain
    expect(cardsRemaining(shoe)).toBe(21);
    expect(needsReshuffle(shoe)).toBe(false);
    draw(shoe); // pos 32 -> 20 cards remain
    expect(cardsRemaining(shoe)).toBe(20);
    expect(needsReshuffle(shoe)).toBe(true);
  });

  it('preserves a six-deck cut whose natural reserve exceeds 20', () => {
    const shoe = createShoe({ shoe: { numberOfDecks: 6, penetration: 0.9 } }, { rng: mulberry32(1) });
    expect(shoe.cutIndex).toBe(Math.floor(312 * 0.9)); // 280 — no floor applied
  });
});
