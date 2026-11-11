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

import { createShoe, draw, needsReshuffle, reshuffle, ShoeExhaustedError } from './shoe.js';
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
    justReshuffled: false,
    insuranceCents: 0, // insurance wagered this round (0 if none)
    insuranceReturnCents: 0, // credited back for insurance (stake + winnings), 0 if lost/none
    playerHands: [],
    activeHandIndex: 0,
    roundStartBankroll: null,
    roundVoided: false,
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

// ── counting support ─────────────────────────────────────────────────────────
// Record cards the moment the player SEES them, so the odds tracker counts as a
// real player would. The dealer hole card is added only when it is turned over
// (revealDealerHole), never when it is dealt. The list lives on the shoe and is
// cleared on a reshuffle (see shoe.js).
function markSeen(g, ...cards) {
  const seen = g.shoe.seenCards || (g.shoe.seenCards = []);
  for (const c of cards) if (c) seen.push(c);
}

/** Turn the dealer's hole card face up (idempotent) and count it as now-seen. */
function revealDealerHole(g) {
  if (g.dealerHoleRevealed) return; // already revealed + counted
  g.dealerHoleRevealed = true;
  markSeen(g, g.dealerCards[1]);
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
    Number.isSafeInteger(g.betCents) &&
    g.betCents >= minBetCents(g) &&
    g.betCents <= maxBetCents(g) &&
    g.betCents <= g.bankrollCents
  );
}

/** True once the shoe's actual deck count no longer matches the configured rule. */
export function deckCountChanged(g) {
  return g.shoe.numberOfDecks !== g.rules.shoe.numberOfDecks;
}

/** Force a full shoe rebuild at the currently configured deck count. Unlike
 * reshuffle(), which only shuffles the existing array in place, this is the
 * only way to actually change deck count. */
export function rebuildShoe(g) {
  g.shoe = createShoe(g.rules, { rng: g.shoe.rng });
  g.justReshuffled = true;
}

/** Abandon any round in progress and return to betting. Stakes already
 * committed (the initial bet, plus any double/split/insurance) are NOT
 * refunded — the hand is forfeited as a loss. Used when a deck-count change
 * forces an immediate shoe rebuild mid-hand: the cards in play can't survive a
 * reshuffle, so the hand is dropped. Resets the same state as nextRound(); the
 * difference is purely that no settlement credited the bankroll first. */
export function abandonRound(g) {
  return nextRound(g);
}

// ── dealing ─────────────────────────────────────────────────────────────────
function dealRound(g) {
  if (!canDeal(g)) throw new Error('Cannot deal: invalid bet or wrong phase.');
  if (deckCountChanged(g)) {
    rebuildShoe(g); // surfaces the same shuffle cue to the UI as a natural reshuffle
  } else {
    g.justReshuffled = needsReshuffle(g.shoe); // surfaced to the UI for a shuffle cue
    if (g.justReshuffled) reshuffle(g.shoe);
  }

  g.roundStartBankroll = g.bankrollCents;
  g.roundVoided = false;
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

  // The player's two cards and the dealer upcard are visible now; the hole is not.
  markSeen(g, player[0], player[1], dealer[0]);

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
    // Insurance wins: return the side-bet stake plus its winnings (2:1 standard).
    // Recorded so the round-over readout can reflect it (bankroll already has it).
    g.insuranceReturnCents =
      g.insuranceCents + Math.round(g.insuranceCents * g.rules.payouts.insurance);
    g.bankrollCents += g.insuranceReturnCents;
  }

  if (dealerBlackjack || playerBlackjack) {
    g.playerHands[0].done = true;
    revealDealerHole(g); // the hole turns over — count it
    settleRound(g); // dealer does not draw on a natural
  } else {
    g.phase = Phase.PlayerTurn;
  }
}

// ── player actions ──────────────────────────────────────────────────────────
function hitRound(g) {
  if (!canHit(g)) return g;
  const hand = activeHand(g);
  const card = draw(g.shoe);
  hand.cards.push(card);
  markSeen(g, card);
  // Reaching 21 (or busting) ends the hand — no useful action remains.
  if (handValue(hand.cards).total >= 21) advanceHand(g);
  return g;
}

function standRound(g) {
  if (!canStand(g)) return g;
  advanceHand(g);
  return g;
}

