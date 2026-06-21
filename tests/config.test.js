import { describe, it, expect } from 'vitest';
import RULES from '../config/blackjack-rules.config.js';
import { validateRules } from '../src/engine/validateRules.js';

describe('config + capability guard', () => {
  it('ships the fast-follow defaults (late surrender + insurance on)', () => {
    expect(RULES.player.surrender).toBe('late');
    expect(RULES.player.insuranceAllowed).toBe(true);
  });

  it('produces no warnings for the shipped config', () => {
    expect(validateRules(RULES).warnings).toEqual([]);
  });

  it('warns once per unsupported option', () => {
    const { warnings } = validateRules({
      shoe: { continuousShuffle: true },
      dealer: { peeksForBlackjack: false },
      player: {
        surrender: 'early',
        resplitAces: true,
        hitSplitAces: true,
      },
    });
    expect(warnings).toHaveLength(5);
  });

  it('does not warn for supported settings', () => {
    const { warnings } = validateRules({
      shoe: { continuousShuffle: false },
      dealer: { peeksForBlackjack: true },
      player: {
        surrender: 'late',
        insuranceAllowed: true,
        resplitAces: false,
        hitSplitAces: false,
      },
    });
    expect(warnings).toEqual([]);
  });
});
