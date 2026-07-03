/**
 * controls.js — wire user input to engine actions.
 *
 * A single delegated click listener on the root element (attached once) drives
 * everything: because each render rebuilds the subtree, delegation avoids
 * re-binding handlers and the double-fire that per-element listeners can cause
 * on mobile. Disabled buttons don't emit clicks, and the engine's own guards
 * (canDeal/canDouble/canSplit/...) are the source of truth — the UI just asks.
 *
 * `options` carries { warnings, settings, persist } from main.js plus a `ui`
 * object this module owns ({ hintShown, deviation }). The first tap unlocks the
 * AudioContext (iOS-safe); sounds then play per action + outcome.
 */

import { render } from './render.js';
import { sound, unlockAudio, setMuted } from '../assets/sound.js';
import {
  Phase,
  activeHand,
  addToBet,
  clearBet,
  canDeal,
  deal,
  hit,
  stand,
  canDouble,
  double,
  canSplit,
  split,
  canSurrender,
  surrender,
  takeInsurance,
  declineInsurance,
  nextRound,
  rebuy,
  resetBankroll,
  deckCountChanged,
  abandonRound,
  rebuildShoe,
} from '../engine/game.js';
import { bestAction } from '../teaching/advisor.js';
import { runSimulation } from '../sim/simulator.js';
import { needsReshuffle } from '../engine/shoe.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function mount(root, game, options = {}) {
  const { persist, settings } = options;
  const ui = (options.ui = options.ui || {
    hintShown: false,
    deviation: null,
    view: 'table',
    settingsShown: false,
    decksOnOpen: null, // deck count snapshotted when settings was last opened
    reshuffling: false,
    sim: { system: 'martingale', sessions: 2000, hands: 100, result: null, running: false },
  });

  // Reshuffle the moment settings closes IF the deck count differs from what it
  // was when settings opened (ui.decksOnOpen) — not from the shoe's current
  // size, which can drift after a mid-hand change. Bumping 6→5→6 and closing
  // nets no change, so nothing fires. A reshuffle can't keep cards that are in
  // play, so if a hand is in progress it's abandoned (the committed stake is
  // forfeited as a loss) before the rebuild. Returns true if it fired (the
  // caller should skip its own render — this one renders itself).
  function reshuffleNowIfChanged() {
    const changed = !!settings && settings.numberOfDecks !== ui.decksOnOpen;
    if (!changed || game.shoe.continuousShuffle) return false;
    ui.reshuffling = true;
    render(root, game, options);
    sound.shuffle();
    setTimeout(() => {
      ui.reshuffling = false;
      if (game.phase !== Phase.Betting) abandonRound(game); // drop any hand in progress
      rebuildShoe(game);
      if (persist) persist();
      render(root, game, options);
      game.justReshuffled = false;
    }, 2000);
    return true;
  }

  root.addEventListener('click', (event) => {
    if (ui.reshuffling) return; // game is paused on the reshuffle announcement
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = el.dataset.action;
    unlockAudio(); // a real user gesture — unlock/resume audio

    // Reveal the hint without disturbing game state.
    if (action === 'hint') {
      ui.hintShown = !ui.hintShown;
      render(root, game, options);
      return;
    }

    if (action === 'toggleMute') {
      if (settings) {
        settings.muted = !settings.muted;
        setMuted(settings.muted);
      }
      if (persist) persist();
      render(root, game, options);
      return;
    }

    if (action === 'openSettings') {
      const wasShown = ui.settingsShown;
      ui.settingsShown = !ui.settingsShown;
      if (!wasShown) {
        ui.decksOnOpen = settings ? settings.numberOfDecks : null; // snapshot on open
      } else if (reshuffleNowIfChanged()) {
        return; // closing via the gear toggle
      }
      render(root, game, options);
      return;
    }
    if (action === 'closeSettings') {
      ui.settingsShown = false;
      if (reshuffleNowIfChanged()) return;
      render(root, game, options);
      return;
    }
    if (action === 'toggleSoftDisplay') {
      if (settings) settings.softDisplayBothValues = !settings.softDisplayBothValues;
      if (persist) persist();
      render(root, game, options);
      return;
    }
    if (action === 'toggleCardCount') {
      if (settings) settings.showCardCount = !settings.showCardCount;
      if (persist) persist();
      render(root, game, options);
      return;
    }
    if (action === 'decksUp' || action === 'decksDown') {
      if (settings) {
        const next = clamp(settings.numberOfDecks + (action === 'decksUp' ? 1 : -1), 1, 99);
        settings.numberOfDecks = next;
        game.rules.shoe.numberOfDecks = next; // live reference — rulesChip() picks it up immediately
      }
      if (persist) persist();
      render(root, game, options);
      return;
    }
    // Unlike deck count, the max bet doesn't shape the shoe, so it can just take
    // effect immediately — no reshuffle-on-close dance needed. It only ever
    // widens/narrows what setBet() clamps future bets to (game.js:85); it never
    // touches a bet already placed.
    if (action === 'maxBetUp' || action === 'maxBetDown') {
      if (settings) {
        const next = clamp(settings.maxBet + (action === 'maxBetUp' ? 100 : -100), 100, 10000);
        settings.maxBet = next;
        game.rules.table.maxBet = next; // live reference
      }
      if (persist) persist();
      render(root, game, options);
      return;
    }

    // ── betting simulator (UI-only state; never touches the live game) ────────
    if (action === 'openSim') { ui.view = 'sim'; render(root, game, options); return; }
    if (action === 'closeSim') { ui.view = 'table'; render(root, game, options); return; }
    if (action === 'simSystem') { ui.sim.system = el.dataset.value; render(root, game, options); return; }
    if (action === 'simSessions') { ui.sim.sessions = Number(el.dataset.value); render(root, game, options); return; }
    if (action === 'simHands') { ui.sim.hands = Number(el.dataset.value); render(root, game, options); return; }
    if (action === 'runSim') {
      if (ui.sim.running) return;
      ui.sim.running = true;
      render(root, game, options); // paint the "Running…" state first
      // Defer the blocking run so the spinner paints before the main thread locks.
      setTimeout(() => {
        try {
          ui.sim.result = runSimulation(game.rules, {
            system: ui.sim.system,
            sessions: ui.sim.sessions,
            handsPerSession: ui.sim.hands,
          });
        } finally {
          ui.sim.running = false;
          render(root, game, options);
        }
      }, 24);
      return;
    }

    // A fresh action clears the previous hint reveal + deviation note.
    ui.hintShown = false;
    ui.deviation = null;

    // Dealing into a depleted shoe (or a shoe whose deck count no longer matches
    // the configured setting, e.g. changed mid-hand and not yet applied): pause
    // on a "RESHUFFLE" announcement + the shuffle sound for 2s before actually
    // dealing, instead of an instant cut.
    if (
      action === 'deal' &&
      canDeal(game) &&
      (needsReshuffle(game.shoe) || deckCountChanged(game)) &&
      !game.shoe.continuousShuffle
    ) {
      ui.reshuffling = true;
      render(root, game, options);
      sound.shuffle();
      setTimeout(() => {
        ui.reshuffling = false;
        deal(game);
        sound.deal();
        if (persist) persist();
        render(root, game, options);
        game.justReshuffled = false;
      }, 2000);
      return;
    }

    // For deviation warnings, capture the recommended move BEFORE applying it.
    const recommended = recommendedMove(game, action);

    apply(game, action, el.dataset.value);
    playSound(game, action);

    if (recommended && recommended !== action) ui.deviation = recommended;

    if (persist) persist();
    render(root, game, options);
    game.justReshuffled = false; // one-shot: the shuffle cue shows for a single render
  });

  render(root, game, options);
}

