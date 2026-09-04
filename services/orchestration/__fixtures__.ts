import type { CurrencyCode, PaymentSource, SourceType } from '@/types/payment';
import type { Payee } from '@/types/orchestration';
import { devRateFeed, type RateFeed } from './fx';

/** Deterministic fixtures shared across the orchestration tests. */

export const FIXED_NOW = 1_760_000_000_000;

export function feed(overrides: Partial<RateFeed['rates']> = {}): RateFeed {
  const base = devRateFeed(FIXED_NOW);
  return { ...base, rates: { ...base.rates, ...overrides } };
}

let sourceSeq = 0;

export function source(overrides: Partial<PaymentSource> = {}): PaymentSource {
  sourceSeq += 1;
  const rawCurrency: CurrencyCode = overrides.rawCurrency ?? 'NGN';
  const type: SourceType = overrides.type ?? 'bank';

  return {
    id: `src_${sourceSeq}`,
    type,
    label: `Source ${sourceSeq}`,
    accountMask: `*${1000 + sourceSeq}`,
    currency: 'NGN',
    balance: 0,
    rawBalance: 0,
    rawCurrency,
    isDefault: false,
    lastSynced: new Date(FIXED_NOW),
    ...overrides,
  };
}

export function ngnBank(rawBalance: number, overrides: Partial<PaymentSource> = {}) {
  return source({ type: 'bank', rawCurrency: 'NGN', rawBalance, ...overrides });
}

export function usdAccount(rawBalance: number, overrides: Partial<PaymentSource> = {}) {
  return source({ type: 'usd', rawCurrency: 'USD', rawBalance, ...overrides });
}

export function cryptoWallet(
  rawCurrency: CurrencyCode,
  rawBalance: number,
  overrides: Partial<PaymentSource> = {}
) {
  return source({ type: 'crypto', rawCurrency, rawBalance, ...overrides });
}

/** A card: no readable balance, but a real authorise/capture primitive. */
export function card(limit: number, overrides: Partial<PaymentSource> = {}) {
  return source({ type: 'card', rawCurrency: 'NGN', rawBalance: limit, ...overrides });
}

/** A custody account we control — funds here can genuinely be ring-fenced. */
export function custodyAccount(rawBalance: number, overrides: Partial<PaymentSource> = {}) {
  return source({ type: 'custody', rawCurrency: 'NGN', rawBalance, ...overrides });
}

export function payee(overrides: Partial<Payee> = {}): Payee {
  return {
    id: 'payee_1',
    displayName: 'Bolt Driver — Emeka',
    resolutionType: 'qr',
    settlementCurrency: 'NGN',
    receivingMethod: 'bank_transfer',
    isVerified: true,
    ...overrides,
  };
}
