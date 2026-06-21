import './ui/styles.css';
import RULES from '../config/blackjack-rules.config.js';
import { validateRules } from './engine/validateRules.js';

// ── Startup: config-capability guard ──────────────────────────────────────
// Warn loudly (console + on-screen) about any config options Phase 1 does not
// implement, so the app never silently mis-plays. With the shipped MVP config
// this list is empty; it only appears if you re-enable an unsupported option.
const { warnings } = validateRules(RULES);
warnings.forEach((w) => console.warn('[config] ' + w));

// ── Placeholder UI ────────────────────────────────────────────────────────
// Step 1 just proves the toolchain renders and the config loads. The real
// table / cards / chips arrive in Step 5 (src/ui/render.js + controls.js).
const payoutLabel =
  RULES.payouts.blackjack === 1.5
    ? '3:2'
    : RULES.payouts.blackjack === 1.2
      ? '6:5'
      : `${RULES.payouts.blackjack}×`;

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="table">
    <h1 class="title">Blackjack Trainer</h1>
    <p class="subtitle">Phase 1 scaffold — engine &amp; UI coming next.</p>
    <dl class="config-readout">
      <div><dt>Decks</dt><dd>${RULES.shoe.numberOfDecks}</dd></div>
      <div><dt>Dealer</dt><dd>${RULES.dealer.hitsSoft17 ? 'Hits' : 'Stands'} soft 17</dd></div>
      <div><dt>Blackjack pays</dt><dd>${payoutLabel}</dd></div>
      <div><dt>Table</dt><dd>$${RULES.table.minBet}–$${RULES.table.maxBet}</dd></div>
      <div><dt>Bankroll</dt><dd>$${RULES.table.startingBankroll}</dd></div>
    </dl>
    ${
      warnings.length
        ? `<div class="config-warnings" role="status"><strong>Config notes (${warnings.length}):</strong><ul>${warnings
            .map((w) => `<li>${w}</li>`)
            .join('')}</ul></div>`
        : ''
    }
  </main>
`;
