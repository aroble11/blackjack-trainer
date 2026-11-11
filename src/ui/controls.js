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
  decisionContext,
  setBet,
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
} from '../engine/game.js';
import { recommend } from '../teaching/strategies.js';
import { applyPendingSettings } from '../persistence/settings.js';
import { needsReshuffle, setRandomCutCard } from '../engine/shoe.js';
import { formatMoney } from '../engine/money.js';
import { needsReveal } from './dealer-reveal.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function mount(root, game, options = {}) {
  const { persist, settings } = options;
  const ui = (options.ui = options.ui || {
    hintShown: false,
    deviation: null,
    view: 'table',
    settingsShown: false,
    reshuffling: false,
    reshuffleMessage: 'RESHUFFLE', // overlay text for the on-close restart pause
    sim: { system: 'martingale', sessions: 2000, hands: 100, result: null, running: false },
  });

  let worker = null;
  function stopSimulation() {
    worker?.terminate();
    worker = null;
    ui.sim.running = false;
  }
  function closeSettings() {
    ui.settingsShown = false;
    applyPendingSettings(game, settings);
    persist?.();
    render(root, game, options);
    root.querySelector('[data-action="openSettings"]')?.focus();
  }
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && ui.settingsShown) { event.preventDefault(); closeSettings(); }
    if (event.key === 'Tab' && ui.settingsShown) {
      const buttons = [...root.querySelectorAll('.settings-panel button:not(:disabled), .settings-panel select:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
    }
  });

  root.addEventListener('click', (event) => {
    if (ui.reshuffling || ui.reveal != null || options.pwa?.updating) return;
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = el.dataset.action;
    unlockAudio(); // a real user gesture — unlock/resume audio

    if (action === 'installUpdate') {
      if (game.phase !== Phase.Betting && game.phase !== Phase.RoundOver) return;
      options.pwa.updating = true;
      render(root, game, options);
      Promise.resolve(persist?.()).then(() => {
        if (game.phase === Phase.Betting || game.phase === Phase.RoundOver) return options.pwa?.update?.();
      }).catch(() => { options.pwa.updating = false; options.pwa.error = true; render(root, game, options); });
      return;
    }
    if (action === 'checkUpdate') { options.pwa?.check?.(); return; }
    // Reset bankroll is destructive, so ↺ only opens a confirm bar; the bar's
    // own "Reset" button (data-action="reset") does the reset below.
    if (action === 'askReset' || action === 'cancelReset') {
      ui.confirmReset = action === 'askReset' ? !ui.confirmReset : false;
      render(root, game, options);
      return;
    }
    ui.confirmReset = false;
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
      if (ui.settingsShown) closeSettings();
      else {
        ui.settingsShown = true;
        render(root, game, options);
        root.querySelector('.settings-panel button')?.focus();
      }
      return;
    }
    if (action === 'closeSettings') { closeSettings(); return; }
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
    if (action === 'toggleShowStartAmount') {
      if (settings) settings.showStartingAmount = !settings.showStartingAmount;
      if (persist) persist();
      render(root, game, options);
      return;
    }
    // Cut card: purely changes WHERE the shoe reshuffles — it never touches the
    // bankroll, and the reshuffle itself (with its RESHUFFLE pause + count reset)
    // still fires naturally on the next Deal via needsReshuffle(). Applying it to
    // the current shoe re-picks the cut position immediately.
    if (action === 'toggleCutCard') {
      if (settings) {
        settings.randomCutCard = !settings.randomCutCard;
        game.rules.shoe.randomCutCard = settings.randomCutCard; // live reference
        setRandomCutCard(game.shoe, settings.randomCutCard); // apply to the shoe in play
      }
      if (persist) persist();
      render(root, game, options);
      return;
    }
    if (action === 'decksUp' || action === 'decksDown') {
      if (settings) {
        const next = clamp(settings.numberOfDecks + (action === 'decksUp' ? 1 : -1), 1, 99);
        settings.numberOfDecks = next;
        // Applied after the current round, when betting resumes.
      }
      if (persist) persist();
      render(root, game, options);
      return;
    }
    // Clamp only pending bets; committed stakes are preserved.
    if (action === 'maxBetUp' || action === 'maxBetDown') {
      if (settings) {
        const next = clamp(settings.maxBet + (action === 'maxBetUp' ? 50 : -50), 100, settings.startingAmount);
        settings.maxBet = next;
        game.rules.table.maxBet = next;
        setBet(game, game.betCents);
      }
      if (persist) persist();
      render(root, game, options);
      return;
    }
    // Defer bankroll restarts until betting resumes after settlement.
    if (action === 'startAmountUp' || action === 'startAmountDown') {
      if (settings) {
        const next = clamp(settings.startingAmount + (action === 'startAmountUp' ? 50 : -50), 100, 10000);
        settings.startingAmount = next;
        // Starting bankroll resets only after the current round is settled.
        if (settings.maxBet > next) {
          settings.maxBet = next;
          game.rules.table.maxBet = next;
          setBet(game, game.betCents);
        }
      }
      if (persist) persist();
      render(root, game, options);
      return;
    }

    // ── betting simulator (UI-only state; never touches the live game) ────────
    if (action === 'openSim') { ui.view = 'sim'; render(root, game, options); return; }
    if (action === 'closeSim') { stopSimulation(); ui.view = 'table'; render(root, game, options); return; }
    if (['simSystem', 'simSessions', 'simHands'].includes(action)) {
      stopSimulation();
      ui.sim[{ simSystem: 'system', simSessions: 'sessions', simHands: 'hands' }[action]] =
        action === 'simSystem' ? el.dataset.value : Number(el.dataset.value);
      ui.sim.result = null;
      ui.sim.error = null;
      render(root, game, options);
      return;
    }
    if (action === 'cancelSim') { stopSimulation(); render(root, game, options); return; }
    if (action === 'runSim') {
      if (ui.sim.running) return;
      ui.sim.running = true;
      ui.sim.progress = 0;
      ui.sim.result = null;
      ui.sim.error = null;
      render(root, game, options);
      try {
        const current = worker = new Worker(new URL('../sim/worker.js', import.meta.url), { type: 'module' });
        const fail = () => {
          if (worker !== current) return;
          stopSimulation();
          ui.sim.error = 'Simulation could not finish. Please try again.';
          render(root, game, options);
        };
        current.onerror = fail;
        current.onmessage = ({ data }) => {
          if (worker !== current) return;
          if (data.type === 'progress') ui.sim.progress = data.completed;
          else if (data.type === 'result') { ui.sim.result = data.result; stopSimulation(); }
          else { fail(); return; }
          render(root, game, options);
        };
        current.postMessage({ rules: structuredClone(game.rules), options: {
          system: ui.sim.system, sessions: ui.sim.sessions, handsPerSession: ui.sim.hands,
        } });
      } catch {
        stopSimulation();
        ui.sim.error = 'This browser could not start the simulation worker.';
        render(root, game, options);
      }
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
        const phaseBefore = game.phase;
        deal(game);
        if (game.phase === Phase.Betting) applyPendingSettings(game, settings);
        sound.deal();
        if (persist) persist();
        showResult('deal', phaseBefore);
      }, 2000);
      return;
    }

    // For deviation warnings, capture the recommended move BEFORE applying it.
    const recommended = recommendedMove(game, action, settings);
    const phaseBefore = game.phase;

    apply(game, action, el.dataset.value);
    if (game.phase === Phase.Betting) applyPendingSettings(game, settings);
    actionSound(game, action);

    if (recommended && recommended !== action) ui.deviation = recommended;

    if (persist) persist();
    showResult(action, phaseBefore);
  });

  /**
   * Draw the state after an action. When the action ended the round, the
   * engine has already played the dealer and settled — instantly. Rather than
   * showing all of that at once, step through it: the hole card flips, then
   * each dealer draw lands one at a time, and only then the result (overlay,
   * badges, bankroll, count, sound, screen-reader announcement). Taps are
   * ignored while `ui.reveal` is set. Skipped under prefers-reduced-motion.
   */
  function showResult(action, phaseBefore) {
    const roundJustEnded = game.phase === Phase.RoundOver && phaseBefore !== Phase.RoundOver;
    if (roundJustEnded && needsReveal(game) && !prefersReducedMotion()) {
      const total = game.dealerCards.length;
      ui.reveal = 1; // upcard only; the hole is still face down
      render(root, game, options);
      game.justReshuffled = false;
      const step = () => {
        if (ui.reveal < total) {
          ui.reveal += 1;
          sound.deal?.();
          render(root, game, options);
          setTimeout(step, ui.reveal < total ? REVEAL.step : REVEAL.result);
          return;
        }
        ui.reveal = null;
        render(root, game, options);
        outcomeSound(game);
        announce(roundSummary(game));
      };
      // After a deal, let the dealt cards land before turning the hole card.
      setTimeout(step, action === 'deal' ? REVEAL.afterDeal : REVEAL.first);
      return;
    }
    render(root, game, options);
    if (roundJustEnded) {
      outcomeSound(game);
      announce(roundSummary(game));
    }
    game.justReshuffled = false; // one-shot: the shuffle cue shows for a single render
  }

  // The strategy dropdown is the one control that fires `change`, not click —
  // a single delegated listener, mirroring the click one above.
  root.addEventListener('change', (event) => {
    if (options.pwa?.updating) return;
    const el = event.target.closest('[data-action="selectStrategy"]');
    if (!el) return;
    if (settings) settings.strategy = el.value;
    if (persist) persist();
    render(root, game, options);
  });

  render(root, game, options);
  return { refresh: () => render(root, game, options) };
}

