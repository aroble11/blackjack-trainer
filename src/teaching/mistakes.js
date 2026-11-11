/**
 * mistakes.js — what a decision cost, in the advisor's own computed numbers.
 *
 * Costs are expected value per 1 unit of the hand's ORIGINAL bet (the same
 * units bestAction() reports EVs in): 0.08 means "on average this play gives
 * up 8¢ per $1 bet compared with the recommended play". Nothing here is
 * recalled from a chart — it is the gap between two computed EVs.
 *
 * Also: the insurance decision, priced from the cards the player has actually
 * seen (never the face-down hole card).
 */

import { bestAction } from './advisor.js';
import { cardValue } from '../engine/cards.js';
import { handValue, isPair } from '../engine/hand.js';

/**
 * EV given up by playing `chosen` instead of `recommended` (both actions), per
 * unit of original bet. null when either action has no computed EV. Can be ≤ 0
 * when a user-defined chart recommends a play that is not actually better.
 */
export function decisionCost(cards, upcard, rules, context, chosen, recommended) {
  const { evs } = bestAction(cards, upcard, rules, context);
  if (evs[chosen] == null || evs[recommended] == null) return null;
  return evs[recommended] - evs[chosen];
}

/**
 * A short "situation" label for stats and drills: "Hard 16 vs 10",
 * "Soft 18 vs 9", "Pair of 8s vs A".
 */
export function situationKey(cards, upcard) {
  const up = upcard.rank === 'A' ? 'A' : String(cardValue(upcard));
  if (cards.length === 2 && isPair(cards)) {
    const r = cards[0].rank === 'A' ? 'A' : String(cardValue(cards[0]));
    return `Pair of ${r}s vs ${up}`;
  }
  const { total, soft } = handValue(cards);
  return `${soft ? 'Soft' : 'Hard'} ${total} vs ${up}`;
}

/** "8¢" / "$1.20" for a per-$1 cost; "under 1¢" for near-ties. */
export function formatCostPerDollar(cost) {
  const cents = Math.round(cost * 100);
  if (cents < 1) return 'under 1¢';
  return cents < 100 ? `${cents}¢` : `$${(cents / 100).toFixed(2)}`;
}

// ── insurance ────────────────────────────────────────────────────────────────

const isTen = (c) => cardValue(c) === 10;

/**
 * Chance the dealer's hole card is a ten, from what the player can see: the
 * whole shoe minus every card already seen. (The hole card is unseen, so it is
 * part of that pool — exactly the counter's view.) Also the insurance EV per $1
 * of insurance: win 2:1 with probability p, lose the stake otherwise.
 */
export function insuranceOdds(shoe, rules) {
  const payout = rules.payouts.insurance ?? 2;
  const all = shoe.cards ?? [];
  const seen = shoe.seenCards ?? [];
  let tens = all.reduce((n, c) => n + (isTen(c) ? 1 : 0), 0);
  let total = all.length;
  for (const c of seen) {
    total -= 1;
    if (isTen(c)) tens -= 1;
  }
  const pTen = total > 0 ? tens / total : 4 / 13;
  return { pTen, ev: pTen * payout - (1 - pTen), breakEven: 1 / (payout + 1) };
}