function doubleRound(g) {
  if (!canDouble(g)) throw new Error('Double not allowed in this state.');
  const hand = activeHand(g);
  g.bankrollCents -= hand.stakeCents; // commit a matching stake
  hand.stakeCents *= 2;
  const card = draw(g.shoe); // exactly one card
  hand.cards.push(card);
  markSeen(g, card);
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
  revealDealerHole(g); // the hole turns over — count it
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
  revealDealerHole(g); // the hole turns over — count it
  // The dealer only draws if at least one player hand is still live.
  if (g.playerHands.some((h) => !isBust(h.cards))) {
    const fromIndex = g.dealerCards.length;
    g.dealerCards = playDealerHand(g.dealerCards, g.shoe, g.rules);
    for (let i = fromIndex; i < g.dealerCards.length; i++) markSeen(g, g.dealerCards[i]);
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
  g.roundVoided = false;
  g.phase = Phase.Betting;
  g.dealerCards = [];
  g.dealerHoleRevealed = false;
  g.playerHands = [];
  g.activeHandIndex = 0;
  g.insuranceCents = 0;
  g.insuranceReturnCents = 0;
  g.betCents = rebetCents(g); // keep last bet, but affordable
  return g;
}

/** The bet carried into the next round: the last bet, capped by table max and bankroll. */
export function rebetCents(g) {
  return Math.min(g.betCents, maxBetCents(g), g.bankrollCents);
}

/** Whether "rebet & deal" can deal the next round at the carried-over bet in one step. */
export function canRebet(g) {
  return g.phase === Phase.RoundOver && rebetCents(g) >= minBetCents(g);
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
function splitRound(g) {
  if (!canSplit(g)) throw new Error('Split not allowed in this state.');
  const i = g.activeHandIndex;
  const hand = g.playerHands[i];
  const splittingAces = hand.cards.every(isAce);

  g.bankrollCents -= hand.stakeCents;

  const movedCard = hand.cards.pop();
  hand.fromSplit = true;
  const sibling = newHand([movedCard], hand.stakeCents, true);
  g.playerHands.splice(i + 1, 0, sibling);

  const leftCard = draw(g.shoe);
  hand.cards.push(leftCard); // left hand's second card
  const rightCard = draw(g.shoe);
  sibling.cards.push(rightCard); // right hand's second card
  markSeen(g, leftCard, rightCard); // the moved card was already counted at the deal

  if (splittingAces && !g.rules.player.hitSplitAces) {
    hand.done = true;
    sibling.done = true;
    advanceHand(g); // skips both done ace hands -> next hand or dealer
  } else if (handValue(hand.cards).total >= 21) {
    advanceHand(g); // the split card made 21 on the left hand
  }
  return g;
}

/** Shared by live play and simulation. A short shoe voids the WHOLE round,
 * including split, double and insurance stakes, then builds a fresh full shoe.
 * Other programming errors must still propagate. The reserve reduces how often
 * this happens; it is not a mathematical guarantee for arbitrary split rounds. */
function recoverExhaustion(g, action) {
  try { return action(g); }
  catch (error) {
    if (!(error instanceof ShoeExhaustedError)) throw error;
    g.bankrollCents = g.roundStartBankroll;
    nextRound(g);
    rebuildShoe(g);
    g.roundVoided = true;
    return g;
  }
}

export const deal = (g) => recoverExhaustion(g, dealRound);
export const hit = (g) => recoverExhaustion(g, hitRound);
export const stand = (g) => recoverExhaustion(g, standRound);
export const double = (g) => recoverExhaustion(g, doubleRound);
export const split = (g) => recoverExhaustion(g, splitRound);

/** The engine supplies action legality to every teaching consumer. */
export function decisionContext(g) {
  const hand = activeHand(g);
  return {
    fromSplit: !!hand?.fromSplit,
    splitBudget: Math.max(0, Math.min(
      g.rules.player.maxSplitHands - g.playerHands.length,
      hand?.stakeCents > 0 ? Math.floor(g.bankrollCents / hand.stakeCents) : 0
    )),
    legal: { hit: canHit(g), stand: canStand(g), double: canDouble(g),
      split: canSplit(g), surrender: canSurrender(g) },
  };
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
