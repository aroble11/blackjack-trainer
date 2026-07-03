# Blackjack Trainer — Features

## App Overview

Blackjack Trainer is an **offline practice app for blackjack**, built to be installed like a native app on a phone (a "PWA" — it works without an internet connection once installed). There's no sign-up, no account, and no real money — it's a single-player game played with virtual chips against a computer dealer. Beyond just letting you play hands, it's built as a *teaching* tool: it can show you the mathematically best move for any hand (and explain why), display a live "card count" the way a professional counter would track the deck, and run thousands of simulated betting sessions to show whether a betting strategy (like always doubling your bet after a loss) actually works out in the long run. Everything — the rules, the look, the math — comes from one settings file, so the same app can be configured to match different casinos' house rules.

---

## Core Gameplay

### Place a Bet
- **Purpose:** Choose how much to wager before a hand is dealt.
- **User role:** Single local player (no accounts/roles).
- **Triggering action:** Tap a chip in the betting tray.
- **Screen/component:** Betting controls — [render.js:255-263](src/ui/render.js), wired in [controls.js:233-235](src/ui/controls.js).
- **Data used/changed:** `game.betCents`, clamped to between $0 and the lesser of the table maximum and the current bankroll ([game.js:83-92](src/engine/game.js)).
- **Expected result:** The bet stack on screen grows and a chip sound plays. A chip already disabled if the bankroll can't cover it.
- **Related features:** Clear Bet, Deal, Re-buy When Broke.

### Clear Bet
- **Purpose:** Reset the current wager to zero before dealing.
- **Triggering action:** Tap "Clear".
- **Screen/component:** [render.js:269](src/ui/render.js); [game.js:94-97](src/engine/game.js).
- **Data used/changed:** `game.betCents` → 0.
- **Expected result:** Bet stack disappears.

### Deal
- **Purpose:** Start a hand once a bet is placed.
- **Triggering action:** Tap "Deal" (only enabled once the bet is at least the table minimum and no more than the bankroll).
- **Screen/component:** [render.js:270](src/ui/render.js); legality from `canDeal()` [game.js:99-105](src/engine/game.js); dealing logic [game.js:131-159](src/engine/game.js).
- **Data used/changed:** `game.bankrollCents` (stake deducted), `game.playerHands`, `game.dealerCards`, `shoe.seenCards`.
- **Expected result:** Cards are dealt in the order player, dealer-up, player, dealer-hole, with a dealing animation; the game moves into the Insurance prompt, the player's turn, or straight to a round result if someone has blackjack.
- **Related features:** Dealer Peek & Blackjack Check, Insurance, Reshuffle Announcement.
- **Notes:** If the shoe has reached its reshuffle point, or the deck count was changed in Settings, dealing first pauses on a 2-second "RESHUFFLE" announcement.

### Dealer Peek & Blackjack Check
- **Purpose:** Resolve an immediate dealer or player blackjack before any player decisions, matching real US-table rules.
- **Triggering action:** Happens automatically right after dealing.
- **Screen/component:** `resolvePeekAndNaturals()` [game.js:193-217](src/engine/game.js).
- **Data used/changed:** `hand.outcome`, `game.bankrollCents` (insurance payout if applicable).
- **Expected result:** If the dealer's up-card is an Ace or a ten-value card, the dealer peeks at the hole card. A dealer or player blackjack ends the round immediately (no further play, no dealer draw); insurance (if taken) pays 2:1 on a dealer blackjack.
- **Related features:** Round Outcome / Settlement, Insurance.

### Insurance
- **Purpose:** A side bet that protects against a dealer blackjack when the up-card is an Ace.
- **Triggering action:** Tap "Insure $X" or "No" when prompted.
- **Screen/component:** [render.js:275-282](src/ui/render.js); [game.js:165-191](src/engine/game.js).
- **Data used/changed:** `game.insuranceCents`, `game.bankrollCents`.
- **Expected result:** Offered only when the dealer shows an Ace, insurance is enabled in the rules, and the bankroll covers half the original bet. Declining or accepting both proceed straight to the blackjack check.

