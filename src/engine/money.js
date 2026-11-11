/**
 * money.js — money is tracked everywhere in the engine as INTEGER CENTS to
 * avoid floating-point drift (a 3:2 win on a $5 bet is $7.50). Dollars only
 * appear at the boundaries: config in, display out.
 */

export const toCents = (dollars) => Math.round(dollars * 100);

export const fromCents = (cents) => cents / 100;

/**
 * Format cents as a dollar string with thousands separators:
 * 50000 -> "$500", 750 -> "$7.50", 102250 -> "$1,022.50". Negative input
 * formats as "-$5" (callers that want a sign usually pass Math.abs()).
 * Locale-independent on purpose, so output is identical on every phone.
 */
export function formatMoney(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${grouped}${frac ? `.${String(Math.round(frac)).padStart(2, '0')}` : ''}`;
}
