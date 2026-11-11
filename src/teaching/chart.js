/**
 * chart.js — a full basic-strategy chart GENERATED from the advisor for the
 * rules in play (spec §6: never a chart recalled from memory). Every cell is
 * bestAction() on a representative two-card hand, so the chart is exactly what
 * the in-game hint would say, and it changes when the rules change.
 *
 * Cell codes (the conventional chart notation):
 *   H  hit           S  stand          P  split
 *   Dh double, else hit                Ds double, else stand
 *   Rh surrender, else hit             Rs surrender, else stand
 */

import { parseCards, parseCard } from '../engine/cards.js';
import { bestAction } from './advisor.js';

export const UPCARDS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
const UP_CODE = { 10: 'T' };

/** A two-card, non-pair hand for each hard total 5–17 (8 and under always hit). */
const HARD = {
  5: ['2', '3'], 6: ['2', '4'], 7: ['2', '5'], 8: ['3', '5'], 9: ['3', '6'], 10: ['4', '6'],
  11: ['5', '6'], 12: ['3', '9'], 13: ['4', '9'], 14: ['5', '9'], 15: ['6', '9'], 16: ['7', '9'], 17: ['8', '9'],
};
export const HARD_ROWS = Object.keys(HARD).map(Number);
export const SOFT_ROWS = [2, 3, 4, 5, 6, 7, 8, 9]; // A,2 … A,9 → soft 13 … soft 20
export const PAIR_ROWS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

const toCard = (rank, suit) => `${UP_CODE[rank] ?? rank}${suit}`;
const hand = (a, b) => parseCards([toCard(a, 'S'), toCard(b, 'H')]);

/** The chart code for one hand vs one upcard. */
export function cellCode(cards, upRank, rules) {
  const up = parseCard(toCard(upRank, 'D'));
  const { action, evs } = bestAction(cards, up, rules);
  const fallback = () => (evs.hit >= evs.stand ? 'h' : 's');
  switch (action) {
    case 'hit':
      return 'H';
    case 'stand':
      return 'S';
    case 'split':
      return 'P';
    case 'double':
      return 'D' + fallback();
    case 'surrender':
      return 'R' + fallback();
    /* v8 ignore next 2 */
    default:
      return '?';
  }
}

/**
 * The whole chart: { hard: {total: codes[]}, soft: {x: codes[]}, pairs: {rank: codes[]} },
 * each codes[] in UPCARDS order. Cached per rule set (the relevant rule fields).
 *
 * Always the INFINITE-deck model: the exact finite-deck model the in-game hint
 * uses for 1–2 decks takes tens of seconds for a full chart, so for those games
 * the chart screen says the live hint may differ on a few close hands.
 */
const cache = new Map();
export function strategyChart(rules) {
  const key = JSON.stringify([rules.dealer, rules.player, rules.payouts]);
  if (cache.has(key)) return cache.get(key);
  // Any deck count > 2 selects the infinite-deck model (which ignores the count).
  const infRules = { ...rules, shoe: { ...rules.shoe, numberOfDecks: 8 } };
  const row = (cards) => UPCARDS.map((up) => cellCode(cards, up, infRules));
  const chart = { hard: {}, soft: {}, pairs: {} };
  for (const t of HARD_ROWS) chart.hard[t] = row(hand(...HARD[t]));
  for (const x of SOFT_ROWS) chart.soft[x] = row(hand('A', String(x)));
  for (const p of PAIR_ROWS) chart.pairs[p] = row(hand(p, p));
  cache.set(key, chart);
  return chart;
}
