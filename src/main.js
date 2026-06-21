import './ui/styles.css';
import RULES from '../config/blackjack-rules.config.js';
import { validateRules } from './engine/validateRules.js';
import { createGame } from './engine/game.js';
import { mount } from './ui/controls.js';

// Startup capability guard: warn (console + on-screen) about any config option
// Phase 1 does not implement, so the app never silently mis-plays.
const { warnings } = validateRules(RULES);
warnings.forEach((w) => console.warn('[config] ' + w));

const game = createGame(RULES);
mount(document.querySelector('#app'), game, warnings);
