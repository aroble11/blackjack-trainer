/** Finite-deck, composition-dependent EVs for 1–2 decks (US peek).
 * Remove the upcard and this hand, never the hidden card or previous rounds:
 * this is basic strategy, not a count-based or clairvoyant advisor.
 * Stand/hit/double enumerate without replacement and condition every player
 * draw on the reserved hole card not completing blackjack. Split values use
 * the explicit hand-count approximation described in docs/strategy-model.md.
 */
import { cardValue } from '../engine/cards.js';
import { handValue } from '../engine/hand.js';
import { addCard } from './probabilities.js';
import { doubleAllowedForTotal } from './ev.js';

const values = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const index = (card) => card.rank === 'A' ? 0 : cardValue(card) - 1;
const keyOf = (counts) => String.fromCharCode(...counts.map((n) => n + 35));
const answerCache = new Map();

export function finiteDeckEVs(cards, upcard, rules, context = {}) {
  const cacheKey = JSON.stringify([cards.map(index).sort(), index(upcard), rules.shoe.numberOfDecks,
    rules.dealer.hitsSoft17, rules.player, rules.payouts.regularWin, context.fromSplit, context.splitBudget]);
  if (answerCache.has(cacheKey)) return structuredClone(answerCache.get(cacheKey));
  const counts = values.map((_, i) => rules.shoe.numberOfDecks * (i === 9 ? 16 : 4));
  for (const card of [...cards, upcard]) counts[index(card)]--;
  if (counts.some((n) => n < 0)) throw new Error('Hand exceeds the configured finite deck composition.');
  const up = cardValue(upcard);
  const forbidden = up === 11 ? 9 : up === 10 ? 0 : -1;
  const dealerMemo = new Map();
  const playerMemo = new Map();
  const win = rules.payouts.regularWin;
  const sum = () => counts.reduce((a, b) => a + b, 0);

  function dealer(total, soft, n) {
    const terminal = total > 21 ? 5 : total >= 17 &&
      !(total === 17 && soft && rules.dealer.hitsSoft17) ? total - 17 : -1;
    if (terminal >= 0) { const d = [0, 0, 0, 0, 0, 0]; d[terminal] = 1; return d; }
    const key = `${total}:${+soft}:${keyOf(counts)}`;
    if (dealerMemo.has(key)) return dealerMemo.get(key);
    const d = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 10; i++) {
      if (!counts[i]) continue;
      const p = counts[i] / n;
      counts[i]--;
      const next = addCard(total, soft, values[i]);
      const sub = dealer(next.total, next.soft, n - 1);
      counts[i]++;
      for (let j = 0; j < 6; j++) d[j] += p * sub[j];
    }
    dealerMemo.set(key, d);
    return d;
  }

  function distribution() {
    const n = sum();
    const allowed = n - (counts[forbidden] ?? 0);
    const d = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 10; i++) {
      if (i === forbidden || !counts[i]) continue;
      const p = counts[i] / allowed;
      counts[i]--;
      const start = addCard(up, up === 11, values[i]);
      const sub = dealer(start.total, start.soft, n - 1);
      counts[i]++;
      for (let j = 0; j < 6; j++) d[j] += p * sub[j];
    }
    return d;
  }

  function stand(total) {
    if (total > 21) return -1;
    const d = distribution();
    return d.reduce((ev, p, i) => ev + p * (i === 5 || total > 17 + i ? win : total < 17 + i ? -1 : 0), 0);
  }

  // The unseen pool includes the reserved hole card. Conditional draws cannot
  // be counts/N after an Ace/ten peek: subtract each rank's hole probability.
  function drawValue(fn) {
    const n = sum();
    const allowed = n - (counts[forbidden] ?? 0);
    let ev = 0;
    for (let i = 0; i < 10; i++) {
      if (!counts[i]) continue;
      const hole = i === forbidden ? 0 : counts[i] / allowed;
      const p = (counts[i] - hole) / (n - 1);
      if (!p) continue;
      counts[i]--;
      ev += p * fn(values[i]);
      counts[i]++;
    }
    return ev;
  }

  function play(total, soft) {
    if (total > 21) return { stand: -1, hit: -1, double: -2 };
    const key = `${total}:${+soft}:${keyOf(counts)}`;
    if (playerMemo.has(key)) return playerMemo.get(key);
    const stay = stand(total);
    let doubled = 0;
    const hit = total === 21 ? -1 : drawValue((v) => {
      const next = addCard(total, soft, v);
      const sub = play(next.total, next.soft);
      // Same draw probabilities for hit and double; doubling terminates now.
      return Math.max(sub.stand, sub.hit);
    });
    doubled = 2 * drawValue((v) => stand(addCard(total, soft, v).total));
    const result = { stand: stay, hit, double: doubled };
    playerMemo.set(key, result);
    return result;
  }

  const { total, soft } = handValue(cards);
  const evs = { ...play(total, soft) };
  const dealerDist = Object.fromEntries(distribution().map((p, i) => [i === 5 ? 'bust' : 17 + i, p]));
  if (cards.length !== 2 || !doubleAllowedForTotal(total, soft, rules) ||
      (context.fromSplit && !rules.player.doubleAfterSplit)) delete evs.double;

  const budget = context.splitBudget ?? rules.player.maxSplitHands - (context.fromSplit ? 2 : 1);
  if (cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]) && rules.player.splitAllowed && budget > 0) {
    const pair = cardValue(cards[0]);
    // Hand-count split approximation: track extra pair cards consumed by
    // re-splits, but not the complete draw histories of sibling hands.
    const splitMemo = new Map();
    function splitHands(pending, remaining) {
      if (!pending) return 0;
      const key = pending + ':' + remaining + ':' + keyOf(counts);
      if (splitMemo.has(key)) return splitMemo.get(key);
      const rest = splitHands(pending - 1, remaining);
      const value = drawValue((v) => {
        const next = addCard(pair, pair === 11, v);
        const sub = pair === 11 ? { stand: stand(next.total) } : play(next.total, next.soft);
        const keep = (pair === 11 ? sub.stand : Math.max(sub.stand, sub.hit,
          rules.player.doubleAfterSplit && doubleAllowedForTotal(next.total, next.soft, rules) ? sub.double : -Infinity)) + rest;
        return v === pair && pair !== 11 && remaining > 0
          ? Math.max(keep, splitHands(pending + 1, remaining - 1)) : keep;
      });
      splitMemo.set(key, value);
      return value;
    }
    evs.split = splitHands(2, budget - 1);
  }
  if (cards.length === 2 && !context.fromSplit && rules.player.surrender !== 'none') evs.surrender = -0.5;
  const result = { evs, dealerDist, total, soft, model: 'finite', splitApproximation: evs.split !== undefined };
  if (answerCache.size >= 1500) answerCache.clear();
  answerCache.set(cacheKey, result);
  return structuredClone(result);
}
