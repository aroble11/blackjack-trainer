/**
 * game.js — the blackjack round state machine.
 *
 * Holds all round state and exposes pure-ish functions that mutate a `game`
 * object created by createGame(). The UI calls actions (deal/hit/stand/double)
 * and reads legality from the can*() helpers — it must never re-derive the
 * rules itself, so the engine stays the single source of truth.
 *
 * Player hands are an ARRAY with an active index from the start (length 1 until
 * a split), so Step 4 (split) only has to add entries — no rewrite.
 *
 * Money is in integer cents (see money.js). Each stake is deducted when
 * committed (bet/double/split) and credited back at settlement.
 */

import { createShoe, draw, needsReshuffle, reshuffle } from './shoe.js';
import { handValue, isBlackjack, isBust, isPair } from './hand.js';
import { cardValue, isAce } from './cards.js';
import { playDealerHand } from './dealer.js';
import { settle } from './settlement.js';
import { toCents } from './money.js';

export const Phase = {
  Betting: 'betting',
  Insurance: 'insurance',
  PlayerTurn: 'playerTurn',
  DealerTurn: 'dealerTurn',
  RoundOver: 'roundOver',
};

/**
 * @param {object} rules - the RULES config object.
 * @param {object} [opts] - forwarded to createShoe ({ rng, cards }) for tests.
 */
export function createGame(rules, opts = {}) {
  return {
    rules,
    shoe: createShoe(rules, opts),
    bankrollCents: toCents(rules.table.startingBankroll),
    phase: Phase.Betting,
    betCents: 0,
    dealerCards: [],
    dealerHoleRevealed: false,
    insuranceCents: 0,
    playerHands: [],
    activeHandIndex: 0,
  };
}

// ── small helpers ───────────────────────────────────────────────────────────
const minBetCents = (g) => toCents(g.rules.table.minBet);
const maxBetCents = (g) => toCents(g.rules.table.maxBet);
const insuranceCostCents = (g) => Math.floor(g.playerHands[0].stakeCents / 2);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function activeHand(g) {
  return g.playerHands[g.activeHandIndex];
}

function newHand(cards, stakeCents, fromSplit = false) {
  return { cards, stakeCents, fromSplit, done: false, outcome: null, returnCents: 0 };
}

// ── betting ─────────────────────────────────────────────────────────────────
export function setBet(g, cents) {
  if (g.phase !== Phase.Betting) return g.betCents;
  const upper = Math.max(0, Math.min(maxBetCents(g), g.bankrollCents));
  g.betCents = clamp(Math.round(cents), 0, upper);
  return g.betCents;
}

export function addToBet(g, cents) {
  return setBet(g, g.betCents + cents);
}

export function clearBet(g) {
  if (g.phase === Phase.Betting) g.betCents = 0;
  return g;
}

export function canDeal(g) {
  return (
    g.phase === Phase.Betting &&
    g.betCents >= minBetCents(g) &&
    g.betCents <= g.bankrollCents
  );
}

// ── dealing ─────────────────────────────────────────────────────────────────
export function deal(g) {
  if (!canDeal(g)) throw new Error('Cannot deal: invalid bet or wrong phase.');
  if (needsReshuffle(g.shoe)) reshuffle(g.shoe);

  g.bankrollCents -= g.betCents; // commit the stake

  // Deal order: player, dealer up, player, dealer hole.
  const player = [draw(g.shoe)];
  const dealer = [draw(g.shoe)];
  player.push(draw(g.shoe));
  dealer.push(draw(g.shoe));

  g.dealerCards = dealer;
  g.dealerHoleRevealed = false;
  g.insuranceCents = 0;
  g.playerHands = [newHand(player, g.betCents, false)];
  g.activeHandIndex = 0;

  offerInsuranceOrResolve(g);
  return g;
}

/**
 * Insurance is offered (when enabled and affordable) the instant the dealer
 * shows an Ace, BEFORE the peek. Otherwise we go straight to resolving naturals.
 */
function offerInsuranceOrResolve(g) {
  const up = g.dealerCards[0];
  if (
    up.rank === 'A' &&
    g.rules.player.insuranceAllowed &&
    g.bankrollCents >= insuranceCostCents(g)
  ) {
    g.phase = Phase.Insurance;
    return;
  }
  resolvePeekAndNaturals(g);
}

export function takeInsurance(g) {
  if (g.phase !== Phase.Insurance) return g;
  g.insuranceCents = insuranceCostCents(g);
  g.bankrollCents -= g.insuranceCents; // commit the side bet (half the original)
  resolvePeekAndNaturals(g);
  return g;
}

