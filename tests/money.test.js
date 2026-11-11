import { describe, it, expect } from 'vitest';
import { formatMoney } from '../src/engine/money.js';

describe('formatMoney', () => {
  it('formats whole dollars without cents', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(50000)).toBe('$500');
  });

  it('keeps two decimals for fractional amounts', () => {
    expect(formatMoney(750)).toBe('$7.50');
    expect(formatMoney(5)).toBe('$0.05');
  });

  it('groups thousands', () => {
    expect(formatMoney(100000)).toBe('$1,000');
    expect(formatMoney(102250)).toBe('$1,022.50');
    expect(formatMoney(123456789)).toBe('$1,234,567.89');
  });

  it('puts the sign before the dollar sign', () => {
    expect(formatMoney(-102250)).toBe('-$1,022.50');
  });
});
