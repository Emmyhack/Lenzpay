import type { CurrencyCode } from '@/types/payment';
import type { Payee, PayeeResolutionType, ReceivingMethod } from '@/types/orchestration';

/**
 * Payee Resolution Service (§3.3).
 *
 * Turns whatever the user presented — a scanned QR payload, a typed account
 * number, a Lenz Tag, a crypto address — into a `Payee` the orchestration
 * engine can settle to.
 *
 * Resolution is deliberately separate from payment: the name confirmation step
 * in §3.2 is a fraud control, and it only works if we can resolve *and display*
 * the payee before any amount is committed.
 */

// ---------------------------------------------------------------------------
// QR payloads
// ---------------------------------------------------------------------------

/**
 * Lenz QR payload. Two accepted encodings:
 *
 *   lenzpay://pay?p=<payeeId>&n=<name>&c=NGN&a=<amount>&m=bank_transfer
 *   {"v":1,"p":"mkt_bolt_001","n":"Bolt — Emeka","c":"NGN","a":2800}
 *
 * `a` (amount) is optional — merchants with fixed prices embed it, open-ended
 * payees leave it out and the user types the amount.
 */
export interface DecodedQR {
  payeeId: string;
  displayName?: string;
  currency?: CurrencyCode;
  /** Fixed amount, when the merchant's QR pins one. */
  amount?: number;
  receivingMethod?: ReceivingMethod;
  accountNumber?: string;
  bankCode?: string;
  cryptoAddress?: string;
  lenzTag?: string;
}

export type DecodeResult =
  | { ok: true; payload: DecodedQR }
  | { ok: false; reason: string };

export const QR_SCHEME = 'lenzpay://pay';

export interface BuildQROptions {
  payeeId: string;
  displayName?: string;
  /** Pin a price. Omit for open-ended payees where the payer types the amount. */
  amount?: number;
  currency?: CurrencyCode;
  accountNumber?: string;
  bankCode?: string;
  cryptoAddress?: string;
}

/**
 * Canonical QR payload generator — the inverse of `decodeQRPayload`.
 *
 * Every screen that renders a Lenz QR must go through this. The merchant app
 * previously hand-wrote `lenzpay://pay/<id>` while the parser only accepted the
 * query form, so the app could not scan its own codes. Pairing the two here,
 * with a round-trip test, is what stops that drifting apart again.
 */
export function buildPaymentQR(options: BuildQROptions): string {
  const params: string[] = [`p=${encodeURIComponent(options.payeeId)}`];

  const append = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === '') return;
    params.push(`${key}=${encodeURIComponent(String(value))}`);
  };

  append('n', options.displayName);
  append('a', options.amount && options.amount > 0 ? options.amount : undefined);
  append('c', options.currency);
  append('acct', options.accountNumber);
  append('bank', options.bankCode);
  append('addr', options.cryptoAddress);

  return `${QR_SCHEME}?${params.join('&')}`;
}

export function decodeQRPayload(raw: string): DecodeResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'Empty QR code' };

  if (trimmed.startsWith('{')) return decodeJsonPayload(trimmed);
  if (trimmed.startsWith('lenzpay://')) return decodeUriPayload(trimmed);

  return { ok: false, reason: 'This QR code is not a Lenz Pay payment code' };
}

function decodeJsonPayload(raw: string): DecodeResult {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const payeeId = asString(parsed.p) ?? asString(parsed.payeeId);
    if (!payeeId) return { ok: false, reason: 'QR code is missing a payee reference' };

    return {
      ok: true,
      payload: {
        payeeId,
        displayName: asString(parsed.n) ?? asString(parsed.name),
        currency: asCurrency(parsed.c ?? parsed.currency),
        amount: asPositiveNumber(parsed.a ?? parsed.amount),
        receivingMethod: asReceivingMethod(parsed.m ?? parsed.method),
        accountNumber: asString(parsed.acct),
        bankCode: asString(parsed.bank),
        cryptoAddress: asString(parsed.addr),
        lenzTag: asString(parsed.tag),
      },
    };
  } catch {
    return { ok: false, reason: 'QR code could not be read' };
  }
}

