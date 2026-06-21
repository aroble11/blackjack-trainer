# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An offline, config-driven **blackjack trainer** built as an installable PWA, optimized for mobile. Vanilla JS + ES modules, **Vite** (build/dev), **Vitest** (tests). No backend, no framework.

- The authoritative product brief is [`blackjack-trainer-spec.md`](blackjack-trainer-spec.md) — read it before non-trivial work; it defines the hard constraints, the 6-phase plan, and the correctness rules.
- Current status and how-to are in [`README.md`](README.md). **Phases 1–3 are done** (playable core + surrender/insurance, look & feel, computed basic-strategy advisor). Phases 4 (Hi-Lo counting), 5 (betting simulator), 6 (hosting/real-device install) remain. The spec says build **one phase at a time** and commit at each working milestone.
- **Phase 4 starting point (the current frontier):** a live Hi-Lo running + true count as the shoe depletes. Hi-Lo tags are 2–6 → +1, 7–9 → 0, 10–A → −1; true count = running count ÷ decks remaining (`cardsRemaining(shoe) / 52`, from `shoe.js`), and it's only meaningful when `shoe.continuousShuffle` is false (the default). Subtlety: count cards as the *player sees them* — the dealer's hole card only once it's revealed, not when it's dealt.

## Commands

```bash
npm install
npm test                         # vitest run (all unit tests)
npm run test:watch               # vitest watch mode
npx vitest run tests/game.test.js          # a single test file
npx vitest run -t "double down"            # tests matching a name
npm run dev                      # Vite dev server (http://localhost:5173)
npm run build                    # production build + PWA (manifest, service worker) -> dist/
npm run preview                  # serve the production build (http://localhost:4173)
npm run icons                    # regenerate placeholder PWA icons
```

There is no linter configured. Commit messages end with the `Co-Authored-By` trailer; for multi-line messages prefer `git commit -F <file>` (or several `-m` flags) — PowerShell here-strings choke on the parentheses/quotes these messages tend to contain.

**Node may not be on the shell PATH** (it lives at `C:\Program Files\nodejs`). If `node`/`npm` aren't found, prefix PowerShell commands with `$env:Path = "C:\Program Files\nodejs;$env:Path"`. The Preview MCP server likewise can't find `npm`, so `.claude/launch.json` (git-ignored) points `node.exe` directly at `node_modules/vite/bin/vite.js`; use the Preview MCP for in-browser verification rather than starting servers by hand.

## Architecture

Strict separation of concerns (a spec hard-constraint). Layers, with a **pure engine at the core**:

- **`config/blackjack-rules.config.js` is the single source of truth.** Every blackjack rule lives here; nothing is hardcoded elsewhere. The config is *bundled* at build time, so changing a rule needs a rebuild (dev hot-reloads). `src/engine/validateRules.js` runs a **capability guard** at startup that warns (visibly + console) rather than silently mis-playing when the config enables something not implemented (continuous shuffle, European no-peek, early surrender, re-split/hit aces).

- **`src/engine/` is pure and rules-injected.** Functions take the `rules` object as a parameter (they don't import it), so they're deterministic and testable across rule variants. `game.js` is a state machine over a mutable `game` object through `Phase` betting → insurance → playerTurn → dealerTurn → roundOver. Player hands are an **array with an active index from the start** (a split inserts a sibling at `i+1` and continues on the left hand). **Money is integer cents everywhere** (`money.js`) — never floats; convert only at boundaries. The dealer always peeks (US style); naturals resolve before the player acts.

- **`src/ui/` rebuilds the whole `#app` on every action.** `render.js` regenerates `innerHTML` from game state; `controls.js` attaches **one delegated click listener** keyed on `data-action` attributes (avoids re-binding handlers and mobile double-fire). Two consequences to preserve when editing the UI:
  - The UI must read action legality from the engine's `can*()` helpers (`canHit`/`canDouble`/`canSplit`/`canSurrender`) — never re-derive rules in the UI.
  - Because the subtree is rebuilt each action, animations flag only *newly-dealt* cards (tracked via a `WeakMap` per hand + a dealer counter in `render.js`). UI state that must outlive a render (hint revealed, deviation note) is threaded through an `options.ui` object from `mount` → `render`.

- **`src/assets/` is the swappable skin.** `theme.js` (palette), `svg.js` (programmatic card/chip SVG), `sound.js` (synthesized Web Audio — no audio files; the AudioContext is unlocked on the first tap for iOS, and every audio call is defensively wrapped so it can't break gameplay).

- **`src/persistence/` is a tiny no-dependency IndexedDB key/value store.** Only the bankroll + settings persist, and only at stable points (betting/roundOver) so an interrupted hand is voided, not charged, on reload. Degrades to a no-op if IndexedDB is unavailable.

- **`src/teaching/` COMPUTES basic strategy from the rules — it is not a hardcoded chart.** Pipeline: `dealer-odds.js` (dealer outcome distribution, conditioned on no-blackjack) → `ev.js` (stand/hit/double/split EVs) → `advisor.js` `bestAction()` (highest-EV legal action) → `explain.js` (plain-language why from the computed numbers). **Per spec §6, do not replace this with a strategy table recalled from memory** — teaching a wrong move is the worst bug. It is validated cell-by-cell against canonical anchors in `tests/strategy.test.js`; the infinite-deck model diverges from some charts only on the documented knife-edge cell (A,2 vs 5). Keep the in-app cross-check caveat visible.

## Testing patterns

`tests/` mirrors the source modules. To make scenarios deterministic:
- Pre-stack the shoe: `createGame(rules, { cards: parseCards(['AS','KH', ...]) })`. Deal order consumes the stack as player, dealer-up, player, dealer-hole, then hits/draws.
- Seed shuffles with `tests/helpers/rng.js` (`mulberry32`).
- Build rule variants with `tests/helpers/rules.js` (`withRules({ dealer: { hitsSoft17: true } })`).

The strategy validation is the trust anchor — when changing the teaching engine, the canonical anchors in `tests/strategy.test.js` and the dealer-odds in `tests/dealer-odds.test.js` must stay green.

## Working rhythm

This project has been built to a consistent cadence; matching it keeps a hand-off smooth:
- **Confirm consequential, hard-to-reverse choices first** (stack, graphics approach, strategy-derivation method) by asking the user before building — a spec rule.
- **Build each phase as small, independently-committed sub-milestones**, running `npm test` + `npm run build` at each, and update the README status/roadmap when a phase ships.
- **Verify UI changes by driving the running app through the Preview MCP and sharing screenshots** — don't ask the user to check manually. PWA install/offline is verified **desktop-only** for now (DevTools / Lighthouse on the `preview` build); real on-phone install is Phase 6 and needs HTTPS hosting.
- The user reviews between phases and signals when to proceed to the next one.
