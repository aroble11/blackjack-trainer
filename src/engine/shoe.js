/**
 * shoe.js — the multi-deck shoe: build, shuffle, draw, reshuffle.
 *
 * A shoe is a plain object holding the full multiset of cards plus a draw
 * pointer (`pos`) and a cut index (the penetration threshold at which we
 * reshuffle BETWEEN rounds — never mid-hand). The game layer checks
 * needsReshuffle() before dealing each round.
 *
 * The shuffle takes an injectable RNG so tests are deterministic, and
 * createShoe() can take an explicit pre-stacked `cards` array so tests can set
 * up exact scenarios (player BJ, dealer bust, specific splits).
 */

import { SUITS, RANKS } from './cards.js';

/** One ordered 52-card deck per requested deck, A..K in each suit. */
export function buildDecks(numberOfDecks) {
  const cards = [];
  for (let d = 0; d < numberOfDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ rank, suit });
      }
    }
  }
  return cards;
}

/**
 * Fisher-Yates shuffle, in place. A real unbiased shuffle — NOT the biased
 * `array.sort(() => Math.random() - 0.5)` trick.
 * @param {Array} cards
 * @param {() => number} rng - returns a float in [0, 1). Defaults to Math.random.
 */
export function shuffle(cards, rng = Math.random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = cards[i];
    cards[i] = cards[j];
    cards[j] = tmp;
  }
  return cards;
}

/**
 * Create a shoe from the rules.
 * @param {object} rules - the RULES object (reads rules.shoe).
 * @param {object} [opts]
 * @param {() => number} [opts.rng] - injectable RNG for the shuffle.
 * @param {Array} [opts.cards] - explicit pre-stacked deck (NOT shuffled), for tests.
 */
export function createShoe(rules, { rng = Math.random, cards } = {}) {
  const shoeRules = rules?.shoe ?? {};
  const numberOfDecks = shoeRules.numberOfDecks ?? 6;
  const penetration = shoeRules.penetration ?? 0.75;
  const continuousShuffle = shoeRules.continuousShuffle ?? false;
  const randomCutCard = shoeRules.randomCutCard ?? false;

  // Pre-stacked decks are copied and used verbatim; otherwise build + shuffle.
  const deck = cards ? cards.slice() : shuffle(buildDecks(numberOfDecks), rng);

  return {
    cards: deck,
    pos: 0,
    seenCards: [], // cards the player has SEEN this shoe (for counting): appended as revealed, cleared on reshuffle
    cutIndex: pickCutIndex(deck.length, penetration, randomCutCard, rng, numberOfDecks),
    rng,
    numberOfDecks,
    penetration,
    continuousShuffle,
    randomCutCard,
  };
}

// The fraction of the shoe at which the "last third" begins — the shallowest a
// random cut card may land.
const LAST_THIRD = 2 / 3;

// A single-deck shoe reshuffles once this few cards remain, so a hand can never
// run the deck dry mid-round (the live game only reshuffles between rounds).
// Multi-deck shoes have a much larger natural buffer and don't need this floor.
const SINGLE_DECK_MIN_REMAINING = 20;

/**
 * Choose where the cut card sits (the draw index that triggers a between-rounds
 * reshuffle). With randomCutCard OFF this is the fixed `penetration` depth — the
 * historical behavior. With it ON, the cut lands at a uniformly random position
 * in the last third of the shoe, but never deeper than `penetration` (the safe
 * cap), so a buffer of cards always remains and the shoe can't exhaust mid-hand.
 *
 * For a single deck the cut is additionally pulled no deeper than
 * `length - SINGLE_DECK_MIN_REMAINING`, guaranteeing ≥20 cards remain when a
 * round is dealt (a 1-deck round can otherwise draw past the end).
 */
function pickCutIndex(length, penetration, randomCutCard, rng, numberOfDecks) {
  const deep = Math.floor(length * penetration);
  let cut = deep;
  if (randomCutCard) {
    const lo = Math.floor(length * LAST_THIRD);
    cut = deep <= lo ? deep : lo + Math.floor(rng() * (deep - lo + 1)); // random in [lo, deep]
  }
  if (numberOfDecks === 1 && length > SINGLE_DECK_MIN_REMAINING) {
    cut = Math.min(cut, length - SINGLE_DECK_MIN_REMAINING);
  }
  return cut;
}

/**
 * Toggle the random cut card on an existing shoe and re-pick its cut index in
 * place, so the change takes effect on the shoe already in play (the reshuffle
 * fires on the next Deal once the pointer reaches the new cut).
 */
export function setRandomCutCard(shoe, on) {
  shoe.randomCutCard = on;
  shoe.cutIndex = pickCutIndex(shoe.cards.length, shoe.penetration, on, shoe.rng, shoe.numberOfDecks);
  return shoe;
}

/** Draw the next card, advancing the pointer. Throws if the shoe is exhausted. */
export function draw(shoe) {
  if (shoe.pos >= shoe.cards.length) {
    throw new Error('Shoe exhausted: drew past the end of the shoe.');
  }
  return shoe.cards[shoe.pos++];
}

export function cardsRemaining(shoe) {
  return shoe.cards.length - shoe.pos;
}

/**
 * Should we reshuffle before dealing the next round? True once the cut card is
 * reached (penetration). Call this only BETWEEN rounds.
 *
 * continuousShuffle (a CSM) is NOT implemented — the capability guard
 * (validateRules.js) warns, and we deliberately fall back to a normal
 * penetration-based reshuffle so the configured flag never silently changes
 * play. (See README's capability table.)
 */
export function needsReshuffle(shoe) {
  return shoe.pos >= shoe.cutIndex;
}

/** Gather the whole shoe, reshuffle, and reset the draw pointer. */
export function reshuffle(shoe) {
  shuffle(shoe.cards, shoe.rng);
  shoe.pos = 0;
  shoe.seenCards = []; // a fresh shoe — the running count starts over
  // Re-pick the cut so each fresh shoe gets a new random cut card (a no-op for
  // the fixed-penetration cut when randomCutCard is off).
  shoe.cutIndex = pickCutIndex(
    shoe.cards.length,
    shoe.penetration,
    shoe.randomCutCard,
    shoe.rng,
    shoe.numberOfDecks
  );
  return shoe;
}
