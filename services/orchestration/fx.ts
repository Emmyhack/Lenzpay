import { isCrypto, type CurrencyCode } from '@/types/payment';
import { identityQuote, type FxQuote, type QuoteProvider } from '@/types/orchestration';
import { ceilCurrency, floorCurrency, roundCurrency } from '@/services/money';
import { Orchestration } from '@/constants/config';

/**
 * FX and liquidity quoting (§5.5, §5.6).
 *
 * Two rules drive everything here:
 *
 *  1. A quote is a *locked* price with an expiry. The engine may only build a
 *     plan on a live quote, and must re-quote if execution slips past the lock
 *     window rather than silently settling at a stale rate.
 *  2. `toSettlement` and `fromSettlement` are exact inverses. The waterfall
 *     works backwards ("this leg must deliver ₦X — how much USD is that?"),
 *     while ranking works forwards ("this account holds $612 — what's that
 *     worth to the payee?"). If those two disagree, plans silently under- or
 *     over-fund. `fx.test.ts` pins the round-trip.
 */

// ---------------------------------------------------------------------------
// Rate feed
// ---------------------------------------------------------------------------

/** NGN mid-market value of 1 unit of each supported currency. */
export type NgnRateTable = Record<CurrencyCode, number>;

export interface RateFeed {
  rates: NgnRateTable;
  updatedAt: number;
}

/**
 * Dev rate table. Replace with a live feed (`GET /rates`) behind the same
 * shape — nothing else in the engine needs to change.
 */
export const DEV_RATE_TABLE: NgnRateTable = {
  NGN: 1,
  USD: 1_550,
  GBP: 1_980,
  EUR: 1_670,
  BTC: 96_655_000,
  ETH: 5_240_000,
  USDT: 1_548,
};

export function devRateFeed(now = Date.now()): RateFeed {
  return { rates: { ...DEV_RATE_TABLE }, updatedAt: now };
}

// ---------------------------------------------------------------------------
// Fee schedule (§5.5 `fx_fee_schedule`)
// ---------------------------------------------------------------------------

export interface FeeTerms {
  /** Proportional spread on the converted amount. */
  feeRate: number;
  /** Flat fee, charged in the target currency. */
  flatFee: number;
  provider: QuoteProvider;
}

/**
 * Conversion cost by corridor. Stablecoin off-ramps are cheaper than volatile
 * assets because the liquidity partner carries less inventory risk.
 */
export function feeScheduleFor(
  from: CurrencyCode,
  to: CurrencyCode,
  /**
   * Share of our spread waived, 0..1 — the rewards tier benefit. Applied to
   * the proportional rate only: the flat fee is the partner's cost of moving
   * money and is not ours to give away.
   */
  spreadDiscount = 0
): FeeTerms {
  if (from === to) return { feeRate: 0, flatFee: 0, provider: 'none' };

  const keep = 1 - Math.max(0, Math.min(1, spreadDiscount));

  if (isCrypto(from)) {
    const isStablecoin = from === 'USDT';
    return {
      feeRate: (isStablecoin ? 0.008 : 0.015) * keep,
      flatFee: to === 'NGN' ? 100 : 0.5,
      provider: 'crypto_liquidity',
    };
  }

  // Fiat ↔ fiat via the FX partner.
  return { feeRate: 0.009 * keep, flatFee: to === 'NGN' ? 50 : 0.25, provider: 'fx_partner' };
}

// ---------------------------------------------------------------------------
// Quoting
// ---------------------------------------------------------------------------

let quoteCounter = 0;

function nextQuoteId(): string {
  quoteCounter += 1;
  return `q_${Date.now().toString(36)}_${quoteCounter.toString(36)}`;
}

/** Mid-market cross rate: units of `to` per 1 unit of `from`. */
export function crossRate(from: CurrencyCode, to: CurrencyCode, feed: RateFeed): number {
  if (from === to) return 1;
  const fromNgn = feed.rates[from];
  const toNgn = feed.rates[to];
  if (!fromNgn || !toNgn) {
    throw new Error(`No rate available for ${from}->${to}`);
  }
  return fromNgn / toNgn;
}

export interface QuoteOptions {
  now?: number;
  /** Overrides the default rate-lock window, in ms. */
  lockWindowMs?: number;
  /** Rewards-tier spread waiver, 0..1. */
  spreadDiscount?: number;
}

/**
 * Price a conversion and lock it for the rate-lock window. Same-currency
 * corridors short-circuit to a never-expiring identity quote.
 */
export function getQuote(
  from: CurrencyCode,
  to: CurrencyCode,
  feed: RateFeed,
  options: QuoteOptions = {}
): FxQuote {
  const now = options.now ?? Date.now();
  if (from === to) return identityQuote(from, now);

  const lockWindowMs = options.lockWindowMs ?? Orchestration.rateLockWindowMs;
  const terms = feeScheduleFor(from, to, options.spreadDiscount ?? 0);

  return {
    id: nextQuoteId(),
    from,
    to,
    rate: crossRate(from, to, feed),
    feeRate: terms.feeRate,
    flatFee: terms.flatFee,
    provider: terms.provider,
    quotedAt: now,
    expiresAt: now + lockWindowMs,
  };
}

// ---------------------------------------------------------------------------
// Conversion arithmetic
// ---------------------------------------------------------------------------

