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
import { finiteDeckEVs } from './finite-deck.js';

/**
 * @param {Array} playerCards - the active hand's cards.
 * @param {object} dealerUpcard - the dealer's upcard.
 * @param {object} rules - the RULES config.
 * @param {{fromSplit?:boolean, splitBudget?:number, legal?:object}} [context]
 * @returns {{action:string, evs:object, dealerDist:object, total:number, soft:boolean}}
 *   action ∈ 'stand' | 'hit' | 'double' | 'split' | 'surrender'.
 */
export function bestAction(playerCards, dealerUpcard, rules, context = {}) {
  if (rules.shoe.numberOfDecks <= 2) {
    const result = finiteDeckEVs(playerCards, dealerUpcard, rules, context);
    for (const a in result.evs) if (context.legal?.[a] === false) delete result.evs[a];
    result.action = Object.keys(result.evs).reduce((best, a) => result.evs[a] > result.evs[best] ? a : best, 'stand');
    return result;
  }
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
  const splitBudget = context.splitBudget ?? p.maxSplitHands - (fromSplit ? 2 : 1);
  if (twoCards && splitBudget > 0 && p.splitAllowed && isPair(playerCards) &&
      !(fromSplit && playerCards[0].rank === 'A' && !p.resplitAces)) {
    evs.split = splitEV(cardValue(playerCards[0]), dealerDist, rules, memo, splitBudget);
  }
  if (twoCards && !fromSplit && (p.surrender === 'late' || p.surrender === 'early')) {
    evs.surrender = -0.5;
  }

  let action = 'stand';
  for (const a in evs) if (context.legal?.[a] === false) delete evs[a];
  for (const a in evs) if (evs[a] > (evs[action] ?? -Infinity)) action = a;
  return { action, evs, dealerDist, total, soft, model: 'infinite' };
}