### Hit
- **Purpose:** Take one more card on the current hand.
- **Triggering action:** Tap "Hit" (enabled only while the hand's total is under 21).
- **Screen/component:** Action row [render.js:284-296](src/ui/render.js); legality `canHit()` and logic `hit()` [game.js:349-353, 220-229](src/engine/game.js).
- **Data used/changed:** Active hand's `cards`, `shoe.seenCards`.
- **Expected result:** A new card animates in; if the new total reaches 21 or busts, the hand auto-completes and play moves to the next hand or the dealer.

### Stand
- **Purpose:** End your turn on the current hand without drawing.
- **Triggering action:** Tap "Stand".
- **Screen/component:** [game.js:355-359, 231-235](src/engine/game.js).
- **Expected result:** Moves to the next unfinished hand (after a split), or — once every hand is finished — to the dealer's turn and round settlement.
- **Related features:** Round Outcome / Settlement.

### Double Down
- **Purpose:** Double the wager in exchange for exactly one more card, then automatically stand.
- **Triggering action:** Tap "Double" (only enabled on the original two cards, within the configured double restriction, with enough bankroll to match the stake).
- **Screen/component:** [render.js:290](src/ui/render.js); `canDouble()`/`double()` [game.js:361-371, 237-247](src/engine/game.js).
- **Data used/changed:** Active hand's `stakeCents` (doubled), `game.bankrollCents`.
- **Expected result:** Stake visibly doubles, one new card is dealt, and the hand moves on automatically.
- **Notes:** The restriction (e.g. "only on a hard 9–11") applies only to hard totals — a soft hand never qualifies under a restricted ruleset.

### Split
- **Purpose:** Split a pair into two separate hands, each played out independently.
- **Triggering action:** Tap "Split" (only enabled on a starting pair, under the configured re-split cap, with enough bankroll for a second matching stake).
- **Screen/component:** [render.js:289](src/ui/render.js); `canSplit()`/`split()` [game.js:373-384, 406-433](src/engine/game.js).
- **Data used/changed:** `game.playerHands` (a sibling hand inserted), `game.bankrollCents`.
- **Expected result:** The two cards separate into two hand areas, each gets one new card, and play continues on the left hand first.
- **Notes:** Splitting Aces deals exactly one card to each new hand and stands it immediately — by design, the app doesn't support hitting or re-splitting Aces. A 21 made from a split hand does **not** count as a blackjack (it pays even money, not 3:2/6:5).

### Surrender (Late)
- **Purpose:** Forfeit half the bet to end a bad hand immediately instead of playing it out.
- **Triggering action:** Tap the 🏳️ flag button — shown only as the very first decision on the original two-card hand (not after a split or any other action).
- **Screen/component:** [render.js:183-185, 293](src/ui/render.js); `canSurrender()`/`surrender()` [game.js:386-393, 249-265](src/engine/game.js).
- **Data used/changed:** `hand.outcome`, `game.bankrollCents` (half the stake returned).
- **Expected result:** "SURRENDERED" result overlay; the dealer does not draw.
- **Notes:** Only "late" surrender (after the dealer's peek) is implemented; an "early surrender" rule setting falls back to this with an on-screen warning (see Config Capability Warnings).

### Round Outcome / Settlement
- **Purpose:** Compare each finished hand to the dealer and pay out (or collect) the bankroll.
- **Triggering action:** Happens automatically once all hands and the dealer are done.
- **Screen/component:** `settleRound()` [game.js:299-313](src/engine/game.js); result overlay [render.js:307-327](src/ui/render.js).
- **Data used/changed:** Each hand's `outcome`/`returnCents`; `game.bankrollCents`.
- **Expected result:** A centered overlay reads WON / BLACKJACK! / PUSH / DEALER WINS / SURRENDERED with the net amount; "Next hand" returns to betting.
- **Related features:** Dealer Peek & Blackjack Check, Re-buy When Broke.

### Re-buy When Broke
- **Purpose:** Get back to a playable bankroll after busting out.
- **Triggering action:** Tap "Re-buy $X" — shown automatically once the bankroll drops below the table minimum.
- **Screen/component:** [render.js:248-253](src/ui/render.js); `isBroke()`/`rebuy()` [game.js:327-336](src/engine/game.js).
- **Expected result:** Bankroll resets to the table's configured starting amount.

### Reset Bankroll
- **Purpose:** Manually start a fresh session at the starting bankroll.
- **Triggering action:** Tap ↺ in the top bar (only shown during betting).
- **Screen/component:** [render.js:604](src/ui/render.js); `resetBankroll()` [game.js:340-346](src/engine/game.js).
- **Expected result:** Bankroll and bet both reset to the configured starting value.

---

## Strategy Advisor

### Show Basic-Strategy Hint
- **Purpose:** Reveal the mathematically optimal move for the current hand, with a plain-language reason.
- **Triggering action:** Tap the 💡 lightbulb during your turn.
- **Screen/component:** [render.js:177-180, 214-229](src/ui/render.js); the recommendation itself is computed by `bestAction()` [src/teaching/advisor.js:24-50](src/teaching/advisor.js), explained by `explainAction()` [src/teaching/explain.js](src/teaching/explain.js).
- **Data used/changed:** Read-only — compares the expected value (long-run average outcome) of standing, hitting, doubling, splitting, and surrendering and recommends the highest.
- **Expected result:** A panel shows the recommended move plus a sentence like *"Standing (EV +0.12) beats hitting (−0.30) — the dealer's 6 busts about 42% of the time."*, with a caveat to cross-check an authoritative chart.
- **Notes:** This is **computed live from the configured rules**, not a memorized chart — it adapts automatically if the dealer rules or payout change.
- **Related features:** Deviation Warning.

### Deviation Warning
- **Purpose:** Gently flag when a player's actual move differs from the computed best move.
- **Triggering action:** Happens automatically after hitting/standing/doubling/splitting/surrendering, if this feature is enabled in the rules.
- **Screen/component:** [controls.js:195-201, 211-229](src/ui/controls.js); banner shown at [render.js:612-616](src/ui/render.js).
- **Expected result:** A one-line note: "Basic strategy here was **Stand**." It never blocks or undoes the action — purely informational.

---

## Card Counting Trainer

### Live Hi-Lo Count Readout
- **Purpose:** Show a real-time card count, the way a counter would track the deck at a real table.
- **Triggering action:** Passive — updates as cards are dealt/revealed, while playing with a depleting shoe (not a continuous shuffler) and this feature enabled.
- **Screen/component:** [render.js:389-408](src/ui/render.js); math in [src/teaching/counting.js](src/teaching/counting.js).
- **Data used/changed:** Read-only over `shoe.seenCards`.
- **Expected result:** A bar under the top bar shows the **running count** (color-coded green when it favors the player, red when it favors the house), optionally the **true count** (running count ÷ decks remaining), and decks remaining.
- **Notes:** Hi-Lo tags cards 2–6 as +1, 7–9 as 0, and 10/face/Ace as −1. The dealer's hidden hole card is only counted the moment it's actually flipped face-up, not when it's dealt — exactly what a real player at the table would see. The count resets to zero on every reshuffle. Only the Hi-Lo system is implemented; selecting a different counting system in the rules falls back to Hi-Lo with a warning (see Config Capability Warnings).

---

## Betting Simulator

### Configure & Run a Simulation
- **Purpose:** Test whether a betting progression (like doubling your bet after every loss) actually pays off over many sessions.
- **Triggering action:** Tap 📊 to open the simulator, pick a betting system / number of sessions / hands per session, then tap "Run simulation".
- **Screen/component:** [controls.js:142-165](src/ui/controls.js); [render.js:557-584](src/ui/render.js); the engine is [src/sim/simulator.js](src/sim/simulator.js).
- **Data used/changed:** Doesn't touch the live game at all — it plays thousands of independent, simulated sessions through the same engine that runs the real game.
- **Expected result:** Shows a "Running…" state, then summary stats (mean, median, % of sessions that went bust, best/worst session) and a histogram of the profit/loss spread.
- **Related features:** Betting Systems.

### Betting Systems
- **Purpose:** The strategies available to size each simulated bet.
- **Screen/component:** [src/sim/betting-systems.js](src/sim/betting-systems.js).
- **Data used/changed:** N/A (simulation-only).
- **Expected result:**
  - **Martingale** — bets the table minimum, doubles after every loss, resets to the minimum after a win, holds the bet on a push, and is capped at the table maximum (so a long enough losing streak "breaks" the progression).
  - **Flat** — the control: the same bet every hand regardless of outcome.
- **Notes:** Every simulated hand is played by the same optimal-strategy logic as the Strategy Advisor — the betting system only decides the wager size, never how the hand is played, and card counting is not factored into bet sizing.

---

## Settings

### Toggle Alternate Soft-Value Display
- **Purpose:** Choose how a "soft" hand (one counting an Ace as 11) shows its total.
- **Triggering action:** Flip the "Alternate soft value" switch in Settings.
- **Screen/component:** [render.js:187-198](src/ui/render.js); [controls.js:124-129](src/ui/controls.js).
- **Data used/changed:** `settings.softDisplayBothValues`, saved to IndexedDB immediately.
- **Expected result:** A soft total like a 4 + Ace shows either "14 · soft" or "4 or 14 · soft".

### Adjust Number of Decks
- **Purpose:** Change how many decks are in the shoe.
- **Triggering action:** Tap the ▲/▼ stepper in Settings (range 1–99).
- **Screen/component:** [render.js:199-210](src/ui/render.js); [controls.js:130-139](src/ui/controls.js).
- **Data used/changed:** `settings.numberOfDecks` and the live `game.rules.shoe.numberOfDecks`, saved immediately.
- **Expected result:** The deck count shown in the top bar's rules chip updates instantly. If the count actually changed by the time Settings is closed, any hand currently in progress is **abandoned (the stake is forfeited, not refunded)**, and the app pauses on a "RESHUFFLE" announcement before rebuilding the shoe at the new size ([controls.js:59-81](src/ui/controls.js)).
- **Related features:** Reshuffle Announcement.

### Toggle Cut Card (randomized reshuffle)
- **Purpose:** Simulate a dealer's cut card — reshuffle early at an unpredictable point instead of dealing the shoe to the end.
- **Triggering action:** Flip the "Cut card" switch in Settings.
- **Screen/component:** `renderSettingsPanel()` [render.js](src/ui/render.js); `toggleCutCard` handler [controls.js](src/ui/controls.js); cut math in `pickCutIndex`/`setRandomCutCard` [shoe.js](src/engine/shoe.js).
- **Data used/changed:** `settings.randomCutCard` and the live `game.rules.shoe.randomCutCard`, saved immediately; re-picks the current shoe's `cutIndex`.
- **Expected result:** When on, each shoe's reshuffle point is a random position in the last third (capped at the `penetration` depth so a card buffer always remains). The reshuffle still fires between rounds via the normal Reshuffle Announcement — bankroll unchanged, card count reset. When off, the shoe is dealt deep to the `penetration` point. Grayed out under a continuous shuffler.
- **Related features:** Reshuffle Announcement, Live Hi-Lo Count.

### Mute/Unmute Sound
- **Purpose:** Silence the app's synthesized sound effects.
- **Triggering action:** Tap 🔊/🔇 in the top bar.
- **Screen/component:** [controls.js:97-105](src/ui/controls.js).
- **Data used/changed:** `settings.muted`, saved immediately.

---

## Look & Feel / Feedback

### Synthesized Sound Effects
- **Purpose:** Audio feedback for chips, dealing, shuffling, and round outcomes.
- **Triggering action:** Automatic, on the corresponding action.
- **Screen/component:** [src/assets/sound.js](src/assets/sound.js), triggered from [controls.js:275-294](src/ui/controls.js).
- **Expected result:** Distinct synthesized tones for chip placement, dealing a card, shuffling, winning, losing, and pushing. All sounds are generated in-browser (no audio files) and the audio system unlocks itself on the player's first tap (required for iPhones).

### Shoe Deck Visual
- **Purpose:** A visual sense of how much of the shoe is left to play.
- **Triggering action:** Passive — updates every render based on how many cards remain.
- **Screen/component:** `renderDeckStack()` [render.js:438-501](src/ui/render.js).
- **Expected result:** An angled stack-of-cards graphic in the corner of the table that visibly shrinks as the shoe depletes; hidden entirely under a continuous-shuffle configuration.

### Reshuffle Announcement
- **Purpose:** Make a shoe reshuffle visible and deliberate rather than an invisible cut.
- **Triggering action:** Automatic, when the shoe hits its cut point on Deal (the fixed penetration depth, or a random spot in the last third if the Cut Card setting is on), or when the deck count changes in Settings.
- **Screen/component:** `renderReshuffleOverlay()` [render.js:331-335](src/ui/render.js); pacing in [controls.js:59-81, 175-193](src/ui/controls.js).
- **Expected result:** A 2-second "RESHUFFLE" overlay plus a shuffle sound, during which input is paused, before the new shoe is ready.

### Felt Branding / Rules Chip
- **Purpose:** Show which house rules are in play.
- **Triggering action:** Passive — always visible.
- **Screen/component:** `rulesChip()` / `feltBranding()` [render.js:337-373](src/ui/render.js).
- **Expected result:** A small chip in the top bar (e.g. "6D · S17 · 3:2") and matching curved text "printed" on the felt, both generated live from the configured rules — never hardcoded.

---

## Notices / Error Handling

### Config Capability Warnings
- **Purpose:** Make sure an unsupported rule setting is never silently mis-played.
- **Triggering action:** Automatic, at app startup, based on the active rules.
- **Screen/component:** `validateRules()` [src/engine/validateRules.js](src/engine/validateRules.js); surfaced via `console.warn` in [main.js:11-12](src/main.js) and an on-screen panel [render.js:630-636](src/ui/render.js).
- **Expected result:** If the configuration enables continuous shuffling, European no-peek dealing, early surrender, re-splitting Aces, hitting split Aces, or a counting system other than Hi-Lo, a "Config notes:" panel lists each one and states the documented fallback behavior actually used instead.

### Insufficient-Funds Button Disabling
- **Purpose:** Prevent committing money the player doesn't have.
- **Triggering action:** Automatic — Deal/Double/Split/Insurance become unavailable whenever the bankroll can't cover them.
- **Screen/component:** `canDeal()`, `canDouble()`, `canSplit()`, the insurance offer check [game.js:99-105, 361-371, 373-384, 165-176](src/engine/game.js).
- **Expected result:** The relevant button is simply disabled — there is no separate error message or popup.

### Re-buy When Broke
*(see Core Gameplay above — listed here too since it's also the app's response to an error condition.)*

---

## Needs confirmation
- Whether the unsupported rule options (early surrender, continuous shuffle, European no-peek, re-splitting/hitting split Aces, non-Hi-Lo counting systems) are planned for a future release or are permanently out of scope — the code only labels them "not implemented in Phase 1" without naming a target phase.
