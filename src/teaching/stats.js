/**
 * stats.js — session statistics: pure functions over a plain, persistable object.
 *
 *   hands       rounds completed
 *   netCents    total won/lost across those rounds (integer cents)
 *   decisions   playing decisions graded against the selected hint strategy
 *   correct     … of which matched it
 *   costEV      summed EV given up by mismatches (units of original bet)
 *   situations  { "Hard 16 vs 10": { seen, wrong, cost } }
 *   insurance   { offered, declined }
 *   quiz        { asked, right } — the count quiz
 */

const num = (v) => (Number.isFinite(v) ? v : 0);

export function emptyStats(now = Date.now()) {
  return {
    since: now,
    hands: 0,
    netCents: 0,
    decisions: 0,
    correct: 0,
    costEV: 0,
    situations: {},
    insurance: { offered: 0, declined: 0 },
    quiz: { asked: 0, right: 0 },
  };
}

/** Accept a saved stats object, dropping anything malformed. */
export function normalizeStats(saved) {
  if (!saved || typeof saved !== 'object') return emptyStats();
  const s = emptyStats(num(saved.since) || Date.now());
  for (const k of ['hands', 'netCents', 'decisions', 'correct', 'costEV']) s[k] = num(saved[k]);
  if (saved.situations && typeof saved.situations === 'object') {
    for (const [key, v] of Object.entries(saved.situations)) {
      if (v && typeof v === 'object') s.situations[key] = { seen: num(v.seen), wrong: num(v.wrong), cost: num(v.cost) };
    }
  }
  s.insurance = { offered: num(saved.insurance?.offered), declined: num(saved.insurance?.declined) };
  s.quiz = { asked: num(saved.quiz?.asked), right: num(saved.quiz?.right) };
  return s;
}

/** One graded playing decision. `cost` (≥ 0) is EV given up, 0 when correct. */
export function recordDecision(stats, key, correct, cost = 0) {
  stats.decisions += 1;
  if (correct) stats.correct += 1;
  const lost = correct ? 0 : Math.max(0, num(cost));
  stats.costEV += lost;
  const sit = (stats.situations[key] ??= { seen: 0, wrong: 0, cost: 0 });
  sit.seen += 1;
  if (!correct) {
    sit.wrong += 1;
    sit.cost += lost;
  }
  return stats;
}

export function recordRound(stats, netCents) {
  stats.hands += 1;
  stats.netCents += Math.round(num(netCents));
  return stats;
}

export function recordInsurance(stats, declined) {
  stats.insurance.offered += 1;
  if (declined) stats.insurance.declined += 1;
  return stats;
}

export function recordQuiz(stats, right) {
  stats.quiz.asked += 1;
  if (right) stats.quiz.right += 1;
  return stats;
}

/** Situations played wrong at least once, worst first (most misses, then most EV lost). */
export function topMisses(stats, n = 5) {
  return Object.entries(stats.situations)
    .filter(([, v]) => v.wrong > 0)
    .sort(([, a], [, b]) => b.wrong - a.wrong || b.cost - a.cost)
    .slice(0, n)
    .map(([key, v]) => ({ key, ...v }));
}
