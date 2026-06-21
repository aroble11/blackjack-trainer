import './ui/styles.css';
import RULES from '../config/blackjack-rules.config.js';
import { validateRules } from './engine/validateRules.js';
import { createGame, Phase } from './engine/game.js';
import { mount } from './ui/controls.js';
import { loadPersisted, savePersisted } from './persistence/persist.js';
import { setMuted } from './assets/sound.js';

// Startup capability guard: warn (console + on-screen) about any config option
// the engine does not implement, so the app never silently mis-plays.
const { warnings } = validateRules(RULES);
warnings.forEach((w) => console.warn('[config] ' + w));

async function start() {
  const game = createGame(RULES);
  const settings = { muted: false };

  // Restore bankroll + settings from a previous session, if any.
  const persisted = await loadPersisted();
  if (persisted && typeof persisted === 'object') {
    // Guard against corrupt/tampered data: a finite, non-negative bankroll only.
    if (Number.isFinite(persisted.bankrollCents) && persisted.bankrollCents >= 0) {
      game.bankrollCents = persisted.bankrollCents;
    }
    if (persisted.settings && typeof persisted.settings === 'object') {
      Object.assign(settings, persisted.settings);
    }
  }
  setMuted(settings.muted);

  // Settings save immediately; the bankroll only saves at a stable point (between
  // rounds), so an interrupted hand is voided — not charged — on reload.
  let stableBankroll = game.bankrollCents;
  const persist = () => {
    if (game.phase === Phase.Betting || game.phase === Phase.RoundOver) {
      stableBankroll = game.bankrollCents;
    }
    savePersisted({ bankrollCents: stableBankroll, settings });
  };

  mount(document.querySelector('#app'), game, { warnings, settings, persist });
}

start();
