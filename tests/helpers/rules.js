/**
 * A baseline rule set for engine tests (mirrors the shipped config defaults),
 * plus a shallow-merge helper to override one or two groups per test.
 */
export const baseRules = {
  shoe: { numberOfDecks: 6, penetration: 0.75, continuousShuffle: false },
  dealer: { hitsSoft17: false, peeksForBlackjack: true },
  payouts: { blackjack: 1.5, insurance: 2.0, regularWin: 1.0 },
  player: {
    doubleAllowed: true,
    doubleRestriction: 'any',
    doubleAfterSplit: true,
    splitAllowed: true,
    maxSplitHands: 4,
    resplitAces: false,
    hitSplitAces: false,
    surrender: 'none',
    insuranceAllowed: false,
  },
  table: { minBet: 5, maxBet: 500, startingBankroll: 500, chipDenominations: [5, 25, 100, 500] },
};

/** Clone baseRules, shallow-merging each overridden group (e.g. { dealer: { hitsSoft17: true } }). */
export function withRules(overrides = {}) {
  const merged = structuredClone(baseRules);
  for (const key of Object.keys(overrides)) {
    merged[key] = { ...merged[key], ...structuredClone(overrides[key]) };
  }
  return merged;
}