const DECISIONS = ['hit', 'stand', 'double', 'split', 'surrender'];

/** The basic-strategy move for the current decision, or null if not applicable. */
function recommendedMove(game, action) {
  if (!DECISIONS.includes(action)) return null;
  if (!game.rules.teaching?.warnOnStrategyDeviation) return null;
  if (game.phase !== Phase.PlayerTurn) return null;
  const hand = activeHand(game);
  if (!hand || !game.dealerCards[0]) return null;
  const best = bestAction(hand.cards, game.dealerCards[0], game.rules, { fromSplit: hand.fromSplit }).action;
  // The advisor recommends by EV alone (it ignores bankroll/limits). Don't flag a
  // "deviation" toward a move the player can't actually make here — e.g. it says
  // double/split but the bankroll or re-split cap forbids it. hit/stand are always
  // available during the player's turn, so only the optional moves need this check.
  if (best === 'double' && !canDouble(game)) return null;
  if (best === 'split' && !canSplit(game)) return null;
  if (best === 'surrender' && !canSurrender(game)) return null;
  return best;
}

function apply(game, action, value) {
  switch (action) {
    case 'chip':
      addToBet(game, Number(value));
      break;
    case 'clearBet':
      clearBet(game);
      break;
    case 'deal':
      if (canDeal(game)) deal(game);
      break;
    case 'hit':
      hit(game);
      break;
    case 'stand':
      stand(game);
      break;
    case 'double':
      if (canDouble(game)) double(game);
      break;
    case 'split':
      if (canSplit(game)) split(game);
      break;
    case 'surrender':
      if (canSurrender(game)) surrender(game);
      break;
    case 'takeInsurance':
      takeInsurance(game);
      break;
    case 'declineInsurance':
      declineInsurance(game);
      break;
    case 'next':
      nextRound(game);
      break;
    case 'rebuy':
      rebuy(game);
      break;
    case 'reset':
      resetBankroll(game);
      break;
  }
}

function playSound(game, action) {
  if (['chip', 'clearBet', 'takeInsurance', 'declineInsurance'].includes(action)) {
    sound.chip();
  } else if (action === 'deal') {
    if (game.justReshuffled) sound.shuffle();
    sound.deal();
  } else if (action === 'hit' || action === 'double' || action === 'split') {
    sound.deal();
  }
  if (game.phase === Phase.RoundOver) {
    sound[roundOutcome(game)]?.();
  }
}

function roundOutcome(game) {
  const outcomes = game.playerHands.map((h) => h.outcome);
  if (outcomes.some((o) => o === 'win' || o === 'blackjack')) return 'win';
  if (outcomes.length && outcomes.every((o) => o === 'lose' || o === 'surrender')) return 'lose';
  return 'push';
}
