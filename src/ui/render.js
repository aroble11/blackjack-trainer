/**
 * render.js — draw the whole game from engine state into the DOM.
 *
 * Pure rendering: it reads game state and the engine's can*() legality helpers
 * (never re-deriving rules) and returns nothing but DOM. The full subtree is
 * rebuilt each call; controls.js drives re-renders via event delegation.
 */

import { handValue } from '../engine/hand.js';
import { cardFaceSvg, cardBackSvg, chipSvg } from '../assets/svg.js';
import { formatMoney } from '../engine/money.js';
import {
  Phase,
  canHit,
  canStand,
  canDouble,
  canSplit,
  canSurrender,
  canDeal,
  isBroke,
  activeHand,
  decisionContext,
} from '../engine/game.js';
import { recommend, listStrategies } from '../teaching/strategies.js';
import { explainAction } from '../teaching/explain.js';
import { countFromShoe } from '../teaching/counting.js';
import { buildHistogram } from '../sim/histogram.js';
import { BETTING_SYSTEMS } from '../sim/betting-systems.js';

const cardFront = cardFaceSvg;
const cardBack = cardBackSvg;

// ── render-side animation state ──────────────────────────────────────────────
// The whole subtree re-renders each action, so to animate only newly-dealt cards
// we remember which cards each hand has already shown. Player hands track the set
// of card OBJECTS shown last render (keyed by hand identity): a split swaps the
// left hand's second card in place, so a plain count would miss that the new card
// is freshly dealt. The dealer hand (a replaced array) is tracked by count and
// reset each round.
const shownByHand = new WeakMap();
let shownDealer = 0;
let prevBetCents = 0;

const cardSlot = (svg, isNew, order = 0) =>
  `<span class="card-slot${isNew ? ' dealt' : ''}"${isNew ? ` style="--deal-i:${order}"` : ''}>${svg}</span>`;

/** Greedy chip breakdown of a bet, largest first, capped so the stack stays small. */
function chipBreakdown(cents, denomsDesc) {
  const out = [];
  let rem = cents;
  for (const d of denomsDesc) {
    const dc = d * 100;
    while (rem >= dc && out.length < 8) {
      out.push(d);
      rem -= dc;
    }
  }
  return out;
}

function totalLabel(cards, options) {
  const { total, soft } = handValue(cards);
  if (total > 21) return `${total} · bust`;
  if (soft) {
    return options?.settings?.softDisplayBothValues
      ? `${total - 10} or ${total} · soft`
      : `${total} · soft`;
  }
  return `${total}`;
}

function renderDealer(g, options) {
  if (g.dealerCards.length === 0) shownDealer = 0; // new round
  const hidden = !g.dealerHoleRevealed && g.dealerCards.length > 0;
  let cardsHtml = '';
  if (hidden) {
    cardsHtml =
      cardSlot(cardFront(g.dealerCards[0]), shownDealer <= 0, 0 - shownDealer) +
      cardSlot(cardBack(), shownDealer <= 1, 1 - shownDealer);
  } else if (g.dealerCards.length) {
    cardsHtml = g.dealerCards
      .map((c, i) => cardSlot(cardFront(c), i >= shownDealer, i - shownDealer))
      .join('');
  }
  shownDealer = g.dealerCards.length;
  // Bubble shows the value of the dealer's *visible* cards (upcard only while the
  // hole card is down), matching how a real table reads.
  const visible = hidden ? [g.dealerCards[0]] : g.dealerCards;
  const bubble = g.dealerCards.length
    ? `<div class="total-bubble dealer">${totalLabel(visible, options)}</div>`
    : '';
  return `<section class="dealer-area" aria-label="Dealer hand">
      ${bubble}
      <div class="hand">${cardsHtml}</div>
    </section>`;
}

const OUTCOME_TEXT = {
  win: 'Win',
  lose: 'Lose',
  push: 'Push',
  blackjack: 'Blackjack!',
  surrender: 'Surrender',
};

function formatSignedMoney(cents) {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  return `${sign}${formatMoney(Math.abs(cents))}`;
}

const ACTION_LABEL = {
  stand: 'Stand',
  hit: 'Hit',
  double: 'Double',
  split: 'Split',
  surrender: 'Surrender',
};

/** The hand's wager as a small chip stack + amount, shown under the cards. */
function renderStake(g, cents) {
  if (!cents) return '';
  const denomsDesc = [...g.rules.table.chipDenominations].sort((a, b) => b - a);
  const chips = chipBreakdown(cents, denomsDesc)
    .map((v) => `<span class="stack-chip">${chipSvg(v)}</span>`)
    .join('');
  return `<div class="hand-stake">
      <span class="bet-stack">${chips}</span>
      <span class="stake-amt">${formatMoney(cents)}</span>
    </div>`;
}

