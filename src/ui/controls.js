/**
 * controls.js — wire user input to engine actions.
 *
 * A single delegated click listener on the root element (attached once) drives
 * everything: because each render rebuilds the subtree, delegation avoids
 * re-binding handlers and the double-fire that per-element listeners can cause
 * on mobile. Disabled buttons don't emit clicks, and the engine's own guards
 * (canDeal/canDouble/canSplit/...) are the source of truth — the UI just asks.
 *
 * `options` carries { warnings, settings, persist } from main.js. The first tap
 * unlocks the AudioContext (iOS-safe); sounds then play per action + outcome.
 */

import { render } from './render.js';
import { sound, unlockAudio, setMuted } from '../assets/sound.js';
import {
  Phase,
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
} from '../engine/game.js';

export function mount(root, game, options = {}) {
  const { persist, settings } = options;
  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = el.dataset.action;
    unlockAudio(); // a real user gesture — unlock/resume audio

    if (action === 'toggleMute') {
      if (settings) {
        settings.muted = !settings.muted;
        setMuted(settings.muted);
      }
    } else {
      apply(game, action, el.dataset.value);
      playSound(game, action);
    }

    if (persist) persist();
    render(root, game, options);
    game.justReshuffled = false; // one-shot: the shuffle cue shows for a single render
  });
  render(root, game, options);
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
