/**
 * svg.js — programmatic SVG for cards and chips, built from theme.js. Each
 * returns an inline SVG string the renderer drops straight into the DOM.
 */
import { SUIT_COLORS, CARD, CHIP_COLORS } from './theme.js';

// Rank/suit index stacked in a corner. Tighter type for the two-char '10'.
const corner = (rank, suit, color) => {
  const rankSize = rank.length > 1 ? 12 : 15;
  return (
    `<text x="10" y="20" text-anchor="middle" font-size="${rankSize}" font-weight="800" fill="${color}">${rank}</text>` +
    `<text x="10" y="31" text-anchor="middle" font-size="10" fill="${color}">${suit}</text>`
  );
};

// A single suit pip; pips on the bottom half of the card sit upside-down, as on
// a real deck, so the card reads the same from either end.
const pip = (x, y, suit, color, size = 13) =>
  `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${size}" fill="${color}"${
    y > 42 ? ` transform="rotate(180 ${x} ${y})"` : ''
  }>${suit}</text>`;

// Pip-field geometry on the 60×84 face. Three columns; rows for the classic
// 2–10 arrangements (columns of three, columns of four, and the centre fillers).
const COL = { L: 21, C: 30, R: 39 };
const ROW = { top: 28, mid: 42, bot: 56, up: 35, lo: 49, q1: 28, q2: 37.5, q3: 46.5, q4: 56, ut: 32.75, lt: 51.25 };
const { L, C, R } = COL;
const { top, mid, bot, up, lo, q1, q2, q3, q4, ut, lt } = ROW;

// Each number rank → list of [x, y] pip centres, in the conventional layout.
const PIPS = {
  '2': [[C, top], [C, bot]],
  '3': [[C, top], [C, mid], [C, bot]],
  '4': [[L, top], [R, top], [L, bot], [R, bot]],
  '5': [[L, top], [R, top], [C, mid], [L, bot], [R, bot]],
  '6': [[L, top], [R, top], [L, mid], [R, mid], [L, bot], [R, bot]],
  '7': [[L, top], [R, top], [C, up], [L, mid], [R, mid], [L, bot], [R, bot]],
  '8': [[L, top], [R, top], [C, up], [L, mid], [R, mid], [C, lo], [L, bot], [R, bot]],
  '9': [[L, q1], [R, q1], [L, q2], [R, q2], [C, mid], [L, q3], [R, q3], [L, q4], [R, q4]],
  '10': [[L, q1], [R, q1], [C, ut], [L, q2], [R, q2], [L, q3], [R, q3], [C, lt], [L, q4], [R, q4]],
};

const isRoyal = (rank) => rank === 'J' || rank === 'Q' || rank === 'K';

// A stylized court card: a parchment portrait frame with a heraldic emblem
// (crown for K/Q, shield for J) over a large suit pip. Legible at 46px, no art
// files. `GOLD` accents come from the shared card palette (CARD.backInk).
const GOLD = CARD.backInk;
function royal(rank, suit, color) {
  const crown =
    `<path d="M21 39 L24 31 L27 36 L30 30 L33 36 L36 31 L39 39 Z" fill="${GOLD}" stroke="${color}" stroke-width="0.7" stroke-linejoin="round"/>` +
    `<rect x="21" y="38.5" width="18" height="3.5" rx="0.8" fill="${GOLD}" stroke="${color}" stroke-width="0.7"/>` +
    `<circle cx="24" cy="31" r="1.1" fill="${color}"/><circle cx="30" cy="30" r="1.2" fill="${color}"/><circle cx="36" cy="31" r="1.1" fill="${color}"/>`;
  const shield =
    `<path d="M23 31 H37 V38 Q30 45 23 38 Z" fill="${GOLD}" stroke="${color}" stroke-width="0.7" stroke-linejoin="round"/>` +
    `<path d="M30 31 V42" stroke="${color}" stroke-width="0.7"/><path d="M23 34.5 H37" stroke="${color}" stroke-width="0.7"/>`;
  const emblem = rank === 'J' ? shield : crown;
  return (
    `<rect x="15" y="23" width="30" height="38" rx="3" fill="#f1e9d2" stroke="${GOLD}" stroke-width="0.9"/>` +
    `<rect x="17" y="25" width="26" height="34" rx="2" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.55"/>` +
    emblem +
    `<text x="30" y="52" text-anchor="middle" dominant-baseline="central" font-size="15" fill="${color}">${suit}</text>`
  );
}