function renderPlayerHand(g, hand, index, options) {
  const active =
    g.phase === Phase.PlayerTurn && index === g.activeHandIndex && g.playerHands.length > 1;
  const shown = shownByHand.get(hand); // Set of card objects shown last render, or undefined
  let newOrder = 0; // stagger index among only the newly-dealt cards
  const cardsHtml = hand.cards
    .map((c) => {
      const isNew = !shown || !shown.has(c);
      return cardSlot(cardFront(c), isNew, isNew ? newOrder++ : 0);
    })
    .join('');
  shownByHand.set(hand, new Set(hand.cards));
  // On a split, the round-over overlay only shows the combined total, so each
  // hand's own badge spells out its share (omitted on push — always $0, and
  // on a single un-split hand, where the overlay figure already IS that
  // hand's amount).
  const showHandAmount = g.playerHands.length > 1 && hand.outcome && hand.outcome !== 'push';
  const amountText = showHandAmount ? ` ${formatSignedMoney(hand.returnCents - hand.stakeCents)}` : '';
  const badge = hand.outcome
    ? `<span class="badge ${hand.outcome}">${OUTCOME_TEXT[hand.outcome]}${amountText}</span>`
    : '';
  return `<div class="hand-block ${active ? 'active' : ''}">
      <div class="hand">${cardsHtml}</div>
      <div class="hand-meta">
        <span class="total-bubble player">${totalLabel(hand.cards, options)}</span>
        ${badge}
      </div>
      ${renderStake(g, hand.stakeCents)}
    </div>`;
}

function renderPlayer(g, options) {
  if (!g.playerHands.length) {
    const prompt = g.phase === Phase.Betting ? '<div class="place-bet">Place Your Bet</div>' : '';
    return `<section class="player-area" aria-label="Your hand">${prompt}</section>`;
  }
  const body = g.playerHands.map((h, i) => renderPlayerHand(g, h, i, options)).join('');
  return `<section class="player-area" aria-label="Your hand">${body}</section>`;
}

function btn(action, label, { disabled = false, value, cls = '' } = {}) {
  const dataValue = value != null ? ` data-value="${value}"` : '';
  return `<button class="btn ${cls}" data-action="${action}"${dataValue}${
    disabled ? ' disabled' : ''
  }>${label}</button>`;
}

function renderBetStack(g) {
  const denomsDesc = [...g.rules.table.chipDenominations].sort((a, b) => b - a);
  const grew = g.betCents > prevBetCents;
  prevBetCents = g.betCents;
  const chips = chipBreakdown(g.betCents, denomsDesc)
    .map((v) => `<span class="stack-chip">${chipSvg(v)}</span>`)
    .join('');
  return `<div class="bet-stack${grew ? ' grew' : ''}">${chips}</div>`;
}

// The floating lightbulb that toggles the hint; only when hints are enabled.
function hintFab(g) {
  if (!g.rules.teaching?.showBasicStrategyHints) return '';
  return `<button class="btn icon hint-fab" data-action="hint" aria-label="Basic-strategy hint" title="Basic-strategy hint">💡</button>`;
}

// Circular surrender button, stacked above the hint lightbulb.
function surrenderFab() {
  return `<button class="btn icon surrender-fab" data-action="surrender" aria-label="Surrender" title="Surrender">🏳️</button>`;
}

