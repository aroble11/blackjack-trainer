/**
 * simulator.js — Monte Carlo betting-system simulator (Phase 5).
 *
 * Runs many sessions of blackjack headlessly through the REAL engine (game.js):
 * same dealing, rules, peek, and settlement as live play, so results are correct
 * by construction rather than a re-implementation. Each hand is PLAYED by the
 * computed basic-strategy advisor (memoized for speed); the betting SYSTEM only
 * chooses the wager. A session plays up to `handsPerSession` hands from the
 * configured starting bankroll and ends early on ruin (can't cover the table
 * minimum). The output is the distribution of final profit/loss plus summary
 * stats, ready for charting.
 *
 * No card-counting bet variation here — Phase 5 is about betting systems on top
 * of flat basic-strategy play (per the spec).
 */

import {
  createGame,
  setBet,
  canDeal,
  deal,
  hit,
  stand,
  double,
  split,
  surrender,
  declineInsurance,
  nextRound,
  canDouble,
  canSplit,
  canSurrender,
  activeHand,
  Phase,
} from '../engine/game.js';
import { cardsRemaining, reshuffle } from '../engine/shoe.js';
import { bestAction } from '../teaching/advisor.js';
import { handValue, isPair } from '../engine/hand.js';
import { cardValue } from '../engine/cards.js';
import { createSystem } from './betting-systems.js';
import { mulberry32 } from './rng.js';

/**
 * A memoized basic-strategy "EV table" for a fixed ruleset: maps a hand
 * situation to the per-action EVs (which are bankroll-independent), so the
 * simulator picks the best LEGAL action each hand without recomputing. The cache
 * is shared across every session of a run, so it warms up once.
 */
function makeDecider(rules) {
  const cache = new Map();
  return (cards, upcard, fromSplit) => {
    const { total, soft } = handValue(cards);
    const twoCards = cards.length === 2;
    const pairVal = twoCards && isPair(cards) ? cardValue(cards[0]) : 0;
    const key = `${total}|${soft ? 1 : 0}|${twoCards ? 1 : 0}|${pairVal}|${fromSplit ? 1 : 0}|${cardValue(upcard)}`;
    let evs = cache.get(key);
    if (!evs) {
      evs = bestAction(cards, upcard, rules, { fromSplit }).evs;
      cache.set(key, evs);
    }
    return evs;
  };
}

/**
 * Highest-EV action among those currently legal. Double/split/surrender appear
 * in `evs` only when the rules permit them; here we also drop the ones the
 * bankroll or re-split cap forbids, so the player gracefully falls back (e.g. to
 * hit when a double is unaffordable). Stand and hit are always available to a
 * live hand in the player's turn.
 */
function bestLegalAction(game, evs) {
  const options = { stand: evs.stand, hit: evs.hit };
  if (evs.double !== undefined && canDouble(game)) options.double = evs.double;
  if (evs.split !== undefined && canSplit(game)) options.split = evs.split;
  if (evs.surrender !== undefined && canSurrender(game)) options.surrender = evs.surrender;
  let best = 'stand';
  for (const a in options) if (options[a] > options[best]) best = a;
  return best;
}

function applyAction(game, action) {
  switch (action) {
    case 'hit':
      hit(game);
      break;
    case 'double':
      double(game);
      break;
    case 'split':
      split(game);
      break;
    case 'surrender':
      surrender(game);
      break;
    default:
      stand(game);
  }
}

/** Play one round to completion. The bet must already be set and canDeal true. */
function playRound(game, decide) {
  deal(game);
  if (game.phase === Phase.Insurance) declineInsurance(game); // basic strategy never insures
  let guard = 0;
  while (game.phase === Phase.PlayerTurn) {
    const hand = activeHand(game);
    const evs = decide(hand.cards, game.dealerCards[0], hand.fromSplit);
    applyAction(game, bestLegalAction(game, evs));
    if (++guard > 200) throw new Error('Simulator: runaway hand loop'); // safety net
  }
}

/**
 * One session: up to `handsPerSession` hands from the starting bankroll, ending
 * early on ruin. Returns the net profit/loss and whether the session busted.
 */
export function runSession(rules, systemName, { handsPerSession = 100, rng = Math.random, decider } = {}) {
  const decide = decider || makeDecider(rules);
  const game = createGame(rules, { rng });
  const system = createSystem(systemName, rules);
  const startCents = game.bankrollCents;
  let handsPlayed = 0;
  let ruined = false;

  for (let h = 0; h < handsPerSession; h++) {
    setBet(game, system.bet()); // engine clamps to min(desired, table max, bankroll)
    if (!canDeal(game)) {
      ruined = true; // can't cover the table minimum
      break;
    }
    const before = game.bankrollCents;
    try {
      playRound(game, decide);
    } catch (err) {
      // The engine reshuffles only BETWEEN rounds, so on a small deck (1–2) a
      // rare card-heavy split round can draw past the end of the shoe. Treat that
      // as the shoe boundary: void the partial hand (restore the stake), reshuffle,
      // and play on. Impossible with the default multi-deck shoe — its post-cut
      // buffer dwarfs any single round — so normal runs never take this path.
      if (cardsRemaining(game.shoe) > 0) throw err; // not exhaustion -> a real error
      game.bankrollCents = before;
      reshuffle(game.shoe);
      nextRound(game);
      continue;
    }
    system.settle(game.bankrollCents - before);
    nextRound(game);
    handsPlayed++;
  }

  return {
    netCents: game.bankrollCents - startCents,
    finalCents: game.bankrollCents,
    handsPlayed,
    ruined,
  };
}

/**
 * Run a whole simulation: `sessions` independent sessions of one betting system.
 * @returns summary stats + the raw per-session results, for charting.
 */
export function runSimulation(rules, { system = 'martingale', sessions = 2000, handsPerSession = 100, seed } = {}) {
  const decider = makeDecider(rules); // shared across sessions — warms up once
  const rng = seed != null ? mulberry32(seed) : Math.random;
  const results = [];
  for (let s = 0; s < sessions; s++) {
    results.push(runSession(rules, system, { handsPerSession, rng, decider }));
  }
  return summarize(results, { system, sessions, handsPerSession });
}

function summarize(results, meta) {
  const nets = results.map((r) => r.netCents).sort((a, b) => a - b);
  const n = nets.length || 1;
  const sum = nets.reduce((a, b) => a + b, 0);
  const up = results.filter((r) => r.netCents > 0).length;
  const down = results.filter((r) => r.netCents < 0).length;
  const ruined = results.filter((r) => r.ruined).length;
  return {
    ...meta,
    count: results.length,
    results,
    nets, // sorted ascending — convenient for histograms/percentiles
    meanCents: sum / n,
    medianCents: nets[Math.floor((n - 1) / 2)] ?? 0,
    worstCents: nets[0] ?? 0,
    bestCents: nets[n - 1] ?? 0,
    pctUp: up / n,
    pctDown: down / n,
    pctFlat: (results.length - up - down) / n,
    ruinRate: ruined / n,
  };
}
