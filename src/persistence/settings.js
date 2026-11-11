import { Phase, rebuildShoe, resetBankroll, setBet } from '../engine/game.js';

/** Choices offered in Settings (a value from the config or an older save that
 * isn't listed is still accepted and shown alongside these). */
export const DECK_CHOICES = [1, 2, 4, 6, 8];
export const AMOUNT_CHOICES = [100, 250, 500, 1000, 2500, 5000, 10000];

/** The listed choices plus `current` if it isn't one of them, ascending. */
export function choicesWith(choices, current) {
  return choices.includes(current) ? choices : [...choices, current].sort((a, b) => a - b);
}

/** Whitelist persisted fields and share the same normalized values with the UI. */
export function normalizeSettings(saved, rules, strategies) {
  const input = saved && typeof saved === 'object' ? saved : {};
  const integer = (key, fallback, lo, hi) => Math.max(lo, Math.min(hi,
    Number.isSafeInteger(input[key]) ? input[key] : fallback));
  const bool = (key, fallback) => typeof input[key] === 'boolean' ? input[key] : fallback;
  const startingAmount = integer('startingAmount', rules.table.startingBankroll, 100, 10000);
  return {
    muted: bool('muted', false), softDisplayBothValues: bool('softDisplayBothValues', false),
    showCardCount: bool('showCardCount', true), showStartingAmount: bool('showStartingAmount', false),
    randomCutCard: bool('randomCutCard', rules.shoe.randomCutCard),
    vibration: bool('vibration', true), keepAwake: bool('keepAwake', true),
    numberOfDecks: integer('numberOfDecks', rules.shoe.numberOfDecks, 1, 8),
    startingAmount, maxBet: integer('maxBet', rules.table.maxBet, 100, startingAmount),
    strategy: strategies.some((s) => s.id === input.strategy) ? input.strategy : 'basic',
  };
}

export function applySettingsToRules(settings, rules) {
  rules.shoe.numberOfDecks = settings.numberOfDecks;
  rules.shoe.randomCutCard = settings.randomCutCard;
  rules.table.startingBankroll = settings.startingAmount;
  rules.table.maxBet = settings.maxBet;
}

/** Deck/bankroll restarts wait for betting, after the prior hand is settled. */
export function applyPendingSettings(game, settings) {
  if (!settings || game.phase !== Phase.Betting) return false;
  const decksChanged = game.rules.shoe.numberOfDecks !== settings.numberOfDecks;
  const startChanged = game.rules.table.startingBankroll !== settings.startingAmount;
  applySettingsToRules(settings, game.rules);
  if (startChanged) resetBankroll(game);
  if (startChanged || decksChanged) rebuildShoe(game);
  setBet(game, game.betCents);
  return startChanged || decksChanged;
}
