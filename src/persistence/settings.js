import { Phase, rebuildShoe, resetBankroll, setBet } from '../engine/game.js';

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
    numberOfDecks: integer('numberOfDecks', rules.shoe.numberOfDecks, 1, 99),
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
