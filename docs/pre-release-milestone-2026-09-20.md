# Pre-release correctness milestone — September 20, 2026

Implemented the five findings and accompanying improvements from the September 19 review, before Phase 6 hosting.

## Changes

- Every shoe has a reserve. Typed exhaustion recovery voids the complete round, refunds all committed stakes, and rebuilds the shoe in both live play and simulation.
- Engine action legality, affordability, and remaining split capacity flow through hints, custom strategy fallbacks, deviation warnings, and simulations. Legal re-splits are included.
- Pending wagers respect the current maximum. Deck and starting-bankroll changes wait until betting resumes after settlement. Persisted settings are normalized once for UI and rules.
- Single/double-deck stand/hit/double EVs enumerate without replacement, conditioned on the US peek. They use the active hand and upcard removed from a fresh deck composition. Previous rounds and sibling cards are not included. Split EVs use the explicitly approved sibling-history approximation. Three or more decks retain the disclosed infinite-deck model. See [model details](strategy-model.md).
- Simulations use a worker with progress and cancellation, count final-hand ruin, report completed hands, retain the run's rules, and clear stale results when inputs change.
- Settings have named switches, keyboard focus restoration, Escape dismissal, and bounded scrolling. Mobile panels avoid horizontal overflow.
- The PWA displays offline readiness and checks for updates. Installation is offered between hands, saves the bankroll before activation, and blocks new actions while the update activates.

## Verification

- `npm test`: 213 tests across 20 files pass. This includes independent published finite-deck numerical anchors for S17/H17, legal-action and exhaustion regressions, deferred settings, simulation reporting, cancellation/stale-worker behavior, and the asynchronous update action guard.
- `npm run build`: production build and service-worker generation pass; 10 precache entries include the simulation worker.
- Browser checks: settings labels, Escape/focus restoration, deferred deck change preserving settlement, finite-deck hint disclosure, all-in affordable advice, four split hands, and no document horizontal overflow in tested 320px and 390px states. Screenshots inspected; this is not real-device certification.
- Browser simulation checks: maximum exposed run completed, finite-deck run cancelled, changing system cleared old results, result caption retained its own configuration.
- Production update check: an update discovered during an active hand remained disabled; after settlement it installed and reloaded with the same bankroll.
- Desktop offline check: stopped the preview server, confirmed the origin was unreachable outside the service worker, then reloaded the cached app, dealt a hand, and completed a 1,000-session × 50-hand worker simulation.

The Preview MCP was unavailable in this session. Browser checks used the Codex in-app browser with the local Vite production preview and deterministic development fixtures in `tests/browser.html`. Those fixtures are excluded from the production bundle.

## Remaining release work

Phase 6 is still pending: choose and configure HTTPS hosting, then verify install, offline behavior, updates, and mobile interaction on a real Android phone and iPhone. Strategy tests are selected numerical anchors and regressions, not an exhaustive independent certification of every decision or ruleset.
