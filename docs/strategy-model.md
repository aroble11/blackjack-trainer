# Strategy calculations

The advisor computes expected returns rather than loading a remembered strategy chart. The engine supplies current legal actions, bankroll constraints, and remaining split capacity to both hints and the simulator.

## One and two decks

`src/teaching/finite-deck.js` enumerates draws without replacement. It removes the active player's cards and the dealer upcard from a fresh configured deck composition. It does not read the actual hidden card, shoe order, or previous rounds. This is composition-dependent basic strategy, not count-based deviation advice.

Stand, hit, and double EVs are exact for that model, to floating-point precision. Dealer H17/S17, double restrictions, DAS, and ordinary-win payout are respected. With an Ace or ten upcard, both dealer and player draws are conditioned on the hole card not completing blackjack after the US peek. For unseen rank count c, unseen pool N, and eligible-hole-card count A, the player draw probability is `(c - c/A)/(N-1)` for a hole-eligible rank and `c/(N-1)` otherwise.

Splitting is explicitly approximate, as approved for this milestone: the solver accounts for card removal within a descendant and shares a limited re-split budget among descendants, but does not enumerate all sibling-hand draw histories or future bankroll-dependent choices. Post-split recommendations likewise use the active hand's composition, not all sibling cards. Split aces follow the supported one-card rule. The hint always discloses the sibling-hand approximation.

Independent test anchors use published numerical EVs, not snapshots of our solver:

- [Wizard of Odds, one-deck S17 expected values](https://wizardofodds.com/games/blackjack/appendix/9/1ds17r4/)
- [Wizard of Odds, two-deck S17 expected values](https://wizardofodds.com/games/blackjack/appendix/9/2ds17r4/)
- [Wizard of Odds, one-deck H17 expected values](https://wizardofodds.com/games/blackjack/appendix/9/1dh17r4/)
- [Wizard of Odds, two-deck H17 expected values](https://wizardofodds.com/games/blackjack/appendix/9/2dh17r4/)

Those references also disclose simplification of sibling-hand histories for their split calculations. Our selected non-split numerical anchors match to the published precision. This is not an exhaustive independent audit of every split EV or every ruleset.

## Three or more decks

The existing infinite-deck draw model is retained, with a shared capped re-split calculation. It follows H17/S17, DAS, surrender and doubling rules, but does not model finite-deck removal effects. The in-app hint labels this approximation. The known A,2 versus 5 close decision remains documented; single-deck composition calculations now resolve it separately.

## Validation and practical limits

Tests cover the original strategy anchors, numerical finite-deck comparisons, dealer probabilities, re-splitting, affordable alternatives, custom-chart fallback codes, and cache isolation when legality changes. Tests are selected anchors and regressions; they are not a complete cell-by-cell certification.

The finite-deck calculation is more expensive than the infinite-deck calculation. Results are memoized. Simulations run in a cancellable worker, so a cold single/double-deck run can take longer without locking the interface. Cross-check your exact table rules before relying on advice. Unsupported engine variants still produce capability warnings.
