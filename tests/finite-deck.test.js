import { it, expect } from 'vitest';
import { bestAction } from '../src/teaching/advisor.js';
import { parseCards, parseCard } from '../src/engine/cards.js';
import { withRules } from './helpers/rules.js';

// Independent numerical anchors, not output captured from this implementation.
// https://wizardofodds.com/games/blackjack/appendix/9/1ds17r4/
// https://wizardofodds.com/games/blackjack/appendix/9/2ds17r4/
const anchors = [
  [1, ['10S', '6H'], '5D', [-.141194, -.444223, -.888446]],
  [2, ['10S', '6H'], '5D', [-.154693, -.447218, -.894436]],
  [1, ['AS', '2H'], 'AD', [-.661732, -.067808, -.593281]],
  [2, ['AS', '2H'], 'AD', [-.664614, -.062819, -.609422]],
  [1, ['6S', '5H'], 'AD', [-.634013, .172946, .240259]],
  [2, ['6S', '5H'], 'AD', [-.651264, .157240, .172433]],
  [1, ['8S', '3H'], '5D', [-.132654, .349536, .699071]],
  [2, ['8S', '3H'], '5D', [-.150594, .327851, .655703]],
];
it.each(anchors)('matches published %i-deck EVs for %j vs %s', (decks, cards, up, expected) => {
  const result = bestAction(parseCards(cards), parseCard(up), withRules({ shoe: { numberOfDecks: decks } }));
  ['stand', 'hit', 'double'].forEach((a, i) => expect(result.evs[a]).toBeCloseTo(expected[i], 5));
  expect(Object.values(result.dealerDist).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  expect(result.model).toBe('finite');
}, 30000);

it('changes the close A,2 vs 5 decision for a single deck', () => {
  const rec = (decks) => bestAction(parseCards(['AS', '2H']), parseCard('5D'), withRules({ shoe: { numberOfDecks: decks } }));
  expect(rec(1).action).toBe('double');
  expect(rec(6).action).toBe('hit');
});

it('preserves cached EVs when a current bankroll forbids doubling', () => {
  const rules = withRules({ shoe: { numberOfDecks: 1 } });
  const cards = parseCards(['6S', '5H']), up = parseCard('5D');
  expect(bestAction(cards, up, rules, { legal: { double: false } }).evs.double).toBeUndefined();
  expect(bestAction(cards, up, rules).action).toBe('double');
});

// https://wizardofodds.com/games/blackjack/appendix/9/1dh17r4/
// https://wizardofodds.com/games/blackjack/appendix/9/2dh17r4/
it.each([[1, [-.589084, -.107929, -.552040]], [2, [-.594150, -.103429, -.571816]]])(
  'matches published H17 values after the Ace peek with %i decks', (decks, expected) => {
    const rec = bestAction(parseCards(['AS', '2H']), parseCard('AD'), withRules({
      shoe: { numberOfDecks: decks }, dealer: { hitsSoft17: true },
    }));
    ['stand', 'hit', 'double'].forEach((a, i) => expect(rec.evs[a]).toBeCloseTo(expected[i], 5));
  }
);
