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
  const settings = {
    muted: false,
    softDisplayBothValues: false,
    numberOfDecks: RULES.shoe.numberOfDecks,
    maxBet: RULES.table.maxBet,
  };

  // Restore settings from a previous session BEFORE building the game/shoe, so a
  // persisted deck count is baked into the very first shoe instead of being built
  // at the default and corrected on the first deal.
  const persisted = await loadPersisted();
  if (persisted && typeof persisted === 'object' && persisted.settings && typeof persisted.settings === 'object') {
    Object.assign(settings, persisted.settings);
  }
  // Guard against corrupt/tampered data: an integer in [1, 99] (never let
  // storage produce a shoe size the rest of the engine wasn't built to expect).
  if (Number.isInteger(settings.numberOfDecks)) {
    RULES.shoe.numberOfDecks = Math.max(1, Math.min(99, settings.numberOfDecks));
  }
  // Same guard for a persisted max bet: an integer in [100, 10000].
  if (Number.isInteger(settings.maxBet)) {
    RULES.table.maxBet = Math.max(100, Math.min(10000, settings.maxBet));
  }
  setMuted(settings.muted);

  const game = createGame(RULES);

  // Restore the bankroll from a previous session, if any.
  if (persisted && Number.isInteger(persisted.bankrollCents) && persisted.bankrollCents >= 0) {
    game.bankrollCents = persisted.bankrollCents;
  }

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
