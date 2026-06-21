/**
 * cards.js — the card model and blackjack value mapping.
 *
 * A card is a plain object: { rank, suit }.
 *   rank: 'A' | '2' .. '10' | 'J' | 'Q' | 'K'
 *   suit: '♠' | '♥' | '♦' | '♣'
 *
 * This module is pure data + helpers; it knows nothing about hands, the shoe,
 * or the rules.
 */

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const SUIT_BY_LETTER = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RED_SUITS = new Set(['♥', '♦']);

/**
 * Blackjack value of a single card. Aces are returned as 11 here; hand.js is
 * responsible for downgrading an ace to 1 when 11 would bust.
 */
export function cardValue(card) {
  if (card.rank === 'A') return 11;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank); // '2'..'10'
}

export function isAce(card) {
  return card.rank === 'A';
}

/** True for any 10-valued card (10, J, Q, K) — used for split-by-value. */
export function isTenValue(card) {
  return cardValue(card) === 10;
}

export function isRed(card) {
  return RED_SUITS.has(card.suit);
}

/** Short label for display/debugging, e.g. "A♠", "10♥". */
export function cardLabel(card) {
  return `${card.rank}${card.suit}`;
}

/**
 * Parse a compact code into a card, for tests and pre-stacked shoes.
 * Accepts letter suits (S/H/D/C) and 'T' as an alias for the ten:
 *   'AS' -> A♠,  '10H' -> 10♥,  'TD' -> 10♦
 */
export function parseCard(code) {
  const suitChar = code.slice(-1).toUpperCase();
  let rank = code.slice(0, -1).toUpperCase();
  if (rank === 'T') rank = '10';
  const suit = SUIT_BY_LETTER[suitChar] ?? suitChar;
  return { rank, suit };
}

export function parseCards(codes) {
  return codes.map(parseCard);
}
