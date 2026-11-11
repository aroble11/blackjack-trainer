/**
 * svg.js — programmatic SVG for cards and chips, built from theme.js. Each
 * returns an inline SVG string the renderer drops straight into the DOM.
 */
import { SUIT_COLORS, CARD, CHIP_COLORS } from './theme.js';

// Suit shapes as SVG paths in a 100×100 box (centred on 50,50). Drawn as paths
// rather than ♠♥♦♣ text because iOS can swap those characters for colour emoji,
// which ignore the fill colour and look different on every phone.
const circle = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
const SUIT_PATHS = {
  '♥': 'M50 92 C22 70 4 52 4 32 C4 16 16 6 29 6 C39 6 46 12 50 21 C54 12 61 6 71 6 C84 6 96 16 96 32 C96 52 78 70 50 92 Z',
  '♦': 'M50 2 L86 50 L50 98 L14 50 Z',
  '♠':
    'M50 3 C80 30 96 46 96 62 C96 76 85 85 72 85 C63 85 56 80 53 73 C54 84 58 91 66 97 L34 97 ' +
    'C42 91 46 84 47 73 C44 80 37 85 28 85 C15 85 4 76 4 62 C4 46 20 30 50 3 Z',
  '♣':
    circle(50, 27, 21) + circle(27, 58, 21) + circle(73, 58, 21) + circle(50, 52, 12) +
    'M46 58 C46 80 41 90 32 97 L68 97 C59 90 54 80 54 58 Z',
};

/** A suit shape of the given size centred on (x, y), optionally turned upside-down. */
function suitShape(x, y, suit, color, size, flip = false) {
  const d = SUIT_PATHS[suit];
  if (!d) {
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${size}" fill="${color}">${suit}</text>`;
  }
  const s = size / 100;
  const rot = flip ? ` rotate(180 ${x} ${y})` : '';
  return `<path d="${d}" fill="${color}" transform="${rot} translate(${x - size / 2} ${y - size / 2}) scale(${s})"/>`;
}

// Rank/suit index stacked in a corner. Tighter type for the two-char '10'.
const corner = (rank, suit, color) => {
  const rankSize = rank.length > 1 ? 12 : 15;
  return (
    `<text x="10" y="20" text-anchor="middle" font-size="${rankSize}" font-weight="800" fill="${color}">${rank}</text>` +
    suitShape(10, 27.5, suit, color, 8)
  );
};

// A single suit pip; pips on the bottom half of the card sit upside-down, as on
// a real deck, so the card reads the same from either end. `size` is the glyph's
// nominal font size; the drawn shape is ~3/4 of it, matching the old text pips.
const pip = (x, y, suit, color, size = 13) => suitShape(x, y, suit, color, size * 0.75, y > 42);

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
    suitShape(30, 52, suit, color, 11)
  );
}

/** A card face: pip layout for 2–10, a big centre pip for the ace, court art for J/Q/K. */
export function cardFaceSvg(card) {
  const color = SUIT_COLORS[card.suit] ?? '#1b1b1b';
  let body;
  if (isRoyal(card.rank)) {
    body = royal(card.rank, card.suit, color);
  } else if (card.rank === 'A') {
    body = suitShape(30, 42, card.suit, color, 22);
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
