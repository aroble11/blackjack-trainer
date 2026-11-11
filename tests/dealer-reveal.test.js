import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGame, setBet, deal, stand, hit, Phase } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { countFromShoe } from '../src/teaching/counting.js';
import { needsReveal, preSettlementBankroll, stagedView } from '../src/ui/dealer-reveal.js';
import { withRules } from './helpers/rules.js';

// Deal order: player, dealer-up, player, dealer-hole, then hits/draws.
const FILLER = Array(40).fill('9C');
const dealt = (stack, bet = 500) => {
  const g = createGame(withRules(), { cards: parseCards([...stack, ...FILLER]) });
  setBet(g, bet);
  deal(g);
  return g;
};

// Player T+7 = 17 stands; dealer 6 + K = 16 draws 5 → 21. Dealer wins.
const DEALER_DRAWS = ['TS', '6H', '7D', 'KC', '5S'];

describe('staged dealer reveal (pure view)', () => {
  it('needs a reveal once the dealer has played out a settled round', () => {
    const g = dealt(DEALER_DRAWS);
    expect(needsReveal(g)).toBe(false); // player's turn
    stand(g);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(needsReveal(g)).toBe(true);
  });

  it('step 1 shows only the upcard, hides the outcome, and rolls the count back', () => {
    const g = dealt(DEALER_DRAWS);
    const countBefore = countFromShoe(g.shoe);
    const bankrollBefore = g.bankrollCents;
    stand(g);

    const v = stagedView(g, 1);
    expect(v.phase).toBe(Phase.DealerTurn);
    expect(v.dealerHoleRevealed).toBe(false);
    expect(v.dealerCards).toHaveLength(2); // upcard + face-down hole
    expect(v.bankrollCents).toBe(bankrollBefore);
    expect(countFromShoe(v.shoe)).toEqual(countBefore);
    expect(v.playerHands).toBe(g.playerHands); // same objects (animation tracking)
  });

  it('steps through the hole card and each draw, ending on the real state', () => {
    const g = dealt(DEALER_DRAWS);
    stand(g);
    expect(g.dealerCards).toHaveLength(3);

    const hole = stagedView(g, 2);
    expect(hole.dealerHoleRevealed).toBe(true);
    expect(hole.dealerCards.map((c) => c.rank)).toEqual(['6', 'K']);
    // 6 (+1) and K (−1) seen by now, the 5 not yet.
    expect(countFromShoe(hole.shoe).running).toBe(countFromShoe(g.shoe).running - 1);

    const all = stagedView(g, 3);
    expect(all.dealerCards).toEqual(g.dealerCards);
    expect(all.shoe.seenCards).toEqual(g.shoe.seenCards);
    expect(all.shoe.pos).toBe(g.shoe.pos);
    // Still the pre-settlement bankroll until the reveal finishes.
    expect(all.bankrollCents).toBe(preSettlementBankroll(g));
  });

  it('a busted player still sees the hole card turn over (no dealer draws)', () => {
    // Player T+6 = 16, hits a K → bust. Dealer 6 + K never draws.
    const g = dealt(['TS', '6H', '6D', 'KC', 'KH']);
    hit(g);
    expect(g.phase).toBe(Phase.RoundOver);
    expect(g.dealerCards).toHaveLength(2);
    expect(needsReveal(g)).toBe(true);
    expect(stagedView(g, 1).dealerHoleRevealed).toBe(false);
  });
});

describe('staged dealer reveal (controls)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('../src/ui/render.js');
    vi.doUnmock('../src/assets/sound.js');
    vi.resetModules();
  });

  it('reveals one card per step, blocks taps meanwhile, then shows the result', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const renders = [];
    vi.doMock('../src/ui/render.js', () => ({
      render: (_root, g, options) => renders.push({ reveal: options.ui.reveal, phase: g.phase }),
    }));
    const sound = { deal: vi.fn(), chip: vi.fn(), shuffle: vi.fn(), win: vi.fn(), lose: vi.fn(), push: vi.fn() };
    vi.doMock('../src/assets/sound.js', () => ({ sound, unlockAudio: vi.fn(), setMuted: vi.fn() }));
    const { mount } = await import('../src/ui/controls.js');

    const listeners = {};
    const root = { addEventListener: (n, fn) => { listeners[n] = fn; }, querySelector: () => null };
    const g = dealt(DEALER_DRAWS);
    const options = {};
    mount(root, g, options);
    const click = (action) => listeners.click({ target: { closest: () => ({ dataset: { action } }) } });

    click('stand');
    expect(g.phase).toBe(Phase.RoundOver); // engine settled instantly
    expect(options.ui.reveal).toBe(1);
    expect(sound.lose).not.toHaveBeenCalled();

    click('next'); // ignored mid-reveal
    expect(g.phase).toBe(Phase.RoundOver);

    vi.advanceTimersByTime(450);
    expect(options.ui.reveal).toBe(2); // hole card flipped
    vi.advanceTimersByTime(600);
    expect(options.ui.reveal).toBe(3); // dealer's draw
    expect(sound.lose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(450);
    expect(options.ui.reveal).toBeNull();
    expect(sound.lose).toHaveBeenCalledOnce();
    expect(renders.map((r) => r.reveal).slice(-4)).toEqual([1, 2, 3, null]);

    click('next');
    expect(g.phase).toBe(Phase.Betting);
  });
});
