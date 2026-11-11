/**
 * drill.js — quick-fire strategy practice: deal one decision, grade it against
 * the computed basic strategy, explain the answer, next.
 *
 * Situations are drawn uniformly from the chosen category so rare-but-costly
 * hands (soft doubles, pair splits) come up far more often than at the table.
 * Grading is the same advisor the hint uses (bestAction via recommend('basic')),
 * with the same legality: only moves the rules allow are offered.
 */

import { parseCard } from '../engine/cards.js';
import { handValue, isPair } from '../engine/hand.js';
import { recommend } from './strategies.js';
import { doubleAllowedForTotal } from './ev.js';
import { UPCARDS } from './chart.js';

export const DRILLS = {
  soft: 'Soft hands',
  pairs: 'Pairs',
  stiff: 'Hard 12–16',
  all: 'Everything',
};

const SUITS = ['S', 'H', 'D', 'C'];
const TEN_RANKS = ['10', 'J', 'Q', 'K'];
const code = (rank) => (rank === '10' ? 'T' : rank);

function card(rank, rng) {
  const r = rank === '10' ? TEN_RANKS[Math.floor(rng() * 4)] : rank;
  return parseCard(code(r) + SUITS[Math.floor(rng() * 4)]);
}

const pickFrom = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/** Two ranks for the player's hand in the given category. */
function playerRanks(kind, rng) {
  switch (kind) {
    case 'soft':
      return ['A', String(2 + Math.floor(rng() * 8))]; // A,2 … A,9
    case 'pairs': {
      const r = pickFrom(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'], rng);
      return [r, r];
    }
    case 'stiff': {
      // Hard 12–16 from two non-pair cards (a ten + 2..6, or two mid cards).
      const total = 12 + Math.floor(rng() * 5);
      const a = Math.max(2, total - 10) + Math.floor(rng() * Math.min(4, 10 - Math.max(2, total - 10)));
      const b = total - a;
      return a === b || b > 10 ? ['10', String(total - 10)] : [String(a), String(b)];
    }
    default:
      return playerRanks(pickFrom(['soft', 'pairs', 'stiff', 'hard'], rng), rng);
    case 'hard': {
      // Any hard total 5–11 or 17–19.
      const total = pickFrom([5, 6, 7, 8, 9, 10, 11, 17, 18, 19], rng);
      const a = total <= 11 ? 2 + Math.floor(rng() * Math.min(total - 3, 8)) : 10;
      const b = total - a;
      return a === b ? [String(a - 1), String(b + 1)] : [String(a), String(b)];
    }
  }
}

/** A fresh drill question: { cards, upcard, kind }. */
export function newQuestion(kind = 'all', rng = Math.random) {
  const [a, b] = playerRanks(kind, rng);
  return { kind, cards: [card(a, rng), card(b, rng)], upcard: card(pickFrom(UPCARDS, rng), rng) };
}

/** The moves to offer for a question under the rules (a fresh two-card hand). */
export function legalMoves(q, rules) {
  const { total, soft } = handValue(q.cards);
  const p = rules.player;
  const moves = ['hit', 'stand'];
  if (p.doubleAllowed && doubleAllowedForTotal(total, soft, rules)) moves.push('double');
  if (p.splitAllowed && isPair(q.cards)) moves.push('split');
  if (p.surrender === 'late' || p.surrender === 'early') moves.push('surrender');
  return moves;
}

/** Grade an answer: { correct, rec } where rec is the full basic-strategy recommendation. */
export function gradeAnswer(q, move, rules) {
  const rec = recommend('basic', q.cards, q.upcard, rules);
  return { correct: rec.action === move, rec };
}
