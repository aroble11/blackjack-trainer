/**
 * settlement.js — decide the outcome of one player hand vs. the dealer, and the
 * amount (in cents) credited back to the bankroll.
 *
 * Money convention: the stake is deducted when committed (bet / double / split),
 * so `returnCents` here is the FULL amount returned to the bankroll:
 *   lose      -> 0
 *   push      -> stake
 *   win       -> stake + stake * regularWin
 *   blackjack -> stake + stake * blackjack
 *
 * A natural blackjack only counts when it is the ORIGINAL two-card hand — a 21
 * made on a split hand is just 21 (the caller passes fromSplit).
 */

import { handValue, isBlackjack, isBust } from './hand.js';

export function decideOutcome(playerCards, fromSplit, dealerCards) {
  if (isBust(playerCards)) return 'lose';

  const playerNatural = !fromSplit && isBlackjack(playerCards);
  const dealerNatural = isBlackjack(dealerCards);

  if (playerNatural && dealerNatural) return 'push';
  if (playerNatural) return 'blackjack';
  if (dealerNatural) return 'lose';

  if (isBust(dealerCards)) return 'win';

  const p = handValue(playerCards).total;
  const d = handValue(dealerCards).total;
  if (p > d) return 'win';
  if (p < d) return 'lose';
  return 'push';
}

export function payoutForOutcome(outcome, stakeCents, rules) {
  switch (outcome) {
    case 'lose':
      return 0;
    case 'push':
      return stakeCents;
    case 'win':
      return stakeCents + Math.round(stakeCents * rules.payouts.regularWin);
    case 'blackjack':
      return stakeCents + Math.round(stakeCents * rules.payouts.blackjack);
    default:
      return 0;
  }
}

export function settle({ playerCards, fromSplit = false, stakeCents, dealerCards, rules }) {
  const outcome = decideOutcome(playerCards, fromSplit, dealerCards);
  return { outcome, returnCents: payoutForOutcome(outcome, stakeCents, rules) };
}
