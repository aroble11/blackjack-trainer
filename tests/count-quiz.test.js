import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGame, Phase } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { countFromShoe } from '../src/teaching/counting.js';
import { QUIZ_EVERY, normalizeSettings } from '../src/persistence/settings.js';
import { withRules } from './helpers/rules.js';

// Player T,7 stands vs dealer 6,K who draws a 5 → 21: every round is the same
// five cards, so the shoe runs on for many rounds.
const ROUND = ['TS', '6H', '7D', 'KC', '5S'];

describe('count quiz', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('../src/ui/render.js');
    vi.doUnmock('../src/assets/sound.js');
    vi.resetModules();
  });

  it(`asks for the running count every ${QUIZ_EVERY} hands, grades it, then continues`, async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.doMock('../src/ui/render.js', () => ({ render: vi.fn() }));
    const sound = { deal: vi.fn(), chip: vi.fn(), shuffle: vi.fn(), win: vi.fn(), lose: vi.fn(), push: vi.fn() };
    vi.doMock('../src/assets/sound.js', () => ({ sound, unlockAudio: vi.fn(), setMuted: vi.fn() }));
    const { mount } = await import('../src/ui/controls.js');

    const rules = withRules({
      shoe: { numberOfDecks: 6, penetration: 0.99 },
      teaching: { showCardCounting: true, countingSystem: 'hi-lo' },
    });
    const stack = Array.from({ length: 40 }, () => ROUND).flat();
    const g = createGame(rules, { cards: parseCards(stack) });
    const listeners = {};
    const root = { addEventListener: (n, fn) => { listeners[n] = fn; }, querySelector: () => null };
    const options = { settings: normalizeSettings({ countQuiz: true }, rules, []) };
    mount(root, g, options);
    const click = (action, value) => listeners.click({ target: { closest: () => ({ dataset: { action, value } }) } });

    click('chip', '500');
    for (let hand = 1; hand <= QUIZ_EVERY; hand++) {
      click(hand === 1 ? 'deal' : 'rebet');
      click('stand');
      vi.runAllTimers(); // finish the staged dealer reveal
      expect(g.phase).toBe(Phase.RoundOver);
      if (hand < QUIZ_EVERY) expect(options.ui.quiz ?? null).toBeNull();
    }
    click('rebet'); // the 5th hand is done → the quiz interrupts
    expect(options.ui.quiz).toMatchObject({ pending: 'rebet', result: null });
    expect(g.phase).toBe(Phase.RoundOver);
    const answer = countFromShoe(g.shoe).running;
    expect(options.ui.quiz.answer).toBe(answer);

    for (let i = 0; i < Math.abs(answer); i++) click(answer > 0 ? 'quizPlus' : 'quizMinus');
    click('quizCheck');
    expect(options.ui.quiz.result).toEqual({ right: true });
    expect(options.stats.quiz).toEqual({ asked: 1, right: 1 });

    click('quizContinue'); // carries on with the paused Rebet
    expect(options.ui.quiz).toBeNull();
    expect(g.phase).not.toBe(Phase.RoundOver);
  });
});
