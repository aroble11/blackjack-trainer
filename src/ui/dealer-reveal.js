/**
 * dealer-reveal.js — the staged dealer turn, as a pure view over a settled round.
 *
 * The engine plays the dealer and settles the round in one synchronous step
 * (it stays pure and instant). For game feel, the UI then *reveals* that
 * finished round in stages: hole card face down → hole card flips → each
 * dealer draw, one at a time → the result. `shown` is the number of dealer
 * cards face up (1 = upcard only, hole still down).
 *
 * While a reveal is in progress nothing may leak the outcome early, so the
 * staged view also rolls back what the player could not yet know:
 *   - the dealer cards not yet turned over,
 *   - their effect on the Hi-Lo count (they are the newest `seenCards`) and on
 *     the cards-remaining figure,
 *   - the settlement credited to the bankroll,
 *   - the round-over phase (shown as DealerTurn, so no badges/overlay).
 */

import { Phase } from '../engine/game.js';

/** Whether a settled round has a dealer reveal worth staging. */
export function needsReveal(g) {
  return g.phase === Phase.RoundOver && g.dealerHoleRevealed && g.dealerCards.length >= 2;
}

/** The pre-settlement bankroll: settled bankroll minus everything credited at settlement. */
export function preSettlementBankroll(g) {
  const returned = g.playerHands.reduce((s, h) => s + (h.returnCents ?? 0), 0);
  return g.bankrollCents - returned - (g.insuranceReturnCents ?? 0);
}

/**
 * A render-ready copy of the game with only `shown` dealer cards face up.
 * Shallow: player hands are the SAME objects (render.js tracks dealt-card
 * animation by hand identity), only the top-level fields that leak are replaced.
 */
export function stagedView(g, shown) {
  const total = g.dealerCards.length;
  const n = Math.max(1, Math.min(shown, total));
  // Cards face down / undealt still: the hole (if n === 1) plus later draws.
  const unseen = total - n;
  // Draws not yet made (the hole was physically dealt at the start of the round).
  const undrawn = total - Math.max(n, 2);
  const seen = g.shoe.seenCards ?? [];
  return {
    ...g,
    phase: Phase.DealerTurn,
    dealerCards: g.dealerCards.slice(0, Math.max(n, 2)),
    dealerHoleRevealed: n >= 2,
    bankrollCents: preSettlementBankroll(g),
    shoe: {
      ...g.shoe,
      seenCards: unseen > 0 ? seen.slice(0, Math.max(0, seen.length - unseen)) : seen,
      pos: g.shoe.pos - Math.max(0, undrawn),
    },
  };
}
