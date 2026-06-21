/**
 * dealer-odds.js — the probability distribution of the dealer's final total,
 * given the upcard. This is the foundation every EV calculation stands on.
 *
 * Conditioned on the dealer NOT having blackjack: the engine always peeks on an
 * Ace/ten upcard, so the player only acts (and so we only advise) when the round
 * continues. Uses the infinite-deck probabilities from probabilities.js.
 */

import { DRAW, addCard, handFromValues } from './probabilities.js';

function dealerStands(total, soft, rules) {
  if (total >= 18) return true;
  if (total === 17) return !(soft && rules.dealer.hitsSoft17); // H17 hits soft 17
  return false;
}

/** Distribution of final totals reachable from a (total, soft) dealer hand. */
function distFrom(total, soft, rules, memo) {
  if (total > 21) return { bust: 1 };
  if (dealerStands(total, soft, rules)) return { [total]: 1 };
  const key = `${total}${soft ? 's' : 'h'}`;
  const cached = memo.get(key);
  if (cached) return cached;
  const dist = {};
  for (const { v, p } of DRAW) {
    const next = addCard(total, soft, v);
    const sub = distFrom(next.total, next.soft, rules, memo);
    for (const k in sub) dist[k] = (dist[k] || 0) + p * sub[k];
  }
  memo.set(key, dist);
  return dist;
}

/**
 * @param {number} upValue - the upcard's base value (ace = 11, ten = 10, …).
 * @returns {{17:number,18:number,19:number,20:number,21:number,bust:number}}
 *   probabilities summing to 1 (after removing the dealer-blackjack branch).
 */
export function dealerOutcomeDistribution(upValue, rules) {
  const memo = new Map();
  const dist = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
  let norm = 0;
  for (const { v, p } of DRAW) {
    const start = handFromValues([upValue, v]); // upcard + hole card
    if (start.total === 21) continue; // a two-card 21 is a dealer blackjack — peeked away
    const sub = distFrom(start.total, start.soft, rules, memo);
    for (const k in sub) dist[k] = (dist[k] || 0) + p * sub[k];
    norm += p;
  }
  for (const k in dist) dist[k] /= norm; // renormalize over the no-blackjack branches
  return dist;
}