function renderSettingsPanel(g, options) {
  const on = options.settings?.softDisplayBothValues ?? false;
  const decks = options.settings?.numberOfDecks ?? 6;
  const maxBet = options.settings?.maxBet ?? 500;
  const startAmount = options.settings?.startingAmount ?? 500;
  const showStart = options.settings?.showStartingAmount ?? false;
  const showCount = options.settings?.showCardCount ?? true;
  const cutCard = options.settings?.randomCutCard ?? false;
  const strategy = options.settings?.strategy ?? 'basic';
  const t = g.rules.teaching || {};
  const countingActive = t.showCardCounting && t.countingSystem !== 'none' && !g.rules.shoe.continuousShuffle;
  const shoeDepletes = !g.rules.shoe.continuousShuffle;
  return `<div class="settings-panel" role="dialog" aria-modal="true" aria-label="Settings">
      <button class="btn settings-close" data-action="closeSettings" aria-label="Close settings">Done</button>
      <p class="settings-example">Deck changes apply at the next betting round. Changing the starting amount begins a new bankroll after this hand.</p>
      <div class="settings-section">Table</div>
      <div class="settings-row">
        <span class="settings-label">Number of decks</span>
        <div class="stepper">
          <span class="stepper-value">${decks}</span>
          <div class="stepper-arrows">
            <button class="stepper-btn" data-action="decksUp"
                    aria-label="Increase number of decks"${decks >= 99 ? ' disabled' : ''}>▲</button>
            <button class="stepper-btn" data-action="decksDown"
                    aria-label="Decrease number of decks"${decks <= 1 ? ' disabled' : ''}>▼</button>
          </div>
        </div>
      </div>
      <div class="settings-row">
        <span class="settings-label">Cut card</span>
        <button class="settings-toggle${cutCard ? ' on' : ''}" data-action="toggleCutCard" aria-label="Cut card"
                role="switch" aria-checked="${cutCard}"${shoeDepletes ? '' : ' disabled'}>
          <span class="toggle-knob"></span>
        </button>
      </div>
      <p class="settings-example">${
        cutCard
          ? 'Reshuffle at a random point late in the shoe'
          : 'Reshuffle at the same fixed depth every shoe'
      }</p>
      <div class="settings-section">Bankroll</div>
      <div class="settings-row">
        <span class="settings-label">Starting amount</span>
        <div class="stepper">
          <span class="stepper-value">${formatMoney(startAmount * 100)}</span>
          <div class="stepper-arrows">
            <button class="stepper-btn" data-action="startAmountUp"
                    aria-label="Increase starting amount"${startAmount >= 10000 ? ' disabled' : ''}>▲</button>
            <button class="stepper-btn" data-action="startAmountDown"
                    aria-label="Decrease starting amount"${startAmount <= 100 ? ' disabled' : ''}>▼</button>
          </div>
        </div>
      </div>
      <div class="settings-row">
        <span class="settings-label">Show starting amount</span>
        <button class="settings-toggle${showStart ? ' on' : ''}" data-action="toggleShowStartAmount" aria-label="Show starting amount"
                role="switch" aria-checked="${showStart}">
          <span class="toggle-knob"></span>
        </button>
      </div>
      <div class="settings-row">
        <span class="settings-label">Max bet</span>
        <div class="stepper">
          <span class="stepper-value">${formatMoney(maxBet * 100)}</span>
          <div class="stepper-arrows">
            <button class="stepper-btn" data-action="maxBetUp"
                    aria-label="Increase max bet"${maxBet >= startAmount ? ' disabled' : ''}>▲</button>
            <button class="stepper-btn" data-action="maxBetDown"
                    aria-label="Decrease max bet"${maxBet <= 100 ? ' disabled' : ''}>▼</button>
          </div>
        </div>
      </div>
      <div class="settings-section">Display</div>
      <div class="settings-row">
        <span class="settings-label">Show card count</span>
        <button class="settings-toggle${showCount ? ' on' : ''}" data-action="toggleCardCount" aria-label="Show card count"
                role="switch" aria-checked="${showCount}"${countingActive ? '' : ' disabled'}>
          <span class="toggle-knob"></span>
        </button>
      </div>
      <div class="settings-row">
        <span class="settings-label">Alternate soft value</span>
        <button class="settings-toggle${on ? ' on' : ''}" data-action="toggleSoftDisplay" aria-label="Alternate soft value"
                role="switch" aria-checked="${on}">
          <span class="toggle-knob"></span>
        </button>
      </div>
      <p class="settings-example">${on ? '4 or 14 · soft' : '14 · soft'}</p>
      <div class="settings-section">Teaching</div>
      <div class="settings-row">
        <span class="settings-label">Hint strategy</span>
        <select class="settings-select" data-action="selectStrategy" aria-label="Hint strategy"${
          t.showBasicStrategyHints ? '' : ' disabled'
        }>
          ${listStrategies()
            .map((s) => `<option value="${s.id}"${s.id === strategy ? ' selected' : ''}>${s.label}</option>`)
            .join('')}
        </select>
      </div>
      ${options.pwa ? '<div class="settings-section">App</div><div class="settings-row"><button class="btn" data-action="checkUpdate">Check for updates</button></div>' : ''}
    </div>`;
}

/** The selected hint strategy's label ('Basic strategy' unless the user picked another). */
function selectedStrategyLabel(options) {
  const id = options.settings?.strategy ?? 'basic';
  return listStrategies().find((s) => s.id === id)?.label ?? 'Basic strategy';
}

