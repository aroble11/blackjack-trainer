/**
 * blackjack-rules.config.js
 * ─────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for how the game plays.
 *
 * Everything the game engine, the strategy advisor, the odds tracker, and the
 * betting simulator needs to know about the rules lives here. To change how the
 * game behaves, edit a value below — you should never have to touch the game
 * logic itself.
 *
 * Each option lists its valid values and notes whether it meaningfully affects
 * the house edge (and therefore the strategy hints). Defaults below describe a
 * solid, common Las Vegas–style game.
 *
 * At startup the engine runs a capability guard (src/engine/validateRules.js)
 * that warns if the config enables anything not implemented yet (continuous
 * shuffle, European no-peek, early surrender, re-split/hit aces), instead of
 * silently mis-playing. Rules are bundled at build time — after editing this
 * file, run `npm run build` (in dev, Vite hot-reloads automatically).
 * ─────────────────────────────────────────────────────────────────────────
 */

export const RULES = {

  // ── SHOE / DECKS ────────────────────────────────────────────────────────
  shoe: {
    // How many 52-card decks are shuffled together.
    // Valid: 1, 2, 4, 6, 8.  Fewer decks = slightly better for the player.
    // (Affects house edge AND the odds/counting tracker.)
    numberOfDecks: 6,

    // Fraction of the shoe dealt before reshuffling (the "penetration").
    // Valid: 0.5 to 0.9.  Deeper penetration makes counting more meaningful.
    // Ignored if continuousShuffle is true.
    penetration: 0.75,

    // If true, the shoe reshuffles every hand (a Continuous Shuffling Machine).
    // Set true to disable counting entirely; false for a realistic depleting shoe.
    // (Your odds tracker only does anything when this is false.)
    continuousShuffle: false,
  },

  // ── DEALER BEHAVIOR ───────────────────────────────────────────────────────
  dealer: {
    // Does the dealer HIT a soft 17 (e.g. Ace+6)?
    // true  = "H17" (worse for player, common on $5 tables)
    // false = "S17" dealer stands on all 17s (better for player)
    // (Meaningfully affects house edge AND strategy hints.)
    hitsSoft17: false,

    // Does the dealer check the hole card for blackjack before players act?
    // true  = US-style peek (you lose only your original bet to a dealer BJ)
    // false = European "no-hole-card" style
    // (Affects strategy hints.)
    peeksForBlackjack: true,
  },

  // ── PAYOUTS ───────────────────────────────────────────────────────────────
  payouts: {
    // What a player blackjack pays, as a multiple of your bet.
    // 1.5 = the good "3:2" game.   1.2 = the bad "6:5" game.
    // (This is one of the LARGEST single factors in the house edge.)
    blackjack: 1.5,

    // What insurance pays if the dealer has blackjack. Standard is 2:1.
    insurance: 2.0,

    // A normal (non-blackjack) winning hand. Standard is 1:1.
    regularWin: 1.0,
  },

  // ── PLAYER OPTIONS ────────────────────────────────────────────────────────
  player: {
    // Can the player double down at all?
    doubleAllowed: true,

    // Which starting totals you're allowed to double on.
    // 'any'   = any first two cards (most generous)
    // '9-11'  = only hard 9, 10, 11
    // '10-11' = only hard 10, 11 (most restrictive)
    // (Affects strategy hints.)
    doubleRestriction: 'any',

    // Can you double AFTER splitting a pair? ("DAS")
    // true is more player-friendly. (Affects strategy hints.)
    doubleAfterSplit: true,

    // Can the player split pairs?
    splitAllowed: true,

    // Maximum number of hands you can end up with from splitting.
    // Valid: 2, 3, or 4. (4 means up to 3 re-splits.)
    maxSplitHands: 4,

    // Can you re-split a pair of Aces?  Usually false.
    resplitAces: false,

    // Can you hit split Aces, or do you get exactly one card each?
    // Usually false (one card only). (Affects strategy hints.)
    hitSplitAces: false,

    // Surrender option (give up half your bet to fold a bad hand).
    // 'none'  = not offered
    // 'late'  = surrender allowed AFTER dealer checks for blackjack (common)
    // 'early' = surrender allowed BEFORE the peek (rare, player-friendly)
    // (Affects strategy hints.)
    surrender: 'late', // late surrender: forfeit half after the dealer peek

    // Is insurance offered when the dealer shows an Ace?
    insuranceAllowed: true, // offer insurance when the dealer shows an Ace
  },

  // ── TABLE & BETTING LIMITS ────────────────────────────────────────────────
  // These don't change the odds of a hand, but they drive the chip UI and the
  // betting simulator. The max bet is what eventually CAPS a Martingale run —
  // once a doubled bet would exceed it, the progression can't continue.
  table: {
    minBet: 5,                       // table minimum (your friend's $5)
    maxBet: 500,                     // table maximum — the Martingale ceiling
    startingBankroll: 500,           // chips you begin a session with
    chipDenominations: [5, 25, 100, 500], // which chip values the UI shows
    name: 'BLACKJACK',               // table name printed on the felt (purely cosmetic)
  },

  // ── TEACHING / APP BEHAVIOR ───────────────────────────────────────────────
  // These are about the LEARNING app, not the casino rules. Toggle features on
  // or off as your skill grows.
  teaching: {
    // Show the optimal basic-strategy move as a hint before you act.
    showBasicStrategyHints: true,

    // When a hint is shown, also explain WHY it's the better play.
    explainHints: true,

    // Show a live card-counting readout as the shoe depletes.
    // (Only does anything when shoe.continuousShuffle is false.)
    showCardCounting: true,

    // Which counting system the readout uses.
    // 'none' | 'hi-lo' | 'ko' | 'hi-opt-i'   ('hi-lo' is the standard starting point)
    countingSystem: 'hi-lo',

    // Also show the "true count" (running count adjusted for decks remaining).
    showTrueCount: true,

    // Flag it when you make a move that differs from basic strategy.
    warnOnStrategyDeviation: true,
  },
};

export default RULES;
