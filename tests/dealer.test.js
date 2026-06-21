import { describe, it, expect } from 'vitest';
import { shouldDealerHit, playDealerHand } from '../src/engine/dealer.js';
import { createShoe } from '../src/engine/shoe.js';
import { handValue } from '../src/engine/hand.js';
import { parseCards, cardLabel } from '../src/engine/cards.js';
import { withRules } from './helpers/rules.js';

const S17 = withRules({ dealer: { hitsSoft17: false } });
const H17 = withRules({ dealer: { hitsSoft17: true } });

describe('shouldDealerHit', () => {
  it('hits below 17', () => {
    expect(shouldDealerHit(parseCards(['10S', '6H']), S17)).toBe(true); // 16
  });

  it('stands on hard 17 and above', () => {
    expect(shouldDealerHit(parseCards(['10S', '7H']), S17)).toBe(false); // 17
    expect(shouldDealerHit(parseCards(['10S', '8H']), H17)).toBe(false); // 18
  });

  it('handles soft 17 per the rule', () => {
    expect(shouldDealerHit(parseCards(['AS', '6H']), S17)).toBe(false); // soft 17, stand
    expect(shouldDealerHit(parseCards(['AS', '6H']), H17)).toBe(true); //  soft 17, hit
  });

  it('stands on soft 18', () => {
    expect(shouldDealerHit(parseCards(['AS', '7H']), H17)).toBe(false);
  });
});

describe('playDealerHand', () => {
  it('draws to a stand', () => {
    const shoe = createShoe({ shoe: {} }, { cards: parseCards(['5S', '9D']) });
    const result = playDealerHand(parseCards(['10S', '6H']), shoe, S17); // 16 -> +5 = 21
    expect(result.map(cardLabel)).toEqual(['10♠', '6♥', '5♠']);
    expect(handValue(result).total).toBe(21);
  });

  it('hits soft 17 under H17 then stands', () => {
    const shoe = createShoe({ shoe: {} }, { cards: parseCards(['4S']) });
    const result = playDealerHand(parseCards(['AS', '6H']), shoe, H17); // soft 17 -> +4 = 21
    expect(handValue(result).total).toBe(21);
  });
});