/** A card face: pip layout for 2–10, a big centre pip for the ace, court art for J/Q/K. */
export function cardFaceSvg(card) {
  const color = SUIT_COLORS[card.suit] ?? '#1b1b1b';
  let body;
  if (isRoyal(card.rank)) {
    body = royal(card.rank, card.suit, color);
  } else if (card.rank === 'A') {
    body = pip(30, 42, card.suit, color, 30);
  } else {
    body = (PIPS[card.rank] ?? []).map(([x, y]) => pip(x, y, card.suit, color)).join('');
  }
  return `<svg class="card-svg" viewBox="0 0 60 84" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${card.rank} of ${card.suit}">
    <rect x="1.5" y="1.5" width="57" height="81" rx="7" fill="${CARD.face}" stroke="${CARD.edge}" stroke-width="1"/>
    <g>${corner(card.rank, card.suit, color)}</g>
    ${body}
    <g transform="rotate(180 30 42)">${corner(card.rank, card.suit, color)}</g>
  </svg>`;
}

/** Face-down card back: concentric gold frames over a fine diamond lattice. */
export function cardBackSvg() {
  return `<svg class="card-svg" viewBox="0 0 60 84" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="face down card">
    <defs>
      <pattern id="cardBackLattice" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45 0 0)">
        <rect width="9" height="9" fill="${CARD.backField}"/>
        <circle cx="4.5" cy="4.5" r="1.3" fill="${CARD.backInk}" opacity="0.45"/>
      </pattern>
    </defs>
    <rect x="1.5" y="1.5" width="57" height="81" rx="7" fill="${CARD.backField}"/>
    <rect x="1.5" y="1.5" width="57" height="81" rx="7" fill="url(#cardBackLattice)" stroke="${CARD.face}" stroke-width="2"/>
    <rect x="6" y="6" width="48" height="72" rx="4" fill="none" stroke="${CARD.backInk}" stroke-width="1.5" opacity="0.8"/>
    <rect x="9" y="9" width="42" height="66" rx="3" fill="none" stroke="${CARD.backInk}" stroke-width="0.7" opacity="0.55"/>
    <path d="M30 22 L42 42 L30 62 L18 42 Z" fill="none" stroke="${CARD.backInk}" stroke-width="1.5" opacity="0.85"/>
    <path d="M30 30 L37 42 L30 54 L23 42 Z" fill="${CARD.backInk}" opacity="0.25"/>
  </svg>`;
}

/** A casino chip: colored rim with edge spots and a light center disc showing the value. */
export function chipSvg(value) {
  const { face, ring } = CHIP_COLORS[value] ?? { face: '#444', ring: '#fff' };
  // Six evenly-spaced edge "spots" — the classic chip stripe pattern.
  const spots = Array.from({ length: 6 }, (_, i) =>
    `<rect x="22" y="0.6" width="4" height="7" rx="1.6" fill="${ring}" transform="rotate(${i * 60} 24 24)"/>`
  ).join('');
  return `<svg class="chip-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="$${value} chip">
    <circle cx="24" cy="24" r="23" fill="${face}"/>
    ${spots}
    <circle cx="24" cy="24" r="18" fill="${face}"/>
    <circle cx="24" cy="24" r="14.5" fill="${CARD.face}" stroke="${ring}" stroke-width="1.4"/>
    <text x="24" y="24" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="800" fill="${face}">${value}</text>
  </svg>`;
}
