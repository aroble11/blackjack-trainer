/**
 * dealer.js — how the dealer plays out their hand, per the config.
 *
 * The peek-for-blackjack decision lives in game.js (it depends on round state);
 * this module only covers drawing to a stand.
 */

import { handValue } from './hand.js';
import { draw } from './shoe.js';

/**
 * Should the dealer take another card?
 * Stands on hard 17+. On a SOFT 17 it depends on the rule:
 *   hitsSoft17 = true  -> "H17": hit soft 17
 *   hitsSoft17 = false -> "S17": stand on all 17s
 */
export function shouldDealerHit(cards, rules) {
  const { total, soft } = handValue(cards);
  if (total < 17) return true;
  if (total === 17 && soft && rules.dealer.hitsSoft17) return true;
  return false;
}

/** Play the dealer's hand to completion, drawing from the shoe. Returns the final cards. */
export function playDealerHand(dealerCards, shoe, rules) {
  const cards = dealerCards.slice();
  while (shouldDealerHit(cards, rules)) {
    cards.push(draw(shoe));
  }
  return cards;
}
