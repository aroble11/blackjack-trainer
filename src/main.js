import './ui/styles.css';
import RULES from '../config/blackjack-rules.config.js';
import { validateRules } from './engine/validateRules.js';
import { createGame, Phase } from './engine/game.js';
import { setupPwa } from './pwa.js';
import { mount } from './ui/controls.js';
import { loadPersisted, savePersisted } from './persistence/persist.js';
import { setMuted } from './assets/sound.js';
import { setVibration } from './assets/haptics.js';
import { initWakeLock } from './ui/wake-lock.js';
import { normalizeStats } from './teaching/stats.js';
import { normalizeSettings, applySettingsToRules } from './persistence/settings.js';
import { listStrategies } from './teaching/strategies.js';

// Startup capability guard: warn (console + on-screen) about any config option
// the engine does not implement, so the app never silently mis-plays.
const { warnings } = validateRules(RULES);
warnings.forEach((w) => console.warn('[config] ' + w));

// Ask the browser not to evict our IndexedDB data. Without this, Safari may
// clear storage for a site that isn't opened for 7 days (bankroll lost). Best
// effort: unsupported or denied simply leaves the default behavior.
function requestPersistentStorage() {
  try {
    navigator.storage?.persisted?.().then((already) => {
      if (!already) return navigator.storage.persist?.();
    }).catch(() => {});
  } catch {
    /* storage API unavailable */
  }
}

async function start() {
  requestPersistentStorage();
  const persisted = await loadPersisted();
  const settings = normalizeSettings(persisted?.settings, RULES, listStrategies());
  applySettingsToRules(settings, RULES);
  setMuted(settings.muted);
  setVibration(settings.vibration);
  initWakeLock(settings.keepAwake);

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
    return savePersisted({ bankrollCents: stableBankroll, settings, stats });
  };

  const stats = normalizeStats(persisted?.stats);
  const options = { warnings, settings, stats, persist, pwa: {} };
  const view = mount(document.querySelector('#app'), game, options);
  setupPwa(options.pwa, view.refresh);
}

start();
