import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGame, setBet, deal, stand, canRebet, rebetCents, Phase } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { withRules } from './helpers/rules.js';

const FILLER = Array(60).fill('9C');
// Player T+7 = 17 stands vs dealer 6+K = 16, who draws a 5 → 21. Player loses.
const LOSING_ROUND = ['TS', '6H', '7D', 'KC', '5S'];

function playedRound(bet, rules = withRules()) {
  const g = createGame(rules, { cards: parseCards([...LOSING_ROUND, ...FILLER]) });
  setBet(g, bet);
  deal(g);
  stand(g);
  return g;
}

describe('rebet (engine)', () => {
  it('carries the last bet into the next round', () => {
    const g = playedRound(2500);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(rebetCents(g)).toBe(2500);
    expect(canRebet(g)).toBe(true);
  });

  it('caps the carried bet at what the bankroll can afford', () => {
    const g = playedRound(2500);
    g.bankrollCents = 1000;
    expect(rebetCents(g)).toBe(1000);
  });

  it('is unavailable outside round-over or when the bankroll is below the minimum', () => {
    const g = createGame(withRules(), { cards: parseCards(FILLER) });
    expect(canRebet(g)).toBe(false); // betting phase
    const broke = playedRound(2500);
    broke.bankrollCents = 0;
    expect(canRebet(broke)).toBe(false);
  });
});

describe('rebet & deal (controls)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('../src/ui/render.js');
    vi.doUnmock('../src/assets/sound.js');
    vi.resetModules();
  });

  it('deals the next round at the same bet in one tap', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.doMock('../src/ui/render.js', () => ({ render: vi.fn() }));
    const sound = { deal: vi.fn(), chip: vi.fn(), shuffle: vi.fn(), win: vi.fn(), lose: vi.fn(), push: vi.fn() };
    vi.doMock('../src/assets/sound.js', () => ({ sound, unlockAudio: vi.fn(), setMuted: vi.fn() }));
    const { mount } = await import('../src/ui/controls.js');

    const listeners = {};
    const root = { addEventListener: (n, fn) => { listeners[n] = fn; }, querySelector: () => null };
    const g = playedRound(2500);
    const bankrollAfterRound = g.bankrollCents;
    mount(root, g, {});
    listeners.click({ target: { closest: () => ({ dataset: { action: 'rebet' } }) } });

    expect(g.phase).not.toBe(Phase.Betting);
    expect(g.playerHands[0].stakeCents).toBe(2500);
    // Stake committed (any immediate natural would be settled too, hence ≤).
    expect(g.bankrollCents).toBeLessThanOrEqual(bankrollAfterRound);
  });
});
