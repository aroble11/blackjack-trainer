/**
 * user-strategies.config.js
 * ─────────────────────────────────────────────────────────────────────────
 * YOUR OWN hint strategies, hand-authored as data.
 *
 * Each entry here appears in Settings → Teaching → "Hint strategy", alongside
 * the built-in "Basic strategy" (which is COMPUTED from the rules and always
 * available). Switching strategies only changes what the hint panel and the
 * deviation note recommend — gameplay itself is untouched.
 *
 * A strategy is a chart: rows are what YOU hold, columns are the dealer's
 * upcard. Lookup order for a hand: pairs (two equal-value cards) → soft totals
 * (an ace counted as 11) → hard totals.
 *
 *   id     unique kebab-case name ('basic' is reserved)
 *   label  shown in the dropdown and on the hint panel
 *   note   optional one-liner shown under the hint as the "why"
 *   hard   rows keyed by hard total 4–21
 *   soft   rows keyed by soft total 12–21 (soft 13 = A,2 ... soft 21 = A,10)
 *   pairs  rows keyed by the paired card's value: '2'–'10' or 'A'
 *          (leave a pair out — or the whole section empty — and the hand falls
 *          through to the soft/hard rows instead)
 *
 * Each row is either ONE code (applies against every upcard):
 *     16: 'H',
 * or a per-upcard map, keyed '2'–'10' and 'A':
 *     16: { 2: 'S', 3: 'S', 4: 'S', 5: 'S', 6: 'S', 7: 'H', 8: 'H', 9: 'H', 10: 'H', A: 'H' },
 *
 * Codes (composites fall back automatically when the move isn't allowed):
 *   H    hit
 *   S    stand
 *   D    double — else hit
 *   Ds   double — else stand
 *   P    split (pairs section only) — else use the soft/hard row
 *   R    surrender — else hit
 *   Rs   surrender — else stand
 *
 * Any hand a chart doesn't cover falls back to the computed basic strategy
 * (and the hint says so). Malformed entries are skipped with a console
 * warning. Like the rules config, this file is bundled at build time — the
 * dev server hot-reloads it; a production build needs `npm run build`.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const USER_STRATEGIES = [
  // TEMPLATE — copy this entry to start your own strategy.
  // "Mimic the dealer": hit to 17, stand on all 17s, never double or split.
  // A classic baseline for feeling how much basic strategy actually earns.
  {
    id: 'mimic-dealer',
    label: 'Mimic the dealer',
    note: 'Play like the house: hit below 17, stand on any 17 or more, never double or split.',
    hard: {
      4: 'H', 5: 'H', 6: 'H', 7: 'H', 8: 'H', 9: 'H', 10: 'H', 11: 'H',
      12: 'H', 13: 'H', 14: 'H', 15: 'H', 16: 'H',
      17: 'S', 18: 'S', 19: 'S', 20: 'S', 21: 'S',
    },
    soft: {
      12: 'H', 13: 'H', 14: 'H', 15: 'H', 16: 'H',
      17: 'S', 18: 'S', 19: 'S', 20: 'S', 21: 'S',
    },
    pairs: {}, // never split — pairs play as their total via the rows above
  },
];

export default USER_STRATEGIES;
