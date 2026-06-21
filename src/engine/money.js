/**
 * money.js — money is tracked everywhere in the engine as INTEGER CENTS to
 * avoid floating-point drift (a 3:2 win on a $5 bet is $7.50). Dollars only
 * appear at the boundaries: config in, display out.
 */

export const toCents = (dollars) => Math.round(dollars * 100);

export const fromCents = (cents) => cents / 100;

/** Format cents as a dollar string: 50000 -> "$500", 750 -> "$7.50". */
export function formatMoney(cents) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
