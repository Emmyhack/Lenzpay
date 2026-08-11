import type { CurrencyCode } from '@/types/payment';

/**
 * EMVCo Merchant-Presented Mode QR parsing — the format behind NQR.
 *
 * ## Why this matters more than the Lenz QR format
 *
 * Nigeria has a national account-based QR standard (NQR) that banks and
 * merchants are being pushed to adopt, and it is built on EMVCo MPM. A merchant
 * who has already printed an NQR sticker is not going to print a second one for
 * us. Without this, every such merchant is unscannable — which is a far bigger
 * constraint on acceptance than anything inside the app.
 *
 * So the scanner reads both: `lenzpay://` codes we issue, and EMVCo codes we
 * didn't. Issuing NQR requires being a participant in the scheme, which is a
 * licensing question (ADR-005); *reading* it requires only this parser.
 *
 * ## Format
 *
 * Flat TLV: two-digit tag, two-digit length, value. Some tags are templates
 * whose value is itself TLV. Tag 63 is a CRC-16/CCITT-FALSE over everything
 * preceding it, including its own tag and length.
 *
 *   00 02 01                          payload format indicator
 *   52 04 5411                        merchant category code
 *   53 03 566                          currency, ISO 4217 numeric (566 = NGN)
 *   54 07 4500.00                     transaction amount (optional)
 *   58 02 NG                          country
 *   59 15 EMEKAS KITCHEN              merchant name
 *   63 04 A1B2                        CRC
 */

export interface EmvcoTag {
  tag: string;
  value: string;
}

export interface EmvcoPayload {
  /** Every top-level tag, in order, for callers needing something unmapped. */
  tags: EmvcoTag[];
  formatIndicator?: string;
  /** '11' = static (reusable), '12' = dynamic (one-shot). */
  initiationMethod?: string;
  merchantName?: string;
  merchantCity?: string;
  merchantCategoryCode?: string;
  countryCode?: string;
  currency?: CurrencyCode;
  amount?: number;
  /** Scheme-specific merchant account templates, tags 26–51. */
  merchantAccounts: { tag: string; value: string }[];
  /** Additional data template (tag 62), e.g. bill or reference number. */
  referenceLabel?: string;
  crcValid: boolean;
}

export type EmvcoParseResult =
  | { ok: true; payload: EmvcoPayload }
  | { ok: false; reason: string };

/** ISO 4217 numeric → our currency codes. Only what we can settle. */
const ISO_NUMERIC_CURRENCY: Record<string, CurrencyCode> = {
  '566': 'NGN',
  '840': 'USD',
  '826': 'GBP',
  '978': 'EUR',
};

const TAG_FORMAT_INDICATOR = '00';
const TAG_INITIATION_METHOD = '01';
const TAG_MCC = '52';
const TAG_CURRENCY = '53';
const TAG_AMOUNT = '54';
const TAG_COUNTRY = '58';
const TAG_MERCHANT_NAME = '59';
const TAG_MERCHANT_CITY = '60';
const TAG_ADDITIONAL_DATA = '62';
const TAG_CRC = '63';

/** Heuristic for "is this an EMVCo code at all" — cheap enough to try first. */
export function looksLikeEmvco(raw: string): boolean {
  const trimmed = raw.trim();
  return /^00\d{2}/.test(trimmed) && trimmed.includes(TAG_CRC);
}

/**
 * CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, no final xor.
 * Specified by EMVCo for tag 63.
 */
export function crc16(input: string): string {
  let crc = 0xffff;

  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Split a TLV string into its tags. Returns null on a malformed run. */
export function parseTlv(input: string): EmvcoTag[] | null {
  const tags: EmvcoTag[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    // A trailing fragment shorter than a header means the payload is truncated.
    if (cursor + 4 > input.length) return null;

    const tag = input.slice(cursor, cursor + 2);
    const lengthRaw = input.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(lengthRaw)) return null;

    const length = Number(lengthRaw);
    const start = cursor + 4;
    const end = start + length;
    if (end > input.length) return null;

    tags.push({ tag, value: input.slice(start, end) });
    cursor = end;
  }

  return tags;
}

