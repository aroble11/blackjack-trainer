/**
 * svg.js — programmatic SVG for cards and chips, built from theme.js. Each
 * returns an inline SVG string the renderer drops straight into the DOM.
 */
import { SUIT_COLORS, CARD, CHIP_COLORS } from './theme.js';

const corner = (rank, suit, color) =>
  `<text x="11" y="20" text-anchor="middle" font-size="15" font-weight="800" fill="${color}">${rank}</text>` +
  `<text x="11" y="32" text-anchor="middle" font-size="11" fill="${color}">${suit}</text>`;

/** A bold-index card face: rank+suit in two corners, one big center pip. */
export function cardFaceSvg(card) {
  const color = SUIT_COLORS[card.suit] ?? '#1b1b1b';
  return `<svg class="card-svg" viewBox="0 0 60 84" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${card.rank} of ${card.suit}">
    <rect x="1.5" y="1.5" width="57" height="81" rx="7" fill="${CARD.face}" stroke="${CARD.edge}" stroke-width="1"/>
    <g>${corner(card.rank, card.suit, color)}</g>
    <text x="30" y="44" text-anchor="middle" dominant-baseline="central" font-size="34" fill="${color}">${card.suit}</text>
    <g transform="rotate(180 30 42)">${corner(card.rank, card.suit, color)}</g>
  </svg>`;
}

/** Face-down card back. */
export function cardBackSvg() {
  return `<svg class="card-svg" viewBox="0 0 60 84" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="face down card">
    <rect x="1.5" y="1.5" width="57" height="81" rx="7" fill="${CARD.backField}" stroke="${CARD.face}" stroke-width="2"/>
    <rect x="6" y="6" width="48" height="72" rx="4" fill="none" stroke="${CARD.backInk}" stroke-width="1.5" opacity="0.7"/>
    <path d="M30 24 L40 42 L30 60 L20 42 Z" fill="none" stroke="${CARD.backInk}" stroke-width="1.5" opacity="0.85"/>
  </svg>`;
}

/** A casino chip with a segmented edge and the value in the middle. */
export function chipSvg(value) {
  const { face, ring } = CHIP_COLORS[value] ?? { face: '#444', ring: '#fff' };
  return `<svg class="chip-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="$${value} chip">
    <circle cx="24" cy="24" r="23" fill="${face}"/>
    <circle cx="24" cy="24" r="21" fill="none" stroke="${ring}" stroke-width="4" stroke-dasharray="8 8"/>
    <circle cx="24" cy="24" r="14.5" fill="${face}" stroke="${ring}" stroke-width="1.5"/>
    <text x="24" y="24" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="800" fill="${ring}">${value}</text>
  </svg>`;
}
