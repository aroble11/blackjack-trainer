import { describe, it, expect } from 'vitest';
import { createGame, setBet, deal, Phase } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import {
  normalizeSettings, applyPendingSettings, settingsPending, applyTeaching,
} from '../src/persistence/settings.js';
import { recommend } from '../src/teaching/strategies.js';
import { parseCard } from '../src/engine/cards.js';
import { withRules } from './helpers/rules.js';

const FILLER = Array(60).fill('9C');

describe('table rules in Settings', () => {
  it('defaults to the config and rejects unknown values', () => {
    const rules = withRules();
    const s = normalizeSettings({ tableRules: { hitsSoft17: 'yes', blackjackPayout: 2, surrender: 'early', doubleRestriction: '8-11' } }, rules, []);
    expect(s.tableRules).toEqual({
      hitsSoft17: rules.dealer.hitsSoft17,
      blackjackPayout: rules.payouts.blackjack,
      surrender: rules.player.surrender === 'none' ? 'none' : 'late', // 'early' isn't offered
      doubleAfterSplit: rules.player.doubleAfterSplit,
      doubleRestriction: 'any',
    });
    expect(s.teaching.showBasicStrategyHints).toBe(!!rules.teaching?.showBasicStrategyHints);
  });

  it('waits for the betting round, then applies — and the advisor follows', () => {
    const rules = withRules({ dealer: { hitsSoft17: false } });
    const g = createGame(rules, { cards: parseCards(FILLER) });
    const settings = normalizeSettings({}, rules, []);
    setBet(g, 500);
    deal(g); // 9,9 vs 9 → player's turn
    expect(g.phase).toBe(Phase.PlayerTurn);

    settings.tableRules.hitsSoft17 = true;
    settings.tableRules.blackjackPayout = 1.2;
    expect(settingsPending(settings, g.rules)).toBe(true);
    expect(applyPendingSettings(g, settings)).toBe(false); // mid-hand: nothing applied
    expect(g.rules.dealer.hitsSoft17).toBe(false);

    g.phase = Phase.Betting; // (as after nextRound)
    applyPendingSettings(g, settings);
    expect(g.rules.dealer.hitsSoft17).toBe(true);
    expect(g.rules.payouts.blackjack).toBe(1.2);
    expect(settingsPending(settings, g.rules)).toBe(false);

    // A rule-sensitive cell: 11 vs A doubles under H17, hits under S17 (6 decks).
    const h17 = recommend('basic', parseCards(['6S', '5H']), parseCard('AD'), g.rules).action;
    const s17 = recommend('basic', parseCards(['6S', '5H']), parseCard('AD'), withRules({ dealer: { hitsSoft17: false } })).action;
    expect(h17).toBe('double');
    expect(s17).toBe('hit');
  });

  it('teaching toggles apply immediately', () => {
    const rules = withRules();
    const settings = normalizeSettings({}, rules, []);
    settings.teaching.showBasicStrategyHints = false;
    applyTeaching(settings.teaching, rules);
    expect(rules.teaching.showBasicStrategyHints).toBe(false);
  });
});