// The revealed hint panel (shown only after the lightbulb is tapped).
function renderHintPanel(g, options) {
  const teaching = g.rules.teaching || {};
  if (!teaching.showBasicStrategyHints || !options.ui?.hintShown) return '';
  const hand = activeHand(g);
  if (!hand || !g.dealerCards[0]) return '';
  const rec = recommend(options.settings?.strategy ?? 'basic', hand.cards, g.dealerCards[0], g.rules, decisionContext(g));
  // A chart that doesn't cover this hand falls back to computed basic strategy,
  // and the panel says so — never pass off a fallback as the user's chart.
  const showComputed = !rec.isUserDefined || rec.fallback;
  const lines = [];
  if (rec.fallback) {
    lines.push(`<p class="hint-why">“${rec.label}” doesn't cover this hand — showing the computed basic strategy.</p>`);
  }
  if (showComputed && teaching.explainHints) {
    lines.push(`<p class="hint-why">${explainAction(rec, g.dealerCards[0])}</p>`);
  } else if (!showComputed && rec.note) {
    lines.push(`<p class="hint-why">${rec.note}</p>`);
  }
  const caveat = showComputed
    ? rec.model === 'finite'
      ? 'Finite-deck calculation for this hand; previous rounds are not counted. Split values approximate sibling-hand histories. Cross-check your rules.'
      : 'Infinite-deck approximation; deck-specific composition effects are not modeled. Cross-check a chart for your rules.'
    : 'User-defined strategy — not verified as optimal.';
  return `<div class="hint-panel">
      <p class="hint-move">${rec.fallback ? 'Basic strategy' : rec.label}: <strong>${ACTION_LABEL[rec.action]}</strong></p>
      ${lines.join('\n      ')}
      <p class="hint-caveat">${caveat}</p>
    </div>`;
}

// Icon + color treatment for each player action button.
const ACTION_META = {
  stand: { icon: '✋', label: 'Stand', cls: 'act-stand' },
  split: { icon: '✂️', label: 'Split', cls: 'act-split' },
  double: { icon: '⏬', label: 'Double', cls: 'act-double' },
  hit: { icon: '⬇️', label: 'Hit', cls: 'act-hit' },
};

function actionBtn(action, disabled) {
  const m = ACTION_META[action];
  return `<button class="btn action ${m.cls}" data-action="${action}"${disabled ? ' disabled' : ''}>
      <span class="act-icon" aria-hidden="true">${m.icon}</span>
      <span class="act-label">${m.label}</span>
    </button>`;
}

function renderControls(g, options) {
  if (g.phase === Phase.Betting) {
    if (isBroke(g)) {
      return `<footer class="controls">
          <p class="broke-msg">Out of chips.</p>
          ${btn('rebuy', `Re-buy ${formatMoney(g.rules.table.startingBankroll * 100)}`, { cls: 'primary' })}
        </footer>`;
    }
    const chips = g.rules.table.chipDenominations
      .map((d) =>
        btn('chip', chipSvg(d), {
          value: d * 100,
          cls: 'chip',
          disabled: g.bankrollCents < d * 100,
        })
      )
      .join('');
    return `<footer class="controls">
        <div class="chips">${chips}</div>
        ${renderBetStack(g)}
        <div class="bet-row">
          <span class="bet-amount">Bet ${formatMoney(g.betCents)}</span>
          ${btn('clearBet', 'Clear', { disabled: g.betCents === 0, cls: 'btn-clear' })}
          ${btn('deal', 'Deal', { disabled: !canDeal(g), cls: 'btn-deal' })}
        </div>
      </footer>`;
  }

  if (g.phase === Phase.Insurance) {
    const cost = Math.floor(g.playerHands[0].stakeCents / 2);
    return `<footer class="controls">
        <p class="prompt">Dealer shows an Ace — take insurance?</p>
        ${btn('takeInsurance', `Insure ${formatMoney(cost)}`, { cls: 'primary' })}
        ${btn('declineInsurance', 'No')}
      </footer>`;
  }

  if (g.phase === Phase.PlayerTurn) {
    return `<footer class="controls">
        ${renderHintPanel(g, options)}
        <div class="action-row">
          ${actionBtn('stand', !canStand(g))}
          ${actionBtn('split', !canSplit(g))}
          ${actionBtn('double', !canDouble(g))}
          ${actionBtn('hit', !canHit(g))}
        </div>
        ${canSurrender(g) ? surrenderFab() : ''}
        ${hintFab(g)}
      </footer>`;
  }

  // RoundOver (DealerTurn is transient and never rendered).
  return `<footer class="controls">
      ${btn('next', 'Next hand', { cls: 'primary' })}
    </footer>`;
}

