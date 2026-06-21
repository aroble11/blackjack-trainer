# Blackjack Trainer — Project Spec

A handoff brief for building the app with Claude Code. Read this whole file
first, then **propose an architecture and a Phase 1 plan for my approval before
writing any code.**

---

## 1. What I'm building

An **offline blackjack app for personal use that teaches me while I play.**
It is not a gambling app — no real money, just chips. The point is to learn
optimal play and, eventually, to understand betting systems by simulating them.

I want simple, bold graphics (colored felt table, cards, chips) with light
effects like shuffling and chip-stacking, and a few sound effects.

---

## 2. Hard constraints (don't violate these without asking)

- **Offline-first PWA.** No backend, no server-side logic, no account system.
  All gameplay runs on-device and works with no internet connection.
- **Cross-platform.** Must work in **Android Chrome and iOS Safari**, installed
  to the home screen.
- **Config-driven rules.** All blackjack rules live in a single separate config
  file (I already have a draft, `blackjack-rules.config.js`). Game logic reads
  from it; rules are never hardcoded elsewhere.
- **Separation of concerns.** Keep four things in distinct modules:
  game engine (pure logic) · UI/rendering · assets · config.
- **Light stack.** Vanilla JS with Canvas/SVG, or at most one lightweight
  framework. Minimal dependencies. Confirm the stack with me before building.
- **Modifiable later.** I should be able to change rules or swap art by editing
  one place, or by asking you to. Comment the code and keep a short README.

---

## 3. How I want you to work

- **Plan before coding.** Propose the module structure and the Phase 1 scope,
  and wait for my OK.
- **Build one phase at a time.** Finish and verify a phase before starting the
  next. Don't scaffold the whole vision at once.
- **Use git from the first commit.** Commit at each working milestone with clear
  messages so I can roll back.
- **Ask, don't assume,** on any decision that's hard to reverse (stack choice,
  graphics approach, file layout).
- **Don't trust yourself on the strategy table** — see §6.

---

## 4. Suggested architecture (confirm or improve)

- `engine/` — pure blackjack logic: deck/shoe, dealing, hand evaluation,
  player actions, dealer play, payouts. No UI code here. **Unit-tested.**
- `ui/` — rendering and interaction: table, cards, chips, buttons, animations.
- `assets/` — images (or theme modules) and sound files, referenced through a
  single mapping so they're easy to swap.
- `config/` — `blackjack-rules.config.js` and any other settings.
- `persistence/` — save/load via **IndexedDB** (bankroll, stats, settings).
- `teaching/` — strategy advisor, explanations, counting tracker (added later).
- PWA files — `manifest.json` and a service worker for install + offline.

---

## 5. Phased build plan

**Phase 1 — Playable core (MVP).**
A complete, correct game of blackjack with functional but plain graphics:
shoe with a proper (Fisher-Yates) shuffle, dealing, hit/stand/double/split,
dealer play per the config, blackjack/bust/push detection, chip betting, and
bankroll tracking. The engine is unit-tested. No teaching features yet.

**Phase 2 — Look and feel.**
Programmatic/SVG cards, felt table, and chips in bold colors. Shuffle and
chip-stacking animations. Sound effects. **On iOS, audio must be triggered by a
user tap, not autoplay.** Persist bankroll/settings across sessions.

**Phase 3 — Teaching layer.**
A basic-strategy advisor that suggests the optimal move before I act, with a
plain-language explanation of *why*. Toggleable via the config.

**Phase 4 — Odds / counting tracker.**
With a depleting shoe (not a continuous shuffler), show a live Hi-Lo running
count and true count as cards appear.

**Phase 5 — Betting simulator.**
Run a chosen betting system (start with a $5 Martingale) across thousands of
simulated sessions and **chart the distribution of outcomes** — the cluster of
small wins and the rare deep-loss tail. Table max from the config caps the
progression.

**Phase 6 — PWA finalize & ship.**
Manifest, service worker, offline caching. Test the install + offline flow on
both a real Android phone and a real iPhone.

---

## 6. Correctness requirements (this is a teaching app)

- The game **engine must be unit-tested**, covering edge cases: soft hands,
  blackjack vs. a plain 21, split aces (one card each), double-after-split,
  surrender timing, and dealer peek behavior.
- The **basic-strategy table must match the exact ruleset in the config** (it
  changes with H17/S17, deck count, etc.). **Do not generate it from memory and
  assume it's right** — derive it carefully and flag that I should cross-check it
  against an authoritative chart before relying on the hints. Teaching a wrong
  move is the worst possible bug.
- Use a real, unbiased shuffle and keep the shoe state accurate so the counting
  feature reflects reality.

---

## 7. Hosting & install notes

- A PWA's offline/install features need **HTTPS** (localhost is the only
  exception) — opening the file directly won't work. Plan for a free static host
  (GitHub Pages, Netlify, or Cloudflare Pages).
- **iOS install is manual:** Safari → Share → Add to Home Screen. There's no
  auto-prompt, so note the steps somewhere for me (and for the friend I'll share
  it with).

---

## 8. Out of scope

No real-money play, no online/multiplayer, no accounts or backend, no app-store
submission. This stays a personal, sideloaded/installable PWA.

---

## 9. Deliverables per phase

Working code committed to git, any tests for that phase passing, and a short note
in the README explaining what changed and how to modify the common things
(rules, art, sounds).
