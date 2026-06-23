/**
 * counting.js — card-counting math for the odds tracker (Phase 4).
 *
 * Pure functions over the cards the player has actually SEEN. The engine keeps
 * that list in `shoe.seenCards`, appending each card the moment it becomes
 * visible and clearing it on a reshuffle (see game.js / shoe.js). The dealer's
 * hole card is therefore counted only when it is turned over, never when dealt —
 * exactly what a real counter at the table can see.
 *
 * Hi-Lo is the implemented system (the startup capability guard warns and this
 * module falls back to Hi-Lo if the config selects another). Hi-Lo tags:
 *   2–6 → +1,  7–9 → 0,  10/J/Q/K/A → −1.
 */

import { cardValue, isAce } from '../engine/cards.js';
import { cardsRemaining } from '../engine/shoe.js';

/** Hi-Lo tag for a single card. */
export function hiLoTag(card) {
  if (isAce(card)) return -1;
  const v = cardValue(card); // 2..10, with J/Q/K = 10
  if (v <= 6) return 1; // 2–6
  if (v <= 9) return 0; // 7–9
  return -1; // 10/J/Q/K
}

const TAGGERS = { 'hi-lo': hiLoTag };

/** Whether a configured counting system is implemented (others fall back to Hi-Lo). */
export function isSupportedSystem(system) {
  return system === 'hi-lo';
}

/** Running count: the sum of tags over the seen cards. */
export function runningCount(cards, system = 'hi-lo') {
  const tag = TAGGERS[system] ?? hiLoTag;
  let rc = 0;
  for (const c of cards) rc += tag(c);
  return rc;
}

/**
 * True count: the running count per deck still to come. `decksRemaining` is the
 * physical cards left in the shoe ÷ 52 (the hole card has already been dealt, so
 * it is not "remaining"). Guarded so a — practically impossible — empty shoe
 * reads 0 rather than ±Infinity.
 */
export function trueCount(running, decksRemaining) {
  if (decksRemaining <= 0) return 0;
  return running / decksRemaining;
}

/**
 * The full readout derived from a shoe: running count, decks remaining, and true
 * count. Only meaningful for a depleting shoe (shoe.continuousShuffle false).
 */
export function countFromShoe(shoe, system = 'hi-lo') {
  const seen = shoe.seenCards ?? [];
  const running = runningCount(seen, system);
  const decksRemaining = cardsRemaining(shoe) / 52;
  return { running, decksRemaining, trueCount: trueCount(running, decksRemaining) };
}
