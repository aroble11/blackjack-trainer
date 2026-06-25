/**
 * betting-systems.js — pluggable bet-sizing strategies for the simulator.
 *
 * A system is created fresh per session and tracks its own progression. Each
 * exposes:
 *   bet()        -> the wager (in cents) for the next hand
 *   settle(net)  -> update the progression from a round's net result (cents):
 *                   net < 0 lost, net > 0 won, net === 0 pushed
 *
 * Bets come out already capped at the table maximum (the spec's Martingale
 * ceiling). The simulator clamps further to the bankroll and detects ruin, so
 * systems here stay pure progression logic.
 */

import { toCents } from '../engine/money.js';

/**
 * Martingale: bet the table minimum, double the wager after every losing round,
 * reset to the minimum after a win, and hold the bet on a push. Once a double
 * would exceed the table maximum the bet sticks at the maximum — the progression
 * "breaks" and can no longer fully recover prior losses.
 */
export function martingale({ baseBetCents, tableMaxCents }) {
  let current = baseBetCents;
  return {
    name: 'martingale',
    bet: () => current,
    settle: (net) => {
      if (net < 0) current = Math.min(current * 2, tableMaxCents);
      else if (net > 0) current = baseBetCents;
      // push (net === 0): keep the current bet
    },
  };
}

/** Flat: the same wager every hand, regardless of results — the control. */
export function flat({ baseBetCents }) {
  return {
    name: 'flat',
    bet: () => baseBetCents,
    settle: () => {},
  };
}

export const BETTING_SYSTEMS = {
  martingale: { label: 'Martingale', create: martingale },
  flat: { label: 'Flat', create: flat },
};

/** Build a system instance from the table rules (base = table min, cap = table max). */
export function createSystem(name, rules) {
  const entry = BETTING_SYSTEMS[name];
  if (!entry) throw new Error(`Unknown betting system: ${name}`);
  return entry.create({
    baseBetCents: toCents(rules.table.minBet),
    tableMaxCents: toCents(rules.table.maxBet),
  });
}