/** Effective rate after the proportional spread, before the flat fee. */
function netRate(quote: FxQuote): number {
  return quote.rate * (1 - quote.feeRate);
}

/**
 * Forward: what a given amount of source currency actually delivers to the
 * payee, net of spread and flat fee. Rounded **down** — never over-promise.
 *
 * Returns 0 rather than a negative when the flat fee exceeds the conversion
 * (i.e. the amount is too small to be worth converting).
 */
export function toSettlement(quote: FxQuote, amountInSource: number): number {
  if (quote.from === quote.to) return floorCurrency(amountInSource, quote.to);
  const gross = amountInSource * netRate(quote);
  return Math.max(0, floorCurrency(gross - quote.flatFee, quote.to));
}

/**
 * Inverse: how much source currency must be debited to deliver exactly
 * `amountInSettlement` to the payee. Rounded **up** — never short the payee.
 *
 * The sub-unit difference between this and the exact real number is absorbed
 * as spread, which is why `toSettlement(q, fromSettlement(q, x)) >= x` always
 * holds (pinned by test).
 */
export function fromSettlement(quote: FxQuote, amountInSettlement: number): number {
  if (quote.from === quote.to) return ceilCurrency(amountInSettlement, quote.from);
  const required = (amountInSettlement + quote.flatFee) / netRate(quote);
  return ceilCurrency(required, quote.from);
}

/**
 * Conversion cost of converting an *entire* balance, in settlement currency.
 * Used by ranking, where the question is "what does this account cost to use?"
 */
export function feeInSettlementCurrency(quote: FxQuote, amountInSource: number): number {
  if (quote.from === quote.to) return 0;
  const midMarket = amountInSource * quote.rate;
  const delivered = toSettlement(quote, amountInSource);
  return Math.max(0, roundCurrency(midMarket - delivered, quote.to));
}

/**
 * Conversion cost of a *leg*: everything the source gave up that did not reach
 * the payee, valued at the quoted mid-market rate.
 *
 * This is deliberately not `feeInSettlementCurrency`. A leg debits a whole
 * minor unit of the source currency (you cannot move half a cent), and one US
 * cent is worth ~₦15 — so the debit routinely buys slightly more settlement
 * currency than the leg owes. That excess is retained spread, and it has to be
 * booked as such or the ledger's FX clearing account won't balance at the
 * quoted rate. Defining the fee as `midMarket − delivered_to_payee` makes
 * `gross = net + fee` exactly equal the true conversion, to the kobo.
 */
export function legFee(
  quote: FxQuote,
  amountInSource: number,
  amountInSettlement: number
): number {
  if (quote.from === quote.to) return 0;
  const midMarket = amountInSource * quote.rate;
  return Math.max(0, roundCurrency(midMarket - amountInSettlement, quote.to));
}

// ---------------------------------------------------------------------------
// Rate-lock lifecycle (§5.5, §5.7)
// ---------------------------------------------------------------------------

export function isQuoteExpired(quote: FxQuote, now = Date.now()): boolean {
  return now >= quote.expiresAt;
}

export function msUntilExpiry(quote: FxQuote, now = Date.now()): number {
  if (!Number.isFinite(quote.expiresAt)) return Number.POSITIVE_INFINITY;
  return Math.max(0, quote.expiresAt - now);
}

export type RequoteOutcome =
  | { status: 'unchanged'; quote: FxQuote }
  | { status: 'within_tolerance'; quote: FxQuote; drift: number }
  | { status: 'reconfirm_required'; quote: FxQuote; drift: number };

/**
 * Re-price an expired quote and decide whether the engine may proceed silently.
 *
 * Per §5.5: if the new price is within the drift tolerance (default ±0.5%) the
 * engine continues on the fresh quote; otherwise the user must re-confirm.
 * `drift` is signed — positive means the new rate is *worse* for the user.
 */
export function requote(
  previous: FxQuote,
  feed: RateFeed,
  options: QuoteOptions & { tolerance?: number } = {}
): RequoteOutcome {
  const now = options.now ?? Date.now();
  if (!isQuoteExpired(previous, now)) {
    return { status: 'unchanged', quote: previous };
  }

  const fresh = getQuote(previous.from, previous.to, feed, options);
  const tolerance = options.tolerance ?? Orchestration.rateDriftTolerance;

  // Compare on the net rate so a widened spread counts as drift too. A *lower*
  // net rate means the user gets less for the same input — positive drift.
  const before = netRate(previous);
  const after = netRate(fresh);
  const drift = before === 0 ? 0 : (before - after) / before;

  return Math.abs(drift) <= tolerance
    ? { status: 'within_tolerance', quote: fresh, drift }
    : { status: 'reconfirm_required', quote: fresh, drift };
}

/** Human-readable rate line for the confirm screen, e.g. "$1 = ₦1,550.00". */
export function formatRateLine(quote: FxQuote): string {
  if (quote.from === quote.to) return '';
  const symbol = CURRENCY_SYMBOL[quote.to] ?? '';
  const rate = quote.rate.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: quote.rate < 1 ? 6 : 2,
  });
  return `1 ${quote.from} = ${symbol}${rate}`;
}

export const CURRENCY_SYMBOL: Partial<Record<CurrencyCode, string>> = {
  NGN: '₦',
  USD: '$',
  GBP: '£',
  EUR: '€',
};
