/**
 * strategies.js — the registry of selectable hint strategies.
 *
 * 'basic' is the COMPUTED basic strategy (advisor.js): always present, the
 * default, and the fallback. User-defined strategies come from
 * config/user-strategies.config.js as declarative charts; the single
 * interpreter below runs any chart, so authoring a strategy means editing
 * data, never logic. Two guard rails keep a bad chart from mis-teaching
 * (spec §6 — a wrong hint is the worst bug):
 *   - malformed entries are skipped with a console warning at load, and
 *   - a hand a chart doesn't cover falls back to the computed basic strategy,
 *     flagged so the UI can say so.
 *
 * Composite chart codes ('D' = double else hit, …) resolve against the same
 * legality gating the advisor itself uses, so a chart can never recommend a
 * move the rules forbid.
 */

import { handValue, isPair } from '../engine/hand.js';
import { cardValue, isAce } from '../engine/cards.js';
import { bestAction } from './advisor.js';
import { doubleAllowedForTotal } from './ev.js';
import { USER_STRATEGIES } from '../../config/user-strategies.config.js';

const BASIC = { id: 'basic', label: 'Basic strategy' };

const CODES = new Set(['H', 'S', 'D', 'Ds', 'P', 'R', 'Rs']);
const COLUMNS = new Set(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A']);
const inRange = (key, lo, hi) => /^\d+$/.test(key) && Number(key) >= lo && Number(key) <= hi;

// ── validation (capability-guard style: warn + skip, never silently mis-teach) ─

/** One cell: a single code, or a per-upcard map of codes. Returns an error string or null. */
function cellError(section, row, cell) {
  const entries =
    typeof cell === 'string'
      ? [[null, cell]]
      : cell && typeof cell === 'object'
        ? Object.entries(cell)
        : null;
  if (!entries) return `${section} ${row}: a row must be a code or a per-upcard map`;
  for (const [col, code] of entries) {
    if (col !== null && !COLUMNS.has(col)) return `${section} ${row}: unknown upcard column '${col}'`;
    if (!CODES.has(code)) return `${section} ${row}: unknown code '${code}'`;
    if (code === 'P' && section !== 'pairs') return `${section} ${row}: 'P' is only valid in pairs`;
  }
  return null;
}

function sectionError(section, rows, rowKeyOk) {
  if (rows == null) return null; // every section is optional
  if (typeof rows !== 'object') return `${section} must be an object of rows`;
  for (const [row, cell] of Object.entries(rows)) {
    if (!rowKeyOk(row)) return `${section}: '${row}' is not a valid row key`;
    const err = cellError(section, row, cell);
    if (err) return err;
  }
  return null;
}

function entryError(entry, seenIds) {
  if (!entry || typeof entry !== 'object') return 'not an object';
  if (typeof entry.id !== 'string' || !entry.id) return 'missing id';
  if (entry.id === 'basic') return "id 'basic' is reserved for the computed strategy";
  if (seenIds.has(entry.id)) return `duplicate id '${entry.id}'`;
  if (typeof entry.label !== 'string' || !entry.label) return 'missing label';
  if (entry.note != null && typeof entry.note !== 'string') return 'note must be a string';
  return (
    sectionError('hard', entry.hard, (k) => inRange(k, 4, 21)) ??
    sectionError('soft', entry.soft, (k) => inRange(k, 12, 21)) ??
    sectionError('pairs', entry.pairs, (k) => COLUMNS.has(k))
  );
}

/** Filter a raw config array down to the valid charts, warning about the rest. */
export function validateUserStrategies(entries) {
  const valid = [];
  const seenIds = new Set();
  (Array.isArray(entries) ? entries : []).forEach((entry, i) => {
    const err = entryError(entry, seenIds);
    if (err) {
      const name = entry && typeof entry.id === 'string' ? ` '${entry.id}'` : '';
      console.warn(`[strategies] Skipping user strategy #${i + 1}${name}: ${err}`);
      return;
    }
    seenIds.add(entry.id);
    valid.push(entry);
  });
  return valid;
}

// Validated once at load; the config is bundled, so this can't change at runtime.
const userStrategies = validateUserStrategies(USER_STRATEGIES);

/** Every selectable strategy, the computed basic strategy first. */
export function listStrategies() {
  return [BASIC, ...userStrategies.map(({ id, label }) => ({ id, label }))];
}

// ── the chart interpreter ────────────────────────────────────────────────────

const columnKey = (card) => (isAce(card) ? 'A' : String(cardValue(card)));

/** A row's code against one upcard, or null when the chart is silent. */
function cellCode(rows, rowKey, col) {
  const cell = rows?.[rowKey];
  if (cell == null) return null;
  return typeof cell === 'string' ? cell : (cell[col] ?? null);
}

/**
 * Play a hand by a chart. Returns an action string, or null when the chart
 * doesn't cover the hand (the caller falls back to the computed strategy).
 * Exported for tests; the UI goes through recommend().
 */
export function chartAction(strategy, cards, upcard, rules, context = {}) {
  const fromSplit = !!context.fromSplit;
  const { total, soft } = handValue(cards);
  const twoCards = cards.length === 2;
  const p = rules.player;
  const col = columnKey(upcard);

  // Same legality gating as the advisor (advisor.js) — never recommend a move
  // the rules forbid. Engine context supplies bankroll and remaining-hand limits.
  const mayDouble =
    context.legal?.double !== false && twoCards && p.doubleAllowed && doubleAllowedForTotal(total, soft, rules) && (!fromSplit || p.doubleAfterSplit);
  const maySplit = context.legal?.split !== false &&
    (context.splitBudget ?? p.maxSplitHands - (fromSplit ? 2 : 1)) > 0 &&
    twoCards && p.splitAllowed && isPair(cards) && !(fromSplit && isAce(cards[0]) && !p.resplitAces);
  const maySurrender = context.legal?.surrender !== false && twoCards && !fromSplit && (p.surrender === 'late' || p.surrender === 'early');

  // Pairs first; a 'P' the player can't take falls through to the totals rows.
  let code = null;
  if (twoCards && isPair(cards)) {
    code = cellCode(strategy.pairs, columnKey(cards[0]), col);
    if (code === 'P' && !maySplit) code = null;
  }
  if (code == null) code = cellCode(soft ? strategy.soft : strategy.hard, String(total), col);
  if (code == null) return null;

  switch (code) {
    case 'H':
      return 'hit';
    case 'S':
      return 'stand';
    case 'D':
      return mayDouble ? 'double' : 'hit';
    case 'Ds':
      return mayDouble ? 'double' : 'stand';
    case 'P':
      return 'split'; // only reachable when maySplit (see above)
    case 'R':
      return maySurrender ? 'surrender' : 'hit';
    case 'Rs':
      return maySurrender ? 'surrender' : 'stand';
    /* v8 ignore next 2 -- validation rejects unknown codes */
    default:
      return null;
  }
}

/**
 * The selected strategy's recommendation — same shape as bestAction(), plus
 * { strategyId, label, note?, isUserDefined, fallback }. Unknown/stale ids and
 * chart-uncovered hands resolve to the computed basic strategy (`fallback`
 * marks the latter so the hint panel can say so).
 */
export function recommend(strategyId, cards, upcard, rules, context = {}) {
  const strategy = userStrategies.find((s) => s.id === strategyId);
  if (!strategy) {
    return {
      ...bestAction(cards, upcard, rules, context),
      strategyId: BASIC.id,
      label: BASIC.label,
      isUserDefined: false,
      fallback: false,
    };
  }
  const action = chartAction(strategy, cards, upcard, rules, context);
  if (action == null) {
    return {
      ...bestAction(cards, upcard, rules, context),
      strategyId: strategy.id,
      label: strategy.label,
      isUserDefined: true,
      fallback: true,
    };
  }
  const { total, soft } = handValue(cards);
  return {
    action,
    total,
    soft,
    strategyId: strategy.id,
    label: strategy.label,
    note: strategy.note,
    isUserDefined: true,
    fallback: false,
  };
}
