/**
 * validateRules — config-capability guard.
 *
 * The config (config/blackjack-rules.config.js) can express rules the Phase 1
 * engine does not implement yet. Rather than silently mis-playing (the worst
 * kind of bug in a teaching app), we check the active rules at startup and
 * return human-readable warnings for anything unsupported. The caller (main.js)
 * logs them and shows a visible note; the engine then falls back to safe,
 * documented behavior.
 *
 * Pure function, no side effects — easy to unit-test.
 *
 * @param {object} rules - the RULES object from the config.
 * @returns {{ warnings: string[] }}
 */
export function validateRules(rules) {
  const warnings = [];
  const shoe = rules?.shoe ?? {};
  const dealer = rules?.dealer ?? {};
  const player = rules?.player ?? {};

  if (shoe.continuousShuffle === true) {
    warnings.push(
      'shoe.continuousShuffle=true: continuous shuffling is not implemented in ' +
        'Phase 1; the shoe will reshuffle at the configured penetration instead.'
    );
  }
  if (dealer.peeksForBlackjack === false) {
    warnings.push(
      'dealer.peeksForBlackjack=false: European/no-hole-card money rules are not ' +
        'implemented in Phase 1; the dealer will peek for blackjack (US style).'
    );
  }
  if (player.surrender === 'early') {
    warnings.push(
      "player.surrender='early': early surrender is not implemented yet; it is " +
        'treated as late surrender (offered after the peek).'
    );
  }
  if (player.resplitAces === true) {
    warnings.push(
      'player.resplitAces=true: re-splitting aces is not implemented in Phase 1; ' +
        'split aces cannot be re-split.'
    );
  }
  if (player.hitSplitAces === true) {
    warnings.push(
      'player.hitSplitAces=true: hitting split aces is not implemented in Phase 1; ' +
        'split aces receive exactly one card each.'
    );
  }

  return { warnings };
}

export default validateRules;
