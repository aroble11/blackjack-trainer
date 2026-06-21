/**
 * render.js — draw the whole game from engine state into the DOM.
 *
 * Pure rendering: it reads game state and the engine's can*() legality helpers
 * (never re-deriving rules) and returns nothing but DOM. The full subtree is
 * rebuilt each call; controls.js drives re-renders via event delegation.
 */

import { handValue } from '../engine/hand.js';
import { isRed, cardValue } from '../engine/cards.js';
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
} from '../engine/game.js';

const cardFront = (card) =>
  `<div class="card ${isRed(card) ? 'red' : 'black'}">
     <span class="rank">${card.rank}</span><span class="suit">${card.suit}</span>
   </div>`;

const cardBack = () => `<div class="card back" aria-label="face down card"></div>`;

function totalLabel(cards) {
  const { total, soft } = handValue(cards);
  if (total > 21) return `${total} · bust`;
  return soft ? `${total} · soft` : `${total}`;
}

function renderDealer(g) {
  const hidden = !g.dealerHoleRevealed && g.dealerCards.length > 0;
  let cardsHtml = '';
  let totalHtml = '';
  if (hidden) {
    cardsHtml = cardFront(g.dealerCards[0]) + cardBack();
  } else if (g.dealerCards.length) {
    cardsHtml = g.dealerCards.map(cardFront).join('');
    totalHtml = `<span class="total">${totalLabel(g.dealerCards)}</span>`;
  }
  return `<section class="dealer-area">
      <h2 class="area-label">Dealer ${totalHtml}</h2>
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

function renderPlayerHand(g, hand, index) {
  const active = g.phase === Phase.PlayerTurn && index === g.activeHandIndex;
  const badge = hand.outcome
    ? `<span class="badge ${hand.outcome}">${OUTCOME_TEXT[hand.outcome]}</span>`
    : '';
  return `<div class="hand-block ${active ? 'active' : ''}">
      <div class="hand">${hand.cards.map(cardFront).join('')}</div>
      <div class="hand-meta">
        <span class="total">${totalLabel(hand.cards)}</span>
        <span class="stake">${formatMoney(hand.stakeCents)}</span>
        ${badge}
      </div>
    </div>`;
}

function renderPlayer(g) {
  const body = g.playerHands.length
    ? g.playerHands.map((h, i) => renderPlayerHand(g, h, i)).join('')
    : '<div class="hand-block empty">Place a bet, then deal.</div>';
  return `<section class="player-area"><h2 class="area-label">You</h2>${body}</section>`;
}

function btn(action, label, { disabled = false, value, cls = '' } = {}) {
  const dataValue = value != null ? ` data-value="${value}"` : '';
  return `<button class="btn ${cls}" data-action="${action}"${dataValue}${
    disabled ? ' disabled' : ''
  }>${label}</button>`;
}

function renderControls(g) {
  if (g.phase === Phase.Betting) {
    if (isBroke(g)) {
      return `<footer class="controls">
          <p class="broke-msg">Out of chips.</p>
          ${btn('rebuy', `Re-buy ${formatMoney(g.rules.table.startingBankroll * 100)}`, { cls: 'primary' })}
        </footer>`;
    }
    const chips = g.rules.table.chipDenominations
      .map((d) =>
        btn('chip', `$${d}`, {
          value: d * 100,
          cls: 'chip',
          disabled: g.bankrollCents < d * 100,
        })
      )
      .join('');
    return `<footer class="controls">
        <div class="chips">${chips}</div>
        <div class="bet-row">
          <span class="bet-amount">Bet ${formatMoney(g.betCents)}</span>
          ${btn('clearBet', 'Clear', { disabled: g.betCents === 0 })}
          ${btn('deal', 'Deal', { disabled: !canDeal(g), cls: 'primary' })}
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
        ${btn('hit', 'Hit', { disabled: !canHit(g) })}
        ${btn('stand', 'Stand', { disabled: !canStand(g) })}
        ${btn('double', 'Double', { disabled: !canDouble(g) })}
        ${btn('split', 'Split', { disabled: !canSplit(g) })}
        ${canSurrender(g) ? btn('surrender', 'Surrender') : ''}
      </footer>`;
  }

  // RoundOver (DealerTurn is transient and never rendered).
  return `<footer class="controls">
      ${btn('next', 'Next hand', { cls: 'primary' })}
    </footer>`;
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

export function render(root, g, options = {}) {
  const warnings = options.warnings ?? [];
  root.innerHTML = `<div class="game">
      <header class="topbar">
        <span class="bankroll">${formatMoney(g.bankrollCents)}</span>
        <span class="topbar-actions">
          <span class="rules-chip">${rulesChip(g.rules)}</span>
          ${
            g.phase === Phase.Betting
              ? '<button class="btn icon" data-action="reset" aria-label="Reset bankroll" title="Reset bankroll">↺</button>'
              : ''
          }
        </span>
      </header>
      <div class="table-area">
        ${renderDealer(g)}
        ${renderPlayer(g)}
      </div>
      ${renderControls(g)}
      ${
        warnings.length
          ? `<div class="config-warnings" role="status"><strong>Config notes:</strong><ul>${warnings
              .map((w) => `<li>${w}</li>`)
              .join('')}</ul></div>`
          : ''
      }
    </div>`;
}
