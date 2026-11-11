/**
 * icons.js — the UI's icons as inline SVG, drawn in `currentColor`.
 *
 * Replaces emoji (✋ ✂️ ⏬ 🏳️ 💡 📊 🔊 ⚙️), which every phone maker draws
 * differently and iOS may render in colour regardless of the button styling.
 * These look identical everywhere and follow the button's text colour.
 */

const S = (body) =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const stroke = (d, w = 2) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d) => `<path d="${d}" fill="currentColor"/>`;

/** An 8-tooth gear outline with a centre hole (even-odd fill). */
function gearPath(cx = 12, cy = 12, teeth = 8, ro = 10.5, ri = 7.8, hole = 3.2) {
  const tw = Math.PI / teeth / 2;
  const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i * 2 * Math.PI) / teeth;
    pts.push(pt(ri, a - tw * 1.35), pt(ro, a - tw * 0.75), pt(ro, a + tw * 0.75), pt(ri, a + tw * 1.35));
  }
  const ring = `M${pts.join(' L')} Z`;
  const holeD = `M${cx + hole} ${cy} a${hole} ${hole} 0 1 0 ${-2 * hole} 0 a${hole} ${hole} 0 1 0 ${2 * hole} 0 Z`;
  return `<path d="${ring} ${holeD}" fill="currentColor" fill-rule="evenodd"/>`;
}

const CARD = 'M7.5 3h9a2.5 2.5 0 0 1 2.5 2.5v13a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18.5v-13A2.5 2.5 0 0 1 7.5 3z';
const SPEAKER = 'M3.5 9h4l5-4.5v15l-5-4.5h-4z';

const ICONS = {
  // Open palm — the "stand" hand signal.
  stand: S(
    '<rect x="5" y="7.5" width="3" height="9" rx="1.5" fill="currentColor"/>' +
      '<rect x="8.6" y="3.5" width="3" height="12" rx="1.5" fill="currentColor"/>' +
      '<rect x="12.2" y="3" width="3" height="12" rx="1.5" fill="currentColor"/>' +
      '<rect x="15.8" y="5" width="3" height="11" rx="1.5" fill="currentColor"/>' +
      fill('M5 13h13.8v3.2c0 3.6-2.8 5.8-6.4 5.8h-1.2C7.6 22 5 19.6 5 16.4z')
  ),
  // A card with a plus — take another card.
  hit: S(stroke(CARD) + stroke('M12 8.5v7M8.5 12h7', 2.4)),
  // A card marked 2× — double the bet, one card.
  double: S(
    stroke(CARD) +
      '<text x="12" y="15.6" text-anchor="middle" font-size="9.5" font-weight="800" fill="currentColor" font-family="system-ui, sans-serif">2×</text>'
  ),
  // Two cards fanning apart.
  split: S(
    '<rect x="3" y="5" width="9" height="13.5" rx="1.8" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-14 7.5 11.75)"/>' +
      '<rect x="12" y="5" width="9" height="13.5" rx="1.8" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(14 16.5 11.75)"/>'
  ),
  // White flag on a pole.
  surrender: S(stroke('M6 21.5V3', 2.2) + fill('M6.5 3.5h12l-3 4.5 3 4.5h-12z')),
  // Light bulb.
  hint: S(
    fill('M12 2.5a6.6 6.6 0 0 0-3.9 11.9c.6.5.9 1.1.9 1.8v.8h6v-.8c0-.7.3-1.3.9-1.8A6.6 6.6 0 0 0 12 2.5z') +
      '<rect x="9" y="18" width="6" height="1.7" rx=".85" fill="currentColor"/>' +
      '<rect x="10" y="20.5" width="4" height="1.7" rx=".85" fill="currentColor"/>'
  ),
  // Graduation cap — the Practice screen (stats, chart, drills).
  practice: S(
    fill('M12 4 1.5 9 12 14l10.5-5z') +
      stroke('M6 11.2v4.3c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.3') +
      stroke('M21.5 9.2v5.3', 1.6)
  ),
  // Bar chart — the betting simulator.
  chart: S(
    '<rect x="4" y="12" width="3.6" height="8" rx="1" fill="currentColor"/>' +
      '<rect x="10.2" y="7" width="3.6" height="13" rx="1" fill="currentColor"/>' +
      '<rect x="16.4" y="3.5" width="3.6" height="16.5" rx="1" fill="currentColor"/>'
  ),
  sound: S(fill(SPEAKER) + stroke('M16 9.2a4 4 0 0 1 0 5.6M18.6 6.5a7.6 7.6 0 0 1 0 11')),
  muted: S(fill(SPEAKER) + stroke('M16 9.5l5 5M21 9.5l-5 5')),
  settings: S(gearPath()),
  // Circular arrow — reset the bankroll.
  reset: S(stroke('M19 12a7 7 0 1 1-2.05-4.95') + stroke('M19.2 3.8v3.9h-3.9')),
};

/** The named icon's SVG markup ('' for an unknown name). */
export function icon(name) {
  return ICONS[name] ?? '';
}
