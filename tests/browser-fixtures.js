// Development-only fixtures: /tests/browser.html?scenario=split|short|poor
// Not an app entrypoint; never included in the production build.
import '../src/ui/styles.css';
import RULES from '../config/blackjack-rules.config.js';
import { createGame, setBet, deal, split } from '../src/engine/game.js';
import { parseCards } from '../src/engine/cards.js';
import { mount } from '../src/ui/controls.js';
import { normalizeSettings } from '../src/persistence/settings.js';
const scenario = new URLSearchParams(location.search).get('scenario') || 'split';
const rules = structuredClone(RULES);
const stacks = {
  split: ['8S', '6H', '8D', '10C', '8H', '4D', '8C', '5S', '2H', '3D', '5C'],
  short: ['AS', '5H', '2D', '10C', '6H', '3D'],
  poor: ['5S', '9H', '6D', '8C', '10D'],
};
if (scenario === 'short') rules.shoe.numberOfDecks = 1;
const game = createGame(rules, { cards: parseCards(stacks[scenario] || stacks.split) });
setBet(game, scenario === 'poor' ? 50000 : 500); deal(game);
if (scenario === 'split') { split(game); split(game); split(game); }
mount(document.querySelector('#app'), game, { settings: normalizeSettings(null, rules, []) });
