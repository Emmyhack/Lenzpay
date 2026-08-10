import { CURRENCY_PRECISION, type CurrencyCode } from '@/types/payment';

/**
 * Decimal-safe rounding helpers.
 *
 * Every amount the engine hands to a rail is rounded to that currency's
 * precision, so we never ask a bank to move a fraction of a kobo or a chain to
 * move a fraction of a satoshi. The epsilon guards against binary-float
 * representation error (the classic `1.005 * 100 = 100.49999…`).
 */

const EPSILON = 1e-9;

function scaleOf(decimals: number): number {
  return 10 ** decimals;
}

export function roundTo(value: number, decimals: number): number {
  const scale = scaleOf(decimals);
  const nudged = value >= 0 ? value * scale + EPSILON : value * scale - EPSILON;
  return Math.round(nudged) / scale;
}

export function floorTo(value: number, decimals: number): number {
  const scale = scaleOf(decimals);
  return Math.floor(value * scale + EPSILON) / scale;
}

export function ceilTo(value: number, decimals: number): number {
  const scale = scaleOf(decimals);
  return Math.ceil(value * scale - EPSILON) / scale;
}

export function precisionOf(currency: CurrencyCode): number {
  return CURRENCY_PRECISION[currency] ?? 2;
}

/** Round to the currency's own precision. */
export function roundCurrency(value: number, currency: CurrencyCode): number {
  return roundTo(value, precisionOf(currency));
}

/**
 * Round down — used for "how much can this source deliver?", where over-
 * promising by even a hair would build a plan that can't actually settle.
 */
export function floorCurrency(value: number, currency: CurrencyCode): number {
  return floorTo(value, precisionOf(currency));
}

/**
 * Round up — used for "how much must we debit to deliver X?", where under-
 * debiting would short the payee.
 */
export function ceilCurrency(value: number, currency: CurrencyCode): number {
  return ceilTo(value, precisionOf(currency));
}

/** Compare two amounts at a currency's precision. */
export function amountsEqual(a: number, b: number, currency: CurrencyCode): boolean {
  return Math.abs(roundCurrency(a, currency) - roundCurrency(b, currency)) < EPSILON;
}

export function sumAmounts(values: number[], currency: CurrencyCode): number {
  return roundCurrency(
    values.reduce((total, value) => total + value, 0),
    currency
  );
}
