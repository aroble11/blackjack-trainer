/**
 * hand.js — evaluating a set of cards.
 *
 * Pure functions over an array of cards. "Blackjack" here is the raw two-card
 * 21; whether it actually PAYS 3:2 also depends on game state (a 21 made on a
 * split hand is not a natural). The game/settlement layer applies that rule via
 * each hand's `fromSplit` flag — see game.js.
 */

import { cardValue, isAce } from './cards.js';

/**
 * @param {Array<{rank:string,suit:string}>} cards
 * @returns {{ total: number, soft: boolean }}
 *   total: best non-busting total when possible, else the busting total.
 *   soft:  true when an ace is still counted as 11 (e.g. A-6 = soft 17).
 *
 * Counts every ace as 11, then downgrades aces to 1 (−10 each) while the hand
 * would bust. Handles multiple aces correctly: A-A = soft 12, A-A-A = soft 13.
 */
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (isAce(card)) {
      aces++;
      total += 11;
    } else {
      total += cardValue(card);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

/** Raw two-card 21 (a "natural"). See module note re: split hands. */
export function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards) {
  return handValue(cards).total > 21;
}

/**
 * A splittable pair: exactly two cards of equal blackjack value, so any two
 * 10-valued cards (K-Q, J-10, …) count. This is the common casino rule and the
 * one documented in the Phase 1 plan.
 */
export function isPair(cards) {
  return cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);
}