export function declineInsurance(g) {
  if (g.phase !== Phase.Insurance) return g;
  g.insuranceCents = 0;
  resolvePeekAndNaturals(g);
  return g;
}

/**
 * The dealer always peeks (US style) when showing an Ace or a ten — Phase 1
 * behavior; the guard warns if the config disables it. Insurance, if taken, pays
 * 2:1 on a dealer natural. Any natural (dealer or player) then ends the round
 * immediately, before the player acts and without the dealer drawing.
 */
function resolvePeekAndNaturals(g) {
  const up = g.dealerCards[0];
  const dealerCouldHaveBlackjack = up.rank === 'A' || cardValue(up) === 10;
  const dealerBlackjack = dealerCouldHaveBlackjack && isBlackjack(g.dealerCards);
  const playerBlackjack = isBlackjack(g.playerHands[0].cards);

  if (g.insuranceCents > 0 && dealerBlackjack) {
    g.bankrollCents +=
      g.insuranceCents + Math.round(g.insuranceCents * g.rules.payouts.insurance);
  }

  if (dealerBlackjack || playerBlackjack) {
    g.playerHands[0].done = true;
    g.dealerHoleRevealed = true;
    settleRound(g); // dealer does not draw on a natural
  } else {
    g.phase = Phase.PlayerTurn;
  }
}

// ── player actions ──────────────────────────────────────────────────────────
export function hit(g) {
  if (!canHit(g)) return g;
  const hand = activeHand(g);
  hand.cards.push(draw(g.shoe));
  // Reaching 21 (or busting) ends the hand — no useful action remains.
  if (handValue(hand.cards).total >= 21) advanceHand(g);
  return g;
}

export function stand(g) {
  if (!canStand(g)) return g;
  advanceHand(g);
  return g;
}

export function double(g) {
  if (!canDouble(g)) throw new Error('Double not allowed in this state.');
  const hand = activeHand(g);
  g.bankrollCents -= hand.stakeCents; // commit a matching stake
  hand.stakeCents *= 2;
  hand.cards.push(draw(g.shoe)); // exactly one card
  advanceHand(g);
  return g;
}

/**
 * Late surrender: forfeit half the original bet and end the round, allowed only
 * as the first action on the original two-card hand (the peek has already
 * cleared a dealer natural). 'early' surrender falls back to this and the guard
 * warns. The dealer does not draw.
 */
export function surrender(g) {
  if (!canSurrender(g)) throw new Error('Surrender not allowed in this state.');
  const hand = g.playerHands[0];
  hand.done = true;
  hand.outcome = 'surrender';
  hand.returnCents = Math.floor(hand.stakeCents / 2);
  g.bankrollCents += hand.returnCents;
  g.dealerHoleRevealed = true;
  g.phase = Phase.RoundOver;
  return g;
}

/** Finish the active hand and move on; when the last hand is done, the dealer plays. */
function advanceHand(g) {
  const cur = activeHand(g);
  if (cur) cur.done = true;
  // Move to the next hand that still needs playing, skipping any already
  // resolved (e.g. both halves of a split-ace, which stand on one card each).
  do {
    g.activeHandIndex += 1;
  } while (
    g.activeHandIndex < g.playerHands.length &&
    g.playerHands[g.activeHandIndex].done
  );
  if (g.activeHandIndex >= g.playerHands.length) {
    playDealerAndSettle(g);
    return;
  }
  // A hand already totalling 21 (e.g. a split card made 21) needs no action.
  if (handValue(activeHand(g).cards).total >= 21) advanceHand(g);
}

function playDealerAndSettle(g) {
  g.phase = Phase.DealerTurn;
  g.dealerHoleRevealed = true;
  // The dealer only draws if at least one player hand is still live.
  if (g.playerHands.some((h) => !isBust(h.cards))) {
    g.dealerCards = playDealerHand(g.dealerCards, g.shoe, g.rules);
  }
  settleRound(g);
}

function settleRound(g) {
  for (const hand of g.playerHands) {
    const { outcome, returnCents } = settle({
      playerCards: hand.cards,
      fromSplit: hand.fromSplit,
      stakeCents: hand.stakeCents,
      dealerCards: g.dealerCards,
      rules: g.rules,
    });
    hand.outcome = outcome;
    hand.returnCents = returnCents;
    g.bankrollCents += returnCents;
  }
  g.phase = Phase.RoundOver;
}

// ── next round / bankroll ────────────────────────────────────────────────────
export function nextRound(g) {
  g.phase = Phase.Betting;
  g.dealerCards = [];
  g.dealerHoleRevealed = false;
  g.playerHands = [];
  g.activeHandIndex = 0;
  g.insuranceCents = 0;
  g.betCents = Math.min(g.betCents, maxBetCents(g), g.bankrollCents); // keep last bet, but affordable
  return g;
}

