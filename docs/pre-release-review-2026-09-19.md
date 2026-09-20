# Blackjack app review — September 19, 2026

**Implementation status, September 20:** all five findings and the listed milestone improvements are addressed. The user approved exact single/double-deck stand/hit/double calculations with disclosed split approximations. See [completed milestone and verification](pre-release-milestone-2026-09-20.md). The review below records the original findings; its line numbers and baseline test counts describe the code before these fixes.

The app is substantially built, but I recommend a focused correctness milestone before Phase 6. Keep the existing architecture and visual direction. The highest-value work is aligning the teaching layer with legal game actions and making every exposed deck setting safe.

## What was verified

- Read the specification, README, config, engine, advisor, simulator, persistence, controls, and rendering code, including the existing uncommitted UI changes.
- `npm test`: **180 tests passed across 17 files**.
- `npm run build`: passed; generated manifest, service worker, and nine precache entries, approximately 65.73 KiB.
- Opened the production build in the Codex browser and exercised betting, dealing, hints, standing, round results, settings, and a 2,000-session simulator run. Inspected a 390 × 844 viewport.
- Used deterministic Node reproductions for the findings below. No app source files were changed. Existing uncommitted edits were preserved.
- This was not a complete strategy-chart audit, dependency/security audit, or real-device validation. Successful PWA generation does not establish installability or offline operation on Android/iOS. Those remain Phase 6 work.

## Fix before shipping

### 1. High: two-deck play can exhaust the shoe and leave the round unfinished

`src/engine/shoe.js:95–105` applies a minimum remaining-card buffer only to single-deck games. Two decks at the shipped 90% penetration can start a round without enough cards to finish it. `draw()` then throws, and live controls have no recovery path.

Reproduction: use the shipped rules with two decks, `mulberry32(3)`, reset available bankroll to $500 before each round, bet $5, decline insurance, split whenever legal, otherwise hit below 17 and stand. On zero-based round 46, the shoe starts at position 89 with cut index 93, reaches position 104, and throws `Shoe exhausted` in `dealerTurn`. These are legal player actions; optimal play is not required to trigger the defect.

Recommendation: give all supported shoe sizes a defensible reserve and add an explicit, bankroll-safe exhaustion policy shared by live play and simulation. Test both the reserve and recovery behavior. The simulator currently voids exhausted rounds, which also needs to be accounted for when reporting completed hands.

### 2. High: hints and simulation exclude legal re-splits

`src/teaching/advisor.js:40` and `src/teaching/strategies.js:128` require `!fromSplit` before considering a split. The game permits further splits up to the configured cap.

Reproduction: stack `8S, 6H, 8D, 10C, 8H, 4D`, bet $5, deal, and split. The left hand is another pair of eights; `canSplit()` is true, but the advisor recommends **Stand** and supplies no split EV. The simulator uses the same advisor, so it never re-splits. Deviation warnings can also penalize a correct re-split.

Recommendation: pass relevant hand count and legality context through the advisor, custom-chart interpreter, hint UI, and simulator. Model the remaining split allowance and add regression cases. The external mathematical reference explicitly includes re-splitting in its assumptions: [Wizard of Odds expected returns](https://wizardofodds.com/games/blackjack/expected-return-infinite-deck/).

### 3. High: hints can recommend actions the player cannot take

`src/ui/render.js:306` renders the recommendation without filtering it through the engine's legality helpers. Controls suppress some deviation warnings, but that does not correct the displayed hint.

Reproduction: with the shipped $500 bankroll, wager $500 and stack `5S, 9H, 6D, 8C`. The remaining bankroll is zero, Double is disabled, and the rendered hint still says **Double**.

Recommendation: select the best currently legal action. If useful for teaching, show the unconstrained ideal separately with a clear explanation of why it is unavailable. Apply the same behavior to custom strategy fallback codes.

### 4. Medium: lowering the maximum bet does not invalidate a pending larger bet

`src/ui/controls.js:182` changes the limit without adjusting the pending wager. `src/engine/game.js:100` checks the minimum and bankroll but omits the current maximum.

Reproduction: place $500 while betting, lower the maximum to $100, and `canDeal()` still returns true for the $500 wager.

Recommendation: enforce the maximum in `canDeal()` and clamp a pending bet when its limit changes. Do not retroactively change stakes already committed to a round.

### 5. Medium: the simulator undercounts ruin and can mislabel old results

`src/sim/simulator.js:123–148` marks ruin only when the next round cannot be dealt. Bankruptcy on the final requested round is therefore missed. A one-hand flat-bet session with $5 starting bankroll and `mulberry32(1)` ends at $0 but reports `ruined: false`.

Separately, changing simulator options leaves the previous chart displayed without identifying its original system. Verified in the browser: after a Martingale run, selecting Flat leaves all previous figures visible. The result caption also reads the current live bankroll setting rather than a rules snapshot from the run.

Recommendation: compute ruin from the final bankroll too; retain the full run configuration with each result and clearly label it, or clear results when inputs change. Add regressions for the final-hand boundary and stale results.

## Improvements worth including in that milestone

- **Make strategy accuracy explicit.** Deck count is adjustable from 1 to 99, but `probabilities.js` always uses infinite-deck probabilities. The README acknowledges the approximation, while the in-app wording says “Computed from your rules.” Surface the deck-count limitation clearly. For exact single/double-deck teaching, implement and independently validate the appropriate model. Existing strategy tests are selected anchors, not a complete cell-by-cell chart comparison; expand them and correct the documentation's claim.
- **Handle settings changes between hands.** Changing deck count mid-round currently forfeits committed chips when Settings closes. This is deliberate in the code, but the panel does not explain the consequence. Prefer applying deck changes after settlement, or clearly present the restart consequence before the change takes effect.
- **Keep simulations responsive.** The largest exposed run (5,000 sessions × 200 hands) took approximately 1.42 seconds in desktop Node. The browser performs this work synchronously after a short timeout; the timeout does not make the computation nonblocking. Move it to a worker or bounded batches, with progress and cancellation. Phone timing was not measured.
- **Finish mobile and accessibility polish.** The phone-sized hint screenshot showed scrollbars; a DOM measurement in that state reported 448px scroll width for a 375px client width. Investigate overflow across hint, multi-hand, and settings states before declaring mobile layout complete. Settings switches appeared without accessible names in the browser tree; associate them with their labels. Preserve focus when rebuilding the UI and support keyboard dismissal of Settings. Real-device checks remain necessary.
- **Normalize persisted settings consistently.** `main.js` clamps some values into `RULES` without consistently replacing the corresponding `settings` values. Normalize once and use those validated values for both rendering and gameplay; test malformed and stale records.
- **Refresh documentation and release guidance.** Document the added settings/custom strategies and correct the Node requirement. The README says Node 18+, but [Vite's official requirements](https://vite.dev/guide/) are Node 20.19+ or 22.12+. Add a visible offline-ready state and a tested update flow during Phase 6, following the [PWA plugin's documented behavior](https://vite-pwa-org.netlify.app/guide/auto-update).

## Suggested scope decision

Make the next milestone a correctness pass covering the five numbered findings, with regression tests and browser checks. Then decide whether the clearly disclosed infinite-deck teaching approximation is acceptable for the initial release. Avoid expanding features until these are resolved; proceed to HTTPS hosting and real Android/iPhone install/offline validation afterward.
