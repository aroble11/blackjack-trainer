import { describe, it, expect } from 'vitest';
import * as G from '../src/engine/game.js';
import { createShoe } from '../src/engine/shoe.js';
import { parseCards, parseCard } from '../src/engine/cards.js';
import { handValue } from '../src/engine/hand.js';
import { bestAction } from '../src/teaching/advisor.js';
import { chartAction } from '../src/teaching/strategies.js';
import { normalizeSettings, applyPendingSettings } from '../src/persistence/settings.js';
import { runSession, runSimulation, runSimulationBatches } from '../src/sim/simulator.js';
import { render } from '../src/ui/render.js';
import { withRules } from './helpers/rules.js';
import { mulberry32 } from './helpers/rng.js';

const stacked = (cards, rules = withRules()) => {
  const game = G.createGame(rules, { cards: parseCards(cards) });
  G.setBet(game, 500); G.deal(game); return game;
};

describe('round exhaustion recovery', () => {
  it.each([1, 2, 4, 6, 8, 99])('keeps at least 20 cards behind the cut for %i decks', (numberOfDecks) => {
    const shoe = createShoe(withRules({ shoe: { numberOfDecks, penetration: .9 } }));
    expect(shoe.cards.length - shoe.cutIndex).toBeGreaterThanOrEqual(20);
  });
  it('refunds a double and original stake when the dealer cannot finish', () => {
    const g = stacked(['5S', '2H', '6D', '3C', '8D']);
    G.double(g);
    expect(g.phase).toBe(G.Phase.Betting);
    expect(g.bankrollCents).toBe(50000);
    expect(g.roundVoided).toBe(true);
    expect(g.shoe.seenCards).toEqual([]);
    expect(g.shoe.cards).toHaveLength(312);
  });
  it('refunds insurance and all split stakes, even on a partial split', () => {
    const g = stacked(['8S', 'AH', '8D', '3C', '8H'], withRules({ player: { insuranceAllowed: true } }));
    G.takeInsurance(g); G.split(g);
    expect(g.bankrollCents).toBe(50000);
    expect(g.roundVoided).toBe(true);
    expect(g.playerHands).toEqual([]);
  });
  it('refunds an incomplete initial deal', () => {
    const g = stacked(['5S', '2H']);
    expect(g.bankrollCents).toBe(50000);
    expect(g.roundVoided).toBe(true);
  });
  it('survives the reported two-deck seed with legal aggressive play', () => {
    const g = G.createGame(withRules({ shoe: { numberOfDecks: 2, penetration: .9 } }), { rng: mulberry32(3) });
    for (let i = 0; i < 100; i++) {
      g.bankrollCents = 50000; G.setBet(g, 500); G.deal(g);
      if (g.phase === G.Phase.Insurance) G.declineInsurance(g);
      while (g.phase === G.Phase.PlayerTurn) {
        if (G.canSplit(g)) G.split(g);
        else if (handValue(G.activeHand(g).cards).total < 17) G.hit(g);
        else G.stand(g);
      }
      expect([G.Phase.RoundOver, G.Phase.Betting]).toContain(g.phase);
      G.nextRound(g);
    }
  });
});

describe('legal recommendations and table limits', () => {
  it('hints the best affordable action and applies custom chart fallbacks', () => {
    const g = stacked(['5S', '9H', '6D', '8C'], withRules({ teaching: { showBasicStrategyHints: true } })); g.bankrollCents = 0;
    const context = G.decisionContext(g);
    expect(bestAction(G.activeHand(g).cards, g.dealerCards[0], g.rules, context).action).toBe('hit');
    expect(chartAction({ hard: { 11: 'D' } }, G.activeHand(g).cards, g.dealerCards[0], g.rules, context)).toBe('hit');
    const root = { innerHTML: '' }; render(root, g, { ui: { hintShown: true } });
    expect(root.innerHTML).toContain('Basic strategy: <strong>Hit</strong>');
  });
  it('recommends re-splitting eights, respects the cap and shared split budget', () => {
    const g = stacked(['8S', '6H', '8D', '10C', '8H', '4D']); G.split(g);
    const advise = () => bestAction(G.activeHand(g).cards, g.dealerCards[0], g.rules, G.decisionContext(g));
    expect(advise().action).toBe('split');
    g.rules.player.maxSplitHands = 2;
    expect(advise().evs.split).toBeUndefined();
  });
  it('does not allow a pending bet over the new maximum', () => {
    const g = G.createGame(withRules()); G.setBet(g, 50000); g.rules.table.maxBet = 100;
    expect(G.canDeal(g)).toBe(false);
    G.setBet(g, g.betCents); expect(g.betCents).toBe(10000);
  });
});

describe('saved settings and deferred changes', () => {
  it('normalizes invalid data once and drops unknown properties', () => {
    const s = normalizeSettings({ numberOfDecks: 1000, maxBet: -1, startingAmount: '100', muted: 'false', strategy: 'gone', extra: true }, withRules(), [{ id: 'basic' }]);
    expect(s).toMatchObject({ numberOfDecks: 8, maxBet: 100, startingAmount: 500, muted: false, strategy: 'basic', vibration: true, keepAwake: true });
    expect(s).not.toHaveProperty('extra');
    expect(normalizeSettings(null, withRules(), []).numberOfDecks).toBe(6);
  });
  it('defers a deck change until after settlement and preserves the bankroll', () => {
    const g = stacked(['10S', '10H', '9D', '7C']);
    const settings = normalizeSettings({ numberOfDecks: 2 }, g.rules, []);
    expect(applyPendingSettings(g, settings)).toBe(false);
    expect(g.shoe.numberOfDecks).toBe(6);
    G.stand(g); expect(g.bankrollCents).toBe(50500);
    G.nextRound(g); applyPendingSettings(g, settings);
    expect(g.shoe.numberOfDecks).toBe(2);
    expect(g.bankrollCents).toBe(50500);
  });
  it('applies a new starting bankroll only after the hand ends', () => {
    const g = stacked(['10S', '10H', '9D', '7C']);
    const settings = normalizeSettings({ startingAmount: 1000 }, g.rules, []);
    applyPendingSettings(g, settings); expect(g.bankrollCents).toBe(49500);
    G.stand(g); G.nextRound(g); applyPendingSettings(g, settings);
    expect(g.bankrollCents).toBe(100000);
  });
});

describe('simulation reporting', () => {
  it('counts bankruptcy on the final hand', () => {
    const r = runSession(withRules({ table: { startingBankroll: 5 } }), 'flat', { handsPerSession: 1, rng: mulberry32(1) });
    expect(r.finalCents).toBe(0); expect(r.ruined).toBe(true);
  });
  it('reports real progress, matches synchronous results, and snapshots rules', () => {
    const rules = withRules();
    const options = { system: 'flat', sessions: 21, handsPerSession: 5, seed: 8 };
    const iter = runSimulationBatches(rules, options);
    expect(iter.next().value).toBe(10);
    rules.table.startingBankroll = 999;
    expect(iter.next().value).toBe(20);
    expect(iter.next().value).toBe(21);
    const result = iter.next().value;
    expect(result.rules.table.startingBankroll).toBe(500);
    expect(result.nets).toEqual(runSimulation(withRules(), options).nets);
  });
});
