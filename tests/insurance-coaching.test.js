import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGame, setBet, deal, Phase } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { render } from '../src/ui/render.js';
import { withRules } from './helpers/rules.js';

const FILLER = Array(60).fill('9C');
const insuranceRules = () =>
  withRules({
    player: { insuranceAllowed: true },
    teaching: { showBasicStrategyHints: true, explainHints: true, warnOnStrategyDeviation: true },
  });
// Player T+7, dealer A up (hole 9): the insurance prompt.
const atInsurance = () => {
  const g = createGame(insuranceRules(), { cards: parseCards(['TS', 'AH', '7D', '9C', ...FILLER]) });
  setBet(g, 2000);
  deal(g);
  return g;
};

describe('insurance coaching', () => {
  it('the hint panel on the insurance prompt recommends declining and says why', () => {
    const g = atInsurance();
    expect(g.phase).toBe(Phase.Insurance);
    const root = { innerHTML: '' };
    render(root, g, { ui: { hintShown: true }, settings: { showCardCount: false } });
    expect(root.innerHTML).toContain('No insurance');
    expect(root.innerHTML).toContain('33%');
    expect(root.innerHTML).toContain('data-action="hint"');
  });

  describe('taking insurance', () => {
    afterEach(() => {
      vi.doUnmock('../src/ui/render.js');
      vi.doUnmock('../src/assets/sound.js');
      vi.resetModules();
    });

    it('is flagged with its computed cost and counted in stats', async () => {
      vi.resetModules();
      vi.doMock('../src/ui/render.js', () => ({ render: vi.fn() }));
      const sound = { deal: vi.fn(), chip: vi.fn(), shuffle: vi.fn(), win: vi.fn(), lose: vi.fn(), push: vi.fn() };
      vi.doMock('../src/assets/sound.js', () => ({ sound, unlockAudio: vi.fn(), setMuted: vi.fn() }));
      const { mount } = await import('../src/ui/controls.js');
      const listeners = {};
      const root = { addEventListener: (n, fn) => { listeners[n] = fn; }, querySelector: () => null };
      const g = atInsurance();
      const options = {};
      mount(root, g, options);
      listeners.click({ target: { closest: () => ({ dataset: { action: 'takeInsurance' } }) } });

      expect(options.ui.deviation).toMatchObject({ kind: 'insurance', correct: false, stakeCents: 1000 });
      expect(options.ui.deviation.ev).toBeLessThan(0);
      expect(options.stats.insurance).toEqual({ offered: 1, declined: 0 });
    });
  });
});
