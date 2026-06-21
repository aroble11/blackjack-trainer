/**
 * explain.js — turn a bestAction() result into a short, plain-language "why".
 *
 * Every reason cites the actual computed numbers (the EVs and the dealer's bust
 * chance), so the explanation is honest and educational rather than canned.
 */

const fmtEV = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);
const pct = (x) => Math.round(x * 100);

export function explainAction(rec, dealerUpcard) {
  const { action, evs, dealerDist, total } = rec;
  const up = dealerUpcard.rank;
  const bust = pct(dealerDist.bust);
  const bestPlay = Math.max(evs.stand, evs.hit, evs.double ?? -Infinity, evs.split ?? -Infinity);

  switch (action) {
    case 'stand':
      return `Standing (EV ${fmtEV(evs.stand)}) beats hitting (${fmtEV(evs.hit)}) — the dealer's ${up} busts about ${bust}% of the time, so let them draw.`;
    case 'hit':
      return `Hitting (EV ${fmtEV(evs.hit)}) beats standing (${fmtEV(evs.stand)}) — ${total} is too weak to stand against a ${up}.`;
    case 'double':
      return `Doubling (EV ${fmtEV(evs.double)}) beats just hitting (${fmtEV(Math.max(evs.hit, evs.stand))}) — a strong spot to put out more money for one card.`;
    case 'split':
      return `Splitting (EV ${fmtEV(evs.split)}) beats playing the ${total} as one hand (${fmtEV(Math.max(evs.hit, evs.stand))}).`;
    case 'surrender':
      return `${total} vs the dealer's ${up} loses too often to fight — forfeiting half (−0.50) beats playing on (best is ${fmtEV(bestPlay)}).`;
    default:
      return '';
  }
}
