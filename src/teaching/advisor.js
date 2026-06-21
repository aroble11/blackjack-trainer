/**
 * advisor.js — the basic-strategy recommendation: compute the EV of every legal
 * action for (player hand, dealer upcard, rules) and pick the highest.
 *
 * The result is COMPUTED from the configured rules, not recalled from a chart —
 * so it adapts to H17/S17, DAS, surrender, double restrictions, etc. It is
 * validated against canonical charts in tests, and the app/README flags that you
 * should still cross-check against an authoritative chart before relying on it.
 */

import { handValue, isPair } from '../engine/hand.js';
import { cardValue } from '../engine/cards.js';
import { dealerOutcomeDistribution } from './dealer-odds.js';
import { standEV, hitOptimalEV, doubleEV, splitEV, doubleAllowedForTotal } from './ev.js';

/**
 * @param {Array} playerCards - the active hand's cards.
 * @param {object} dealerUpcard - the dealer's upcard.
 * @param {object} rules - the RULES config.
 * @param {{fromSplit?:boolean}} [context]
 * @returns {{action:string, evs:object, dealerDist:object, total:number, soft:boolean}}
 *   action ∈ 'stand' | 'hit' | 'double' | 'split' | 'surrender'.
 */
export function bestAction(playerCards, dealerUpcard, rules, context = {}) {
  const fromSplit = !!context.fromSplit;
  const dealerDist = dealerOutcomeDistribution(cardValue(dealerUpcard), rules);
  const memo = new Map();
  const { total, soft } = handValue(playerCards);
  const twoCards = playerCards.length === 2;
  const p = rules.player;

  const evs = {
    stand: standEV(total, dealerDist),
    hit: hitOptimalEV(total, soft, dealerDist, memo),
  };

  if (twoCards && p.doubleAllowed && doubleAllowedForTotal(total, soft, rules) && (!fromSplit || p.doubleAfterSplit)) {
    evs.double = doubleEV(total, soft, dealerDist);
  }
  if (twoCards && !fromSplit && p.splitAllowed && isPair(playerCards)) {
    evs.split = splitEV(cardValue(playerCards[0]), dealerDist, rules, memo);
  }
  if (twoCards && !fromSplit && (p.surrender === 'late' || p.surrender === 'early')) {
    evs.surrender = -0.5;
  }

  let action = 'stand';
  for (const a in evs) if (evs[a] > evs[action]) action = a;
  return { action, evs, dealerDist, total, soft };
}