/**
 * Hand-rolled rather than `URLSearchParams`, whose React Native polyfill is
 * only partially implemented and varies by runtime. A QR decoder is not a good
 * place to discover a platform gap.
 */
function parseQuery(query: string): Map<string, string> {
  const params = new Map<string, string>();

  for (const pair of query.split('&')) {
    if (!pair) continue;
    const separator = pair.indexOf('=');
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? '' : pair.slice(separator + 1);

    try {
      params.set(decodeURIComponent(rawKey), decodeURIComponent(rawValue.replace(/\+/g, ' ')));
    } catch {
      // A malformed percent-escape shouldn't discard the whole payload.
      params.set(rawKey, rawValue);
    }
  }

  return params;
}

function decodeUriPayload(raw: string): DecodeResult {
  const queryStart = raw.indexOf('?');

  // Path form — `lenzpay://pay/<payeeId>`. Carries no amount or destination,
  // just an identity to look up. Accepted because printed codes outlive the
  // format that produced them; new codes come from `buildPaymentQR`.
  if (queryStart === -1) {
    const path = raw.slice('lenzpay://'.length).replace(/^pay\/?/, '').replace(/\/+$/, '');
    const payeeId = decodeURIComponent(path.split('/')[0] ?? '');
    if (!payeeId) return { ok: false, reason: 'QR code is missing a payee reference' };
    return { ok: true, payload: { payeeId } };
  }

  const params = parseQuery(raw.slice(queryStart + 1));
  const payeeId = params.get('p');
  if (!payeeId) return { ok: false, reason: 'QR code is missing a payee reference' };

  return {
    ok: true,
    payload: {
      payeeId,
      displayName: params.get('n'),
      currency: asCurrency(params.get('c')),
      amount: asPositiveNumber(params.get('a')),
      receivingMethod: asReceivingMethod(params.get('m')),
      accountNumber: params.get('acct'),
      bankCode: params.get('bank'),
      cryptoAddress: params.get('addr'),
      lenzTag: params.get('tag'),
    },
  };
}

// ---------------------------------------------------------------------------
// NUBAN validation
// ---------------------------------------------------------------------------

const NUBAN_WEIGHTS = [3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3];

/**
 * CBN NUBAN check-digit validation for a 10-digit Nigerian account number.
 *
 * Catches typos client-side before we ever ask an aggregator to resolve the
 * name — a mistyped digit is by far the most common way a user sends money to
 * the wrong person. Only defined for institutions with a 3-digit bank code;
 * callers get `true` for other code lengths so newer 6-digit fintech codes
 * aren't wrongly rejected.
 */
export function isValidNUBAN(accountNumber: string, bankCode: string): boolean {
  if (!/^\d{10}$/.test(accountNumber)) return false;
  if (!/^\d{3}$/.test(bankCode)) return true; // not applicable — don't block

  const digits = `${bankCode}${accountNumber.slice(0, 9)}`.split('').map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * NUBAN_WEIGHTS[index], 0);
  const checkDigit = (10 - (sum % 10)) % 10;

  return checkDigit === Number(accountNumber[9]);
}

/** Lenz Tags: `@handle`, 3–20 chars of lowercase alphanumerics and underscores. */
const LENZ_TAG_PATTERN = /^@[a-z0-9_]{3,20}$/;