// Big center overlay shown at round-over. The headline is derived from the
// engine's own settled figures (returnCents/stakeCents/insurance*) — pure
// arithmetic on what the engine computed, never a re-derivation of payout rules.
function renderResultOverlay(g) {
  const hands = g.playerHands;
  if (!hands.length) return '';
  // Include the insurance side bet (wagered vs. credited back) so the headline
  // matches the actual bankroll change — e.g. a losing hand fully hedged by
  // insurance reads as a push, not a loss.
  const insuranceNet = (g.insuranceReturnCents ?? 0) - (g.insuranceCents ?? 0);
  const net = hands.reduce((s, h) => s + (h.returnCents - h.stakeCents), 0) + insuranceNet;
  let cls, text, amount = '';
  if (net > 0) {
    cls = 'won';
    text = hands.length === 1 && hands[0].outcome === 'blackjack' ? 'BLACKJACK!' : 'YOU WON';
    amount = formatMoney(net);
  } else if (net < 0) {
    cls = 'lost';
    text = hands.length === 1 && hands[0].outcome === 'surrender' ? 'SURRENDERED' : 'DEALER WINS';
  } else {
    cls = 'push';
    text = 'PUSH';
  }
  return `<div class="result-overlay ${cls}" role="status">
      <span class="result-text">${text}</span>
      ${amount ? `<span class="result-amount">${amount}</span>` : ''}
    </div>`;
}

// Shown in place of the felt branding while controls.js holds the 2s pause
// for a reshuffle/restart — same markup/style as the round-over overlay above.
// The message is "RESHUFFLE" for a deck change, "NEW GAME" for a starting-amount
// change (which also resets the bankroll).
function renderReshuffleOverlay(message = 'RESHUFFLE') {
  return `<div class="result-overlay reshuffle" role="status">
      <span class="result-text">${message}</span>
    </div>`;
}

function rulesChip(rules) {
  const pay =
    rules.payouts.blackjack === 1.5
      ? '3:2'
      : rules.payouts.blackjack === 1.2
        ? '6:5'
        : `${rules.payouts.blackjack}×`;
  return `${rules.shoe.numberOfDecks}D · ${rules.dealer.hitsSoft17 ? 'H17' : 'S17'} · ${pay}`;
}

// Curved branding "printed" on the felt — the table name plus the two headline
// rules, all derived from config (never hardcoded), echoing the rulesChip logic.
function feltBranding(rules) {
  const name = rules.table?.name || '';
  const pay =
    rules.payouts.blackjack === 1.5
      ? 'PAYS 3 TO 2'
      : rules.payouts.blackjack === 1.2
        ? 'PAYS 6 TO 5'
        : `PAYS ${rules.payouts.blackjack}×`;
  const dealerLine = rules.dealer.hitsSoft17 ? 'DEALER HITS SOFT 17' : 'DEALER STANDS ON SOFT 17';
  const nameText = name
    ? `<text class="brand-name"><textPath href="#brandArcName" startOffset="50%">${name}</textPath></text>`
    : '';
  return `<div class="felt-brand" aria-hidden="true">
      <svg viewBox="0 0 320 96" class="felt-brand-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <path id="brandArcName" d="M 66 16 Q 160 34 254 16" fill="none"/>
          <path id="brandArcPay" d="M 16 48 Q 160 82 304 48" fill="none"/>
          <path id="brandArcSub" d="M 44 72 Q 160 94 276 72" fill="none"/>
        </defs>
        ${nameText}
        <text class="brand-pay"><textPath href="#brandArcPay" startOffset="50%">${pay}</textPath></text>
        <text class="brand-sub"><textPath href="#brandArcSub" startOffset="50%">${dealerLine}</textPath></text>
      </svg>
    </div>`;
}

// ── card-counting readout (Phase 4) ─────────────────────────────────────────
const signClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');
const fmtRunning = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
function fmtTrue(n) {
  const r = Math.round(n * 10) / 10; // round first so −0.04 shows "0.0", not "−0.0"
  return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(1);
}

/**
 * Live Hi-Lo readout. Shown only for a depleting shoe (counting is meaningless
 * under a continuous shuffler) and when the config enables it. Reads the count
 * straight from the shoe's seen cards, so it reflects exactly what the player
 * has seen — the hole card only once it's revealed.
 */
function renderCount(g, options) {
  const t = g.rules.teaching || {};
  const showCount = options.settings?.showCardCount ?? true;
  if (!t.showCardCounting || t.countingSystem === 'none' || g.rules.shoe.continuousShuffle || !showCount) {
    return '';
  }
  const { running, trueCount, decksRemaining } = countFromShoe(g.shoe, t.countingSystem);
  const truePart = t.showTrueCount
    ? `<span class="count-stat"><span class="count-label">True</span><span class="count-val ${signClass(
        Math.round(trueCount * 10)
      )}">${fmtTrue(trueCount)}</span></span>`
    : '';
  return `<div class="count-bar" role="status" aria-label="Card counting readout">
      <span class="count-system">Hi-Lo</span>
      <span class="count-stat"><span class="count-label">Running</span><span class="count-val ${signClass(
        running
      )}">${fmtRunning(running)}</span></span>
      ${truePart}
      <span class="count-decks">${decksRemaining.toFixed(1)} decks</span>
    </div>`;
}

