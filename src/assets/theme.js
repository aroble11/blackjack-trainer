/**
 * theme.js — the SINGLE place to tweak the table's look.
 *
 * Swap these values (or the builders in svg.js) to re-skin the game without
 * touching engine or UI logic. Phase 2 ships programmatic SVG art; you could
 * repoint these at image files later instead.
 */

// Suit pip color: hearts/diamonds red, spades/clubs near-black.
export const SUIT_COLORS = {
  '♠': '#1b1b1b',
  '♣': '#1b1b1b',
  '♥': '#c0392b',
  '♦': '#c0392b',
};

// Card face + back palette.
export const CARD = {
  face: '#f7f5ef',
  edge: 'rgba(0,0,0,0.18)',
  backField: '#7a1f24',
  backInk: '#e8c66a',
};

// Chip palette by denomination: { face, ring }. `ring` is the edge + text color.
export const CHIP_COLORS = {
  5: { face: '#c0392b', ring: '#ffffff' },
  25: { face: '#1e7d4f', ring: '#ffffff' },
  100: { face: '#23262b', ring: '#e8c66a' },
  500: { face: '#6d3a8e', ring: '#ffffff' },
};
