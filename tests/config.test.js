import { describe, it, expect } from 'vitest';
import RULES from '../config/blackjack-rules.config.js';
import { validateRules } from '../src/engine/validateRules.js';

describe('config + capability guard', () => {
  it('ships the Phase 1 MVP defaults (surrender + insurance off)', () => {
    expect(RULES.player.surrender).toBe('none');
    expect(RULES.player.insuranceAllowed).toBe(false);
  });

  it('produces no warnings for the shipped MVP config', () => {
    expect(validateRules(RULES).warnings).toEqual([]);
  });

  it('warns once per unsupported option when re-enabled', () => {
    const { warnings } = validateRules({
      shoe: { continuousShuffle: true },
      dealer: { peeksForBlackjack: false },
      player: {
        surrender: 'late',
        insuranceAllowed: true,
        resplitAces: true,
        hitSplitAces: true,
      },
    });
    expect(warnings).toHaveLength(6);
  });

  it('does not warn for supported settings', () => {
    const { warnings } = validateRules({
      shoe: { continuousShuffle: false },
      dealer: { peeksForBlackjack: true },
      player: {
        surrender: 'none',
        insuranceAllowed: false,
        resplitAces: false,
        hitSplitAces: false,
      },
    });
    expect(warnings).toEqual([]);
  });
});