// Rounds a polygon's corners by cutting back along each edge and joining with
// a quadratic curve — same rounded-corner language as the card's own rx.
function roundedPolygonPath(pts, r) {
  const n = pts.length;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const v1x = curr[0] - prev[0],
      v1y = curr[1] - prev[1];
    const v1len = Math.hypot(v1x, v1y) || 1;
    const r1 = Math.min(r, v1len / 2);
    const p1x = curr[0] - (v1x / v1len) * r1,
      p1y = curr[1] - (v1y / v1len) * r1;
    const v2x = next[0] - curr[0],
      v2y = next[1] - curr[1];
    const v2len = Math.hypot(v2x, v2y) || 1;
    const r2 = Math.min(r, v2len / 2);
    const p2x = curr[0] + (v2x / v2len) * r2,
      p2y = curr[1] + (v2y / v2len) * r2;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p1x.toFixed(2)} ${p1y.toFixed(2)}`);
    parts.push(`Q ${curr[0].toFixed(2)} ${curr[1].toFixed(2)} ${p2x.toFixed(2)} ${p2y.toFixed(2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

function renderDeckStack(g, options) {
  if (g.shoe.continuousShuffle) return '';
  const total = g.shoe.cards.length;
  const deckPct = Math.max(0, Math.min(1, (total - g.shoe.pos) / total));
  // Portrait card (60×84) — exact same proportions as game cards.
  // Left face (84h, depth going lower-left) is cream/white like card-stock edges.
  // Rendered outside .table-area so it can bleed past the screen edge; the SVG
  // is then rotated 45° via CSS from its top-right corner anchor.
  const t = g.rules.teaching || {};
  const showCount = options.settings?.showCardCount ?? true;
  const countBarShown = t.showCardCounting && t.countingSystem !== 'none' && showCount;
  const topOffset = countBarShown ? '5.5rem' : '3.2rem';
  const D = deckPct * 24;
  const hD = D / 2;

  // Left face (84h = long side) — cream card-stock color, rounded to match the card's rx
  const leftFace =
    D > 0.1
      ? `<path d="${roundedPolygonPath(
          [
            [24, 0],
            [24 - D, hD],
            [24 - D, 84 + hD],
            [24, 84],
          ],
          6
        )}" fill="#ece9e2"/>`
      : '';
  // Bottom face (60w = short side) — slightly darker, rounded to match the card's rx
  const bottomFace =
    D > 0.1
      ? `<path d="${roundedPolygonPath(
          [
            [24, 84],
            [24 - D, 84 + hD],
            [84 - D, 84 + hD],
            [84, 84],
          ],
          6
        )}" fill="#d8d4cc"/>`
      : '';
  // Card edge lines on left face
  const edgeLines =
    D > 0.1
      ? Array.from({ length: 6 }, (_, i) => {
          const y = ((i + 1) * 84) / 7;
          return `<line x1="24" y1="${y.toFixed(1)}" x2="${(24 - D).toFixed(1)}" y2="${(y + hD).toFixed(1)}" stroke="rgba(0,0,0,0.08)" stroke-width="0.6"/>`;
        }).join('')
      : '';

  // Embed the exact game card back as a nested SVG at x=24, y=0 (same 60×84 viewBox).
  // Rename the pattern ID to avoid document-level conflicts with the game cards.
  const cardBack = cardBackSvg()
    .replace('<svg class="card-svg"', '<svg x="24" y="0" width="60" height="84"')
    .replace(/cardBackLattice/g, 'deckBackLattice');

  return `<div class="deck-stack-wrap" style="top:${topOffset}" aria-label="Remaining shoe depth" data-shuffling="${g.justReshuffled ? 'true' : 'false'}">
    <svg class="deck-stack-svg" viewBox="0 0 84 96" xmlns="http://www.w3.org/2000/svg">
      ${leftFace}
      ${bottomFace}
      ${cardBack}
      ${edgeLines}
    </svg>
  </div>`;
}

// ── betting simulator screen (Phase 5) ───────────────────────────────────────
const pct = (x) => Math.round(x * 100) + '%';
const fmtMoneySigned = (cents) => (cents < 0 ? '−' : '') + formatMoney(Math.abs(Math.round(cents)));

/** An SVG histogram of the per-session P&L distribution, themed via CSS vars. */
function histogramSvg(r) {
  const { bins, maxCount, lo, hi } = buildHistogram(r.nets, 29);
  if (!bins.length) return '';
  const W = 360, H = 200, padL = 8, padR = 8, padT = 10, padB = 26;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW = chartW / bins.length;
  const xFor = (cents) => padL + (hi === lo ? 0 : ((cents - lo) / (hi - lo)) * chartW);

  const bars = bins
    .map((b, i) => {
      const h = maxCount ? (b.count / maxCount) * chartH : 0;
      const x = padL + i * barW;
      const y = padT + chartH - h;
      const fill = (b.lo + b.hi) / 2 < 0 ? 'var(--lose)' : 'var(--win)';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0.6, barW - 1).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${fill}"/>`;
    })
    .join('');

  // Dashed reference line + label at $0, when the range straddles it.
  let zero = '';
  if (lo < 0 && hi > 0) {
    const zx = xFor(0).toFixed(1);
    zero =
      `<line x1="${zx}" y1="${padT}" x2="${zx}" y2="${padT + chartH}" stroke="var(--paper)" stroke-opacity="0.5" stroke-dasharray="3 3"/>` +
      `<text x="${zx}" y="${H - padB + 15}" text-anchor="middle" class="sim-axis">$0</text>`;
  }
  const axis =
    `<text x="${padL}" y="${H - padB + 15}" text-anchor="start" class="sim-axis">${fmtMoneySigned(lo)}</text>` +
    `<text x="${W - padR}" y="${H - padB + 15}" text-anchor="end" class="sim-axis">${fmtMoneySigned(hi)}</text>`;

  return `<svg class="sim-hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="Session profit-and-loss distribution">${bars}${zero}${axis}</svg>`;
}

function renderSimResult(r) {
  const rules = r.rules;
  const stat = (label, val, cls = '') =>
    `<div class="sim-stat"><span class="sim-stat-val ${cls}">${val}</span><span class="sim-stat-label">${label}</span></div>`;
  return `
    <div class="sim-stats">
      ${stat('Mean', fmtMoneySigned(r.meanCents), signClass(r.meanCents))}
      ${stat('Median', fmtMoneySigned(r.medianCents), signClass(r.medianCents))}
      ${stat('Ruined', pct(r.ruinRate), r.ruinRate > 0 ? 'neg' : '')}
      ${stat('Best', fmtMoneySigned(r.bestCents), 'pos')}
      ${stat('Worst', fmtMoneySigned(r.worstCents), 'neg')}
    </div>
    ${histogramSvg(r)}
    <p class="sim-caption">${BETTING_SYSTEMS[r.system].label}: ${r.count.toLocaleString()} sessions, up to ${r.handsPerSession} completed hands each, from $${rules.table.startingBankroll}. ${pct(r.pctUp)} finished ahead, ${pct(r.pctDown)} behind. Bars left of the $0 line are losing sessions.</p>`;
}

function renderSimulator(g, options) {
  const sim = options.ui?.sim || {};
  const opt = (action, value, current, label) =>
    `<button class="btn sim-opt ${value == current ? 'on' : ''}" data-action="${action}" data-value="${value}">${label}</button>`;
  const systems = Object.entries(BETTING_SYSTEMS).map(([key, s]) => opt('simSystem', key, sim.system, s.label));
  const body = sim.running
    ? `<div class="sim-status" role="status">Completed ${sim.progress ?? 0} of ${sim.sessions} sessions…</div>
      <progress max="${sim.sessions}" value="${sim.progress ?? 0}" aria-label="Simulation progress"></progress>
      ${btn('cancelSim', 'Cancel simulation')}`
    : sim.error ? '<div class="sim-status" role="alert">Simulation could not finish. Please try again.</div>'
    : sim.result
      ? renderSimResult(sim.result)
      : '<div class="sim-status muted">Pick a system and run a simulation to see the outcome distribution.</div>';

  return `<div class="game sim-view">
      <header class="topbar">
        <button class="btn icon" data-action="closeSim" aria-label="Back to the table" title="Back to the table">←</button>
        <span class="sim-title">Betting Simulator</span>
        <span class="rules-chip">${rulesChip(g.rules)}</span>
      </header>
      <div class="sim-scroll">
        <div class="sim-controls">
          <div class="sim-row"><span class="sim-label">System</span>${systems.join('')}</div>
          <div class="sim-row"><span class="sim-label">Sessions</span>${[1000, 2000, 5000].map((v) => opt('simSessions', v, sim.sessions, v.toLocaleString())).join('')}</div>
          <div class="sim-row"><span class="sim-label">Hands each</span>${[50, 100, 200].map((v) => opt('simHands', v, sim.hands, v)).join('')}</div>
          <button class="btn primary sim-run" data-action="runSim"${sim.running ? ' disabled' : ''}>Run simulation</button>
        </div>
        ${body}
      </div>
    </div>`;
}

function renderContent(root, g, options = {}) {
  if (options.ui?.view === 'sim') {
    root.innerHTML = renderSimulator(g, options);
    return;
  }
  const warnings = options.warnings ?? [];
  const muted = options.settings?.muted ?? false;
  const settingsShown = options.ui?.settingsShown ?? false;
  const showStart = options.settings?.showStartingAmount ?? false;
  const startLabel = showStart
    ? `<span class="bankroll-start">start ${formatMoney(g.rules.table.startingBankroll * 100)}</span>`
    : '';
  root.innerHTML = `<div class="game">
      <header class="topbar">
        <span class="bankroll-group">
          <span class="bankroll">${formatMoney(g.bankrollCents)}</span>
          ${startLabel}
        </span>
        <span class="topbar-actions">
          <button class="btn icon" data-action="openSim" aria-label="Betting simulator" title="Betting simulator">📊</button>
          <button class="btn icon" data-action="toggleMute" aria-label="${muted ? 'Unmute' : 'Mute'}" title="${muted ? 'Unmute' : 'Mute'}">${muted ? '🔇' : '🔊'}</button>
          <button class="btn icon" data-action="openSettings" aria-label="Settings" title="Settings">⚙️</button>
          ${
            g.phase === Phase.Betting
              ? '<button class="btn icon" data-action="reset" aria-label="Reset bankroll" title="Reset bankroll">↺</button>'
              : ''
          }
        </span>
      </header>
      ${settingsShown ? '<div class="settings-backdrop" data-action="closeSettings"></div>' : ''}
      ${settingsShown ? renderSettingsPanel(g, options) : ''}
      ${renderCount(g, options)}
      <div class="rules-line"><span class="rules-chip">${rulesChip(g.rules)}</span></div>
      ${g.roundVoided ? '<p class="game-notice" role="status">Shoe ran out. This hand was voided, all stakes refunded, and a fresh shoe shuffled.</p>' : ''}
      ${options.settings && (g.rules.shoe.numberOfDecks !== options.settings.numberOfDecks || g.rules.table.startingBankroll !== options.settings.startingAmount) ? '<p class="game-notice" role="status">Settings will apply at the next betting round.</p>' : ''}
      ${renderPwa(g, options.pwa)}
      ${
        options.ui?.deviation
          ? `<div class="deviation-note" role="status">${selectedStrategyLabel(options)} here was <strong>${ACTION_LABEL[options.ui.deviation]}</strong></div>`
          : ''
      }
      <div class="table-area">
        ${renderDealer(g, options)}
        ${
          options.ui?.reshuffling
            ? renderReshuffleOverlay(options.ui?.reshuffleMessage)
            : g.phase === Phase.RoundOver
              ? renderResultOverlay(g)
              : feltBranding(g.rules)
        }
        ${renderPlayer(g, options)}
      </div>
      ${renderDeckStack(g, options)}
      ${renderControls(g, options)}
      ${
        warnings.length
          ? `<div class="config-warnings" role="status"><strong>Config notes:</strong><ul>${warnings
              .map((w) => `<li>${w}</li>`)
              .join('')}</ul></div>`
          : ''
      }
    </div>`;
}

function renderPwa(g, pwa) {
  if (!pwa) return '';
  if (pwa.updating) return '<div class="pwa-status" role="status">Updating app… Please wait.</div>';
  const stable = g.phase === Phase.Betting || g.phase === Phase.RoundOver;
  return '<div class="pwa-status" role="status">' +
    (pwa.error ? 'Offline setup or update unavailable. Try again while online.' : pwa.ready ? 'Ready for offline play' : '') +
    (pwa.updateAvailable ? btn('installUpdate', stable ? 'Update app' : 'Update after this hand', { disabled: !stable }) : '') + '</div>';
}

/** Whole-tree renders retain keyboard focus and scroll position where possible. */
export function render(root, g, options = {}) {
  const active = root.ownerDocument?.activeElement;
  const action = root.contains?.(active) ? active?.dataset?.action : null;
  const value = active?.dataset?.value;
  const scroll = root.querySelector?.('.settings-panel')?.scrollTop ?? 0;
  renderContent(root, g, options);
  const panel = root.querySelector?.('.settings-panel');
  if (panel) panel.scrollTop = scroll;
  if (action) {
    const matches = [...(root.querySelectorAll?.('[data-action]') ?? [])];
    const next = matches.find((el) => el.dataset.action === action && el.dataset.value === value && !el.disabled);
    (next ?? root.querySelector?.('.controls button:not(:disabled), .sim-run:not(:disabled)'))?.focus({ preventScroll: true });
  }
}
