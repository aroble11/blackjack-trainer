/**
 * ev.js — expected value (in units of the original bet) of each player action
 * against a given dealer outcome distribution. Win = +1, push = 0, lose = −1.
 *
 * These are total-dependent (the decision depends on the hand total + dealer
 * upcard), matching how canonical basic-strategy charts are derived.
 */

import { DRAW, addCard, handFromValues } from './probabilities.js';

export function doubleAllowedForTotal(total, soft, rules) {
  if (!rules.player.doubleAllowed) return false;
  const r = rules.player.doubleRestriction;
  if (r === 'any') return true;
  if (soft) return false; // '9-11' / '10-11' are hard-total ranges
  if (r === '9-11') return total >= 9 && total <= 11;
  if (r === '10-11') return total >= 10 && total <= 11;
  return true;
}

/** EV of standing on `total` against the dealer distribution. */
export function standEV(total, dealerDist) {
  if (total > 21) return -1;
  let ev = 0;
  for (const k in dealerDist) {
    const p = dealerDist[k];
    if (!p) continue;
    if (k === 'bust') ev += p;
    else {
      const d = Number(k);
      ev += p * (total > d ? 1 : total < d ? -1 : 0);
    }
  }
  return ev;
}

/** EV of taking at least one more card, then playing optimally (hit vs stand). */
export function hitOptimalEV(total, soft, dealerDist, memo) {
  const key = `${total}${soft ? 's' : 'h'}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  let ev = 0;
  for (const { v, p } of DRAW) {
    const next = addCard(total, soft, v);
    if (next.total > 21) ev += p * -1;
    else ev += p * Math.max(standEV(next.total, dealerDist), hitOptimalEV(next.total, next.soft, dealerDist, memo));
  }
  memo.set(key, ev);
  return ev;
}

/** Best of standing or hitting-then-playing-optimally. */
export function optimalEV(total, soft, dealerDist, memo) {
  return Math.max(standEV(total, dealerDist), hitOptimalEV(total, soft, dealerDist, memo));
}

/** EV of doubling: one card only, then stand, at twice the stake. */
export function doubleEV(total, soft, dealerDist) {
  let ev = 0;
  for (const { v, p } of DRAW) {
    const next = addCard(total, soft, v);
    ev += p * (next.total > 21 ? -1 : standEV(next.total, dealerDist));
  }
  return 2 * ev;
}

/**
 * EV of splitting a pair of base value `pairValue` — the total over both new
 * hands, in units of the original bet (so it compares directly against the
 * single-hand stand/hit/double EVs). Each new hand draws one card and is played
 * optimally; with DAS it may double. Split aces take one card and stand. Re-splits share a finite remaining-hand allowance across descendants.
 */
export function splitEV(pairValue, dealerDist, rules, memo, splitBudget = rules.player.maxSplitHands - 1) {
  const isAces = pairValue === 11;
  const das = rules.player.doubleAfterSplit;
  let nonPairEV = 0;
  let pairEV = 0;
  let pairProbability = 0;
  for (const { v, p } of DRAW) {
    const hand = handFromValues([pairValue, v]);
    let ev;
    if (isAces && !rules.player.hitSplitAces) {
      ev = standEV(hand.total, dealerDist); // one card only on split aces
    } else {
      ev = optimalEV(hand.total, hand.soft, dealerDist, memo);
      if (das && doubleAllowedForTotal(hand.total, hand.soft, rules)) {
        ev = Math.max(ev, doubleEV(hand.total, hand.soft, dealerDist));
      }
    }
    if (v === pairValue) { pairEV = ev; pairProbability = p; }
    else nonPairEV += p * ev;
  }
  // Remaining split capacity is SHARED by both descendants, not independently
  // available to each. Pending hands each hold one original pair card.
  const cache = new Map();
  function pendingValue(pending, remaining) {
    if (!pending) return 0;
    const key = `${pending}:${remaining}`;
    if (cache.has(key)) return cache.get(key);
    const rest = pendingValue(pending - 1, remaining);
    const keepPair = pairEV + rest;
    const resplit = remaining > 0 && !isAces
      ? pendingValue(pending + 1, remaining - 1) : -Infinity;
    const value = nonPairEV + (1 - pairProbability) * rest +
      pairProbability * Math.max(keepPair, resplit);
    cache.set(key, value);
    return value;
  }
  return pendingValue(2, Math.max(0, splitBudget - 1));
}
