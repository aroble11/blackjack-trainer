import './ui/styles.css';
import RULES from '../config/blackjack-rules.config.js';
import { validateRules } from './engine/validateRules.js';
import { createGame, Phase } from './engine/game.js';
import { setupPwa } from './pwa.js';
import { mount } from './ui/controls.js';
import { loadPersisted, savePersisted } from './persistence/persist.js';
import { setMuted } from './assets/sound.js';
import { normalizeSettings, applySettingsToRules } from './persistence/settings.js';
import { listStrategies } from './teaching/strategies.js';

// Startup capability guard: warn (console + on-screen) about any config option
// the engine does not implement, so the app never silently mis-plays.
const { warnings } = validateRules(RULES);
warnings.forEach((w) => console.warn('[config] ' + w));

async function start() {
  const persisted = await loadPersisted();
  const settings = normalizeSettings(persisted?.settings, RULES, listStrategies());
  applySettingsToRules(settings, RULES);
  setMuted(settings.muted);

  const game = createGame(RULES);

  // Restore the bankroll from a previous session, if any.
  if (persisted && Number.isSafeInteger(persisted.bankrollCents) && persisted.bankrollCents >= 0) {
    game.bankrollCents = persisted.bankrollCents;
  }

  // Settings save immediately; the bankroll only saves at a stable point (between
  // rounds), so an interrupted hand is voided — not charged — on reload.
  let stableBankroll = game.bankrollCents;
  const persist = () => {
    if (game.phase === Phase.Betting || game.phase === Phase.RoundOver) {
      stableBankroll = game.bankrollCents;
    }
    return savePersisted({ bankrollCents: stableBankroll, settings });
  };

  const options = { warnings, settings, persist, pwa: {} };
  const view = mount(document.querySelector('#app'), game, options);
  setupPwa(options.pwa, view.refresh);
}

start();
