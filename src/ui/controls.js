/**
 * controls.js — wire user input to engine actions.
 *
 * A single delegated click listener on the root element (attached once) drives
 * everything: because each render rebuilds the subtree, delegation avoids
 * re-binding handlers and the double-fire that per-element listeners can cause
 * on mobile. Disabled buttons don't emit clicks, and the engine's own guards
 * (canDeal/canDouble/canSplit/...) are the source of truth — the UI just asks.
 *
 * `options` carries { warnings, settings, persist } from main.js; persist() is
 * called after each action to save the bankroll between rounds.
 */

import { render } from './render.js';
import {
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
  const { persist } = options;
  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    apply(game, el.dataset.action, el.dataset.value);
    if (persist) persist();
    render(root, game, options);
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
