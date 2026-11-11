import { Phase, rebuildShoe, resetBankroll, setBet } from '../engine/game.js';

/** Choices offered in Settings (a value from the config or an older save that
 * isn't listed is still accepted and shown alongside these). */
export const DECK_CHOICES = [1, 2, 4, 6, 8];
export const AMOUNT_CHOICES = [100, 250, 500, 1000, 2500, 5000, 10000];
/** The count quiz asks for the running count every this many completed hands. */
export const QUIZ_EVERY = 5;

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
    countQuiz: bool('countQuiz', false),
    numberOfDecks: integer('numberOfDecks', rules.shoe.numberOfDecks, 1, 8),
    startingAmount, maxBet: integer('maxBet', rules.table.maxBet, 100, startingAmount),
    strategy: strategies.some((s) => s.id === input.strategy) ? input.strategy : 'basic',
    tableRules: normalizeTableRules(input.tableRules, rules),
    teaching: normalizeTeaching(input.teaching, rules),
  };
}

// ── table rules & teaching toggles (Settings → Rules / Teaching) ─────────────

/** The table-rule choices Settings offers. Defaults come from the config. */
export const RULE_CHOICES = {
  hitsSoft17: [false, true],
  blackjackPayout: [1.5, 1.2],
  surrender: ['late', 'none'],
  doubleRestriction: ['any', '9-11', '10-11'],
};

const pick = (value, choices, fallback) => (choices.includes(value) ? value : fallback);

function normalizeTableRules(saved, rules) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const surrenderDefault = rules.player.surrender === 'none' ? 'none' : 'late';
  return {
    hitsSoft17: typeof s.hitsSoft17 === 'boolean' ? s.hitsSoft17 : !!rules.dealer.hitsSoft17,
    blackjackPayout: pick(s.blackjackPayout, RULE_CHOICES.blackjackPayout, rules.payouts.blackjack),
    surrender: pick(s.surrender, RULE_CHOICES.surrender, surrenderDefault),
    doubleAfterSplit: typeof s.doubleAfterSplit === 'boolean' ? s.doubleAfterSplit : !!rules.player.doubleAfterSplit,
    doubleRestriction: pick(s.doubleRestriction, RULE_CHOICES.doubleRestriction, rules.player.doubleRestriction ?? 'any'),
  };
}

const TEACHING_KEYS = ['showBasicStrategyHints', 'explainHints', 'showTrueCount', 'warnOnStrategyDeviation'];

function normalizeTeaching(saved, rules) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const out = {};
  for (const k of TEACHING_KEYS) out[k] = typeof s[k] === 'boolean' ? s[k] : !!rules.teaching?.[k];
  return out;
}

/** Copy the Settings table rules into a rules object (the engine reads these live). */
function applyTableRules(tableRules, rules) {
  if (!tableRules) return;
  rules.dealer.hitsSoft17 = tableRules.hitsSoft17;
  rules.payouts.blackjack = tableRules.blackjackPayout;
  rules.player.surrender = tableRules.surrender;
  rules.player.doubleAfterSplit = tableRules.doubleAfterSplit;
  rules.player.doubleRestriction = tableRules.doubleRestriction;
}

/** Teaching toggles only change what's shown, so they apply immediately. */
export function applyTeaching(teaching, rules) {
  if (!teaching) return;
  rules.teaching = { ...rules.teaching };
  for (const k of TEACHING_KEYS) rules.teaching[k] = teaching[k];
}

/** True when the table rules in Settings differ from the ones in play. */
export function tableRulesPending(settings, rules) {
  const t = settings?.tableRules;
  if (!t) return false;
  return (
    rules.dealer.hitsSoft17 !== t.hitsSoft17 ||
    rules.payouts.blackjack !== t.blackjackPayout ||
    rules.player.surrender !== t.surrender ||
    rules.player.doubleAfterSplit !== t.doubleAfterSplit ||
    rules.player.doubleRestriction !== t.doubleRestriction
  );
}

/** Any Settings change still waiting for the next betting round. */
export function settingsPending(settings, rules) {
  if (!settings) return false;
  return (
    rules.shoe.numberOfDecks !== settings.numberOfDecks ||
    rules.table.startingBankroll !== settings.startingAmount ||
    tableRulesPending(settings, rules)
  );
}

export function applySettingsToRules(settings, rules) {
  rules.shoe.numberOfDecks = settings.numberOfDecks;
  rules.shoe.randomCutCard = settings.randomCutCard;
  rules.table.startingBankroll = settings.startingAmount;
  rules.table.maxBet = settings.maxBet;
  applyTableRules(settings.tableRules, rules);
  applyTeaching(settings.teaching, rules);
}

/**
 * Deck/bankroll restarts and table-rule changes wait for betting, after the
 * prior hand is settled (a rule must never change under a hand in play).
 */
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