export function isValidLenzTag(tag: string): boolean {
  return LENZ_TAG_PATTERN.test(tag.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface ResolveInput {
  type: PayeeResolutionType;
  /** QR payload, account number, `@tag`, or crypto address. */
  value: string;
  /** Required alongside an account number. */
  bankCode?: string;
}

export type ResolveResult =
  | { ok: true; payee: Payee; fixedAmount?: number }
  | { ok: false; reason: string };

/**
 * Directory lookup. In mock mode this is a local table; in production it hits
 * the aggregator's name-enquiry endpoint and the Lenz merchant directory.
 */
export interface PayeeDirectory {
  lookupAccount(accountNumber: string, bankCode: string): Promise<Payee | undefined>;
  lookupTag(tag: string): Promise<Payee | undefined>;
  lookupId(payeeId: string): Promise<Payee | undefined>;
}

export async function resolvePayee(
  input: ResolveInput,
  directory: PayeeDirectory
): Promise<ResolveResult> {
  switch (input.type) {
    case 'qr': {
      const decoded = decodeQRPayload(input.value);
      if (!decoded.ok) return { ok: false, reason: decoded.reason };

      const known = await directory.lookupId(decoded.payload.payeeId);
      if (known) return { ok: true, payee: known, fixedAmount: decoded.payload.amount };

      // Unknown to the directory but self-describing — accept it only if the
      // payload carries a usable settlement destination.
      const fromPayload = payeeFromPayload(decoded.payload);
      if (!fromPayload) {
        return { ok: false, reason: 'This payee could not be verified. Do not pay.' };
      }
      return { ok: true, payee: fromPayload, fixedAmount: decoded.payload.amount };
    }

    case 'account_number': {
      const bankCode = input.bankCode ?? '';
      if (!bankCode) return { ok: false, reason: 'Select a bank first' };
      if (!/^\d{10}$/.test(input.value)) {
        return { ok: false, reason: 'Account numbers are 10 digits' };
      }
      if (!isValidNUBAN(input.value, bankCode)) {
        return { ok: false, reason: 'That account number is not valid for this bank' };
      }

      const payee = await directory.lookupAccount(input.value, bankCode);
      if (!payee) return { ok: false, reason: 'No account found. Check the number and bank.' };
      return { ok: true, payee };
    }

    case 'lenz_tag': {
      const tag = input.value.trim().toLowerCase();
      if (!isValidLenzTag(tag)) {
        return { ok: false, reason: 'Lenz Tags look like @merchant_name' };
      }
      const payee = await directory.lookupTag(tag);
      if (!payee) return { ok: false, reason: `${tag} is not registered on Lenz Pay` };
      return { ok: true, payee };
    }

    case 'crypto_address': {
      const address = input.value.trim();
      if (address.length < 26) return { ok: false, reason: 'That address looks incomplete' };
      return {
        ok: true,
        payee: {
          id: `crypto_${address.slice(0, 12)}`,
          displayName: `${address.slice(0, 6)}…${address.slice(-4)}`,
          resolutionType: 'crypto_address',
          settlementCurrency: 'USDT',
          receivingMethod: 'crypto_settlement',
          cryptoAddress: address,
          // Never claim a raw address is verified — there is no name to check
          // it against, so the UI must warn rather than reassure.
          isVerified: false,
        },
      };
    }
  }
}

function payeeFromPayload(payload: DecodedQR): Payee | undefined {
  const hasDestination = Boolean(
    (payload.accountNumber && payload.bankCode) || payload.cryptoAddress
  );
  if (!hasDestination) return undefined;

  return {
    id: payload.payeeId,
    displayName: payload.displayName ?? 'Unverified payee',
    resolutionType: 'qr',
    settlementCurrency: payload.currency ?? 'NGN',
    receivingMethod:
      payload.receivingMethod ??
      (payload.cryptoAddress ? 'crypto_settlement' : 'bank_transfer'),
    accountNumber: payload.accountNumber,
    bankCode: payload.bankCode,
    cryptoAddress: payload.cryptoAddress,
    isVerified: false,
  };
}

// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------

const CURRENCIES: CurrencyCode[] = ['NGN', 'USD', 'GBP', 'EUR', 'BTC', 'USDT', 'ETH'];
const METHODS: ReceivingMethod[] = ['bank_transfer', 'card_acquiring', 'crypto_settlement'];

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asPositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : undefined;
}

function asCurrency(value: unknown): CurrencyCode | undefined {
  const candidate = asString(value)?.toUpperCase();
  return CURRENCIES.find((currency) => currency === candidate);
}

function asReceivingMethod(value: unknown): ReceivingMethod | undefined {
  const candidate = asString(value);
  return METHODS.find((method) => method === candidate);
}