export function isBroke(g) {
  return g.bankrollCents < minBetCents(g);
}

/** Re-buy to the starting bankroll when busted out (only while betting). */
export function rebuy(g) {
  if (g.phase === Phase.Betting && isBroke(g)) {
    g.bankrollCents = toCents(g.rules.table.startingBankroll);
  }
  return g;
}

/** Deliberately reset to the starting bankroll for a fresh session (only while betting). */
export function resetBankroll(g) {
  if (g.phase === Phase.Betting) {
    g.bankrollCents = toCents(g.rules.table.startingBankroll);
    g.betCents = 0;
  }
  return g;
}

// ── action legality (the UI's single source of truth) ────────────────────────
export function canHit(g) {
  if (g.phase !== Phase.PlayerTurn) return false;
  const hand = activeHand(g);
  return !!hand && !hand.done && handValue(hand.cards).total < 21;
}

export function canStand(g) {
  if (g.phase !== Phase.PlayerTurn) return false;
  const hand = activeHand(g);
  return !!hand && !hand.done;
}

export function canDouble(g) {
  if (g.phase !== Phase.PlayerTurn) return false;
  const hand = activeHand(g);
  if (!hand || hand.done) return false;
  const p = g.rules.player;
  if (!p.doubleAllowed) return false;
  if (hand.cards.length !== 2) return false;
  if (hand.fromSplit && !p.doubleAfterSplit) return false;
  if (g.bankrollCents < hand.stakeCents) return false;
  return withinDoubleRestriction(hand.cards, p.doubleRestriction);
}

export function canSplit(g) {
  if (g.phase !== Phase.PlayerTurn) return false;
  const hand = activeHand(g);
  if (!hand || hand.done) return false;
  const p = g.rules.player;
  if (!p.splitAllowed) return false;
  if (hand.cards.length !== 2) return false;
  if (!isPair(hand.cards)) return false;
  if (g.playerHands.length >= p.maxSplitHands) return false; // re-split cap
  if (g.bankrollCents < hand.stakeCents) return false; // can't fund the second bet
  return true;
}

export function canSurrender(g) {
  if (g.phase !== Phase.PlayerTurn) return false;
  const s = g.rules.player.surrender;
  if (s !== 'late' && s !== 'early') return false; // 'early' falls back to late
  if (g.playerHands.length !== 1 || g.activeHandIndex !== 0) return false;
  const hand = g.playerHands[0];
  return !hand.fromSplit && hand.cards.length === 2;
}

/**
 * Split the active pair. The original hand keeps its first card; the second card
 * seeds a new hand inserted immediately to its right (index i+1), so the left
 * hand — including any re-splits — finishes before the right one. One card is
 * dealt to each, and a matching stake is committed.
 *
 * Split aces take exactly one card each and stand (Phase 1 does not implement
 * hit/re-split aces; the capability guard warns if the config enables them). A
 * 21 made on any split hand is not a natural — settlement handles that via each
 * hand's fromSplit flag.
 */
export function split(g) {
  if (!canSplit(g)) throw new Error('Split not allowed in this state.');
  const i = g.activeHandIndex;
  const hand = g.playerHands[i];
  const splittingAces = hand.cards.every(isAce);

  g.bankrollCents -= hand.stakeCents;

  const movedCard = hand.cards.pop();
  hand.fromSplit = true;
  const sibling = newHand([movedCard], hand.stakeCents, true);
  g.playerHands.splice(i + 1, 0, sibling);

  hand.cards.push(draw(g.shoe)); // left hand's second card
  sibling.cards.push(draw(g.shoe)); // right hand's second card

  if (splittingAces && !g.rules.player.hitSplitAces) {
    hand.done = true;
    sibling.done = true;
    advanceHand(g); // skips both done ace hands -> next hand or dealer
  } else if (handValue(hand.cards).total >= 21) {
    advanceHand(g); // the split card made 21 on the left hand
  }
  return g;
}

/**
 * Whether a starting total qualifies to double under the config restriction.
 * '9-11' and '10-11' are HARD-total ranges, so a soft hand never qualifies.
 */
export function withinDoubleRestriction(cards, restriction) {
  const { total, soft } = handValue(cards);
  if (restriction === 'any') return true;
  if (soft) return false;
  if (restriction === '9-11') return total >= 9 && total <= 11;
  if (restriction === '10-11') return total >= 10 && total <= 11;
  return true;
}
