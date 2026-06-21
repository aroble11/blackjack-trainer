/**
 * probabilities.js — card-draw probabilities and incremental hand math for the
 * strategy engine.
 *
 * Basic strategy is computed with the infinite-deck (full-shoe) approximation:
 * each rank A-9 is drawn with probability 1/13 and a ten-value with 4/13. This
 * is the basis of the canonical multi-deck charts and is essentially exact for
 * 4-8 decks. (Single/double-deck composition effects — a handful of cells — are
 * not modeled; the in-app note flags cross-checking against an authoritative
 * chart.)
 */

// Distinct draw outcomes with their probabilities. `v` is the card's base value
// (ace = 11; ten/J/Q/K = 10).
export const DRAW = [
  { v: 2, p: 1 / 13 },
  { v: 3, p: 1 / 13 },
  { v: 4, p: 1 / 13 },
  { v: 5, p: 1 / 13 },
  { v: 6, p: 1 / 13 },
  { v: 7, p: 1 / 13 },
  { v: 8, p: 1 / 13 },
  { v: 9, p: 1 / 13 },
  { v: 10, p: 4 / 13 },
  { v: 11, p: 1 / 13 },
];

/**
 * Add a card (base value `v`) to a hand described by (total, soft). `soft` means
 * exactly one ace is currently counted as 11. Mirrors engine hand.js semantics:
 * count the new ace as 11, then demote aces from 11 to 1 while the hand busts.
 */
export function addCard(total, soft, v) {
  let acesAsEleven = soft ? 1 : 0;
  let t = total + v;
  if (v === 11) acesAsEleven += 1;
  while (t > 21 && acesAsEleven > 0) {
    t -= 10;
    acesAsEleven -= 1;
  }
  return { total: t, soft: acesAsEleven > 0 };
}

/** Build a (total, soft) state from a list of base values. */
export function handFromValues(values) {
  let total = 0;
  let soft = false;
  for (const v of values) ({ total, soft } = addCard(total, soft, v));
  return { total, soft };
}