const DECISIONS = ['hit', 'stand', 'double', 'split', 'surrender'];

/** The selected hint strategy's move for the current decision, or null if not applicable. */
function recommendedMove(game, action, settings) {
  if (!DECISIONS.includes(action)) return null;
  if (!game.rules.teaching?.warnOnStrategyDeviation) return null;
  if (game.phase !== Phase.PlayerTurn) return null;
  const hand = activeHand(game);
  if (!hand || !game.dealerCards[0]) return null;
  // Deviation warnings follow whichever strategy the user selected in Settings.
  const best = recommend(settings?.strategy ?? 'basic', hand.cards, game.dealerCards[0], game.rules, decisionContext(game)).action;
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

/** Timing (ms) of the staged dealer reveal. */
const REVEAL = {
  first: 450, // stand/double/bust → hole card flips
  afterDeal: 900, // a natural on the deal: let the dealt cards land first
  step: 600, // between dealer cards
  result: 450, // last dealer card → result
};

function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The sound for the action itself (chip click, card flick). */
function actionSound(game, action) {
  if (['chip', 'clearBet', 'takeInsurance', 'declineInsurance'].includes(action)) {
    sound.chip();
  } else if (action === 'deal') {
    if (game.justReshuffled) sound.shuffle();
    sound.deal();
  } else if (action === 'hit' || action === 'double' || action === 'split') {
    sound.deal();
  }
}

/** The win/lose/push sting, played once the result is on screen. */
function outcomeSound(game) {
  sound[roundOutcome(game)]?.();
}

/**
 * Speak a short message through the persistent #sr-status live region (outside
 * #app, so it survives re-renders). No-op when the region isn't on the page.
 */
function announce(text) {
  const region = typeof document !== 'undefined' ? document.getElementById('sr-status') : null;
  if (!region) return;
  region.textContent = '';
  setTimeout(() => { region.textContent = text; }, 50); // clear first so repeats re-announce
}

/** One-line spoken round result, from the engine's settled figures. */
function roundSummary(game) {
  const insuranceNet = (game.insuranceReturnCents ?? 0) - (game.insuranceCents ?? 0);
  const net = game.playerHands.reduce((s, h) => s + (h.returnCents - h.stakeCents), 0) + insuranceNet;
  const result = net > 0 ? `You won ${formatMoney(net)}` : net < 0 ? `You lost ${formatMoney(-net)}` : 'Push';
  return `${result}. Bankroll ${formatMoney(game.bankrollCents)}.`;
}

function roundOutcome(game) {
  const outcomes = game.playerHands.map((h) => h.outcome);
  if (outcomes.some((o) => o === 'win' || o === 'blackjack')) return 'win';
  if (outcomes.length && outcomes.every((o) => o === 'lose' || o === 'surrender')) return 'lose';
  return 'push';
}