export function parseEmvco(raw: string): EmvcoParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'Empty QR code' };

  const tags = parseTlv(trimmed);
  if (!tags) return { ok: false, reason: 'This QR code is damaged or incomplete' };

  const byTag = new Map(tags.map((entry) => [entry.tag, entry.value]));

  if (!byTag.has(TAG_FORMAT_INDICATOR)) {
    return { ok: false, reason: 'This QR code is not a payment code' };
  }

  // Verify the CRC over everything up to and including "6304".
  const crcIndex = trimmed.lastIndexOf(`${TAG_CRC}04`);
  let crcValid = false;
  if (crcIndex !== -1) {
    const expected = crc16(trimmed.slice(0, crcIndex + 4));
    crcValid = expected.toUpperCase() === (byTag.get(TAG_CRC) ?? '').toUpperCase();
  }

  const amountRaw = byTag.get(TAG_AMOUNT);
  const amount = amountRaw !== undefined ? Number(amountRaw) : undefined;

  // Tags 26–51 are scheme-specific merchant account templates. NQR's issuer
  // data lives here, and which sub-tag holds the account is scheme-defined —
  // we keep them raw rather than guessing.
  const merchantAccounts = tags.filter((entry) => {
    const numeric = Number(entry.tag);
    return numeric >= 26 && numeric <= 51;
  });

  const additional = byTag.get(TAG_ADDITIONAL_DATA);
  const referenceLabel = additional
    ? (parseTlv(additional) ?? []).find((entry) => entry.tag === '05')?.value
    : undefined;

  return {
    ok: true,
    payload: {
      tags,
      formatIndicator: byTag.get(TAG_FORMAT_INDICATOR),
      initiationMethod: byTag.get(TAG_INITIATION_METHOD),
      merchantName: byTag.get(TAG_MERCHANT_NAME)?.trim() || undefined,
      merchantCity: byTag.get(TAG_MERCHANT_CITY)?.trim() || undefined,
      merchantCategoryCode: byTag.get(TAG_MCC),
      countryCode: byTag.get(TAG_COUNTRY),
      currency: ISO_NUMERIC_CURRENCY[byTag.get(TAG_CURRENCY) ?? ''],
      amount: Number.isFinite(amount) && (amount ?? 0) > 0 ? amount : undefined,
      merchantAccounts: merchantAccounts.map((entry) => ({
        tag: entry.tag,
        value: entry.value,
      })),
      referenceLabel,
      crcValid,
    },
  };
}

/** Build an EMVCo payload. Used by tests, and by any future NQR issuing. */
export function buildEmvco(fields: {
  merchantName: string;
  merchantCity?: string;
  currency?: string;
  amount?: number;
  countryCode?: string;
  merchantAccount?: { tag: string; value: string };
}): string {
  const tlv = (tag: string, value: string) =>
    `${tag}${String(value.length).padStart(2, '0')}${value}`;

  let body = tlv(TAG_FORMAT_INDICATOR, '01');
  body += tlv(TAG_INITIATION_METHOD, fields.amount ? '12' : '11');
  if (fields.merchantAccount) {
    body += tlv(fields.merchantAccount.tag, fields.merchantAccount.value);
  }
  body += tlv(TAG_CURRENCY, fields.currency ?? '566');
  if (fields.amount) body += tlv(TAG_AMOUNT, fields.amount.toFixed(2));
  body += tlv(TAG_COUNTRY, fields.countryCode ?? 'NG');
  body += tlv(TAG_MERCHANT_NAME, fields.merchantName);
  if (fields.merchantCity) body += tlv(TAG_MERCHANT_CITY, fields.merchantCity);

  const withCrcHeader = `${body}${TAG_CRC}04`;
  return `${withCrcHeader}${crc16(withCrcHeader)}`;
}
