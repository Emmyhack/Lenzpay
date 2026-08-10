import test from 'node:test';
import assert from 'node:assert/strict';

import type { Payee } from '@/types/orchestration';
import {
  buildPaymentQR,
  decodeQRPayload,
  isValidLenzTag,
  isValidNUBAN,
  resolvePayee,
  type PayeeDirectory,
} from './payee';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Brute-force the check digit so tests don't hard-code magic numbers. */
function validNUBAN(bankCode: string, serial: string): string {
  for (let digit = 0; digit <= 9; digit += 1) {
    const candidate = `${serial}${digit}`;
    if (isValidNUBAN(candidate, bankCode)) return candidate;
  }
  throw new Error('no valid check digit found');
}

const payee = (overrides: Partial<Payee> = {}): Payee => ({
  id: 'mkt_1',
  displayName: 'Test Merchant',
  resolutionType: 'qr',
  settlementCurrency: 'NGN',
  receivingMethod: 'bank_transfer',
  isVerified: true,
  ...overrides,
});

function directory(entries: Payee[] = []): PayeeDirectory {
  return {
    async lookupId(id) {
      return entries.find((entry) => entry.id === id);
    },
    async lookupAccount(accountNumber, bankCode) {
      return entries.find(
        (entry) => entry.accountNumber === accountNumber && entry.bankCode === bankCode
      );
    },
    async lookupTag(tag) {
      return entries.find((entry) => entry.lenzTag?.toLowerCase() === tag.toLowerCase());
    },
  };
}

// ---------------------------------------------------------------------------
// QR decoding
// ---------------------------------------------------------------------------

test('decodes the URI QR form, including a merchant-pinned amount', () => {
  const result = decodeQRPayload('lenzpay://pay?p=mkt_bolt_001&n=Bolt&c=NGN&a=2800');

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.payeeId, 'mkt_bolt_001');
  assert.equal(result.payload.displayName, 'Bolt');
  assert.equal(result.payload.currency, 'NGN');
  assert.equal(result.payload.amount, 2_800);
});

test('decodes the JSON QR form', () => {
  const result = decodeQRPayload('{"v":1,"p":"mkt_x","n":"Shop","c":"NGN"}');

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.payeeId, 'mkt_x');
  assert.equal(result.payload.amount, undefined, 'open-ended payees pin no amount');
});

test('rejects malformed, foreign, and empty QR codes', () => {
  for (const raw of ['', '   ', 'https://example.com/pay', '{not json', 'lenzpay://pay']) {
    assert.equal(decodeQRPayload(raw).ok, false, `should reject: ${raw}`);
  }
});

test('a QR code with no payee reference is rejected', () => {
  assert.equal(decodeQRPayload('lenzpay://pay?n=Bolt&a=100').ok, false);
  assert.equal(decodeQRPayload('{"n":"Bolt"}').ok, false);
});

test('a negative or zero pinned amount is ignored rather than trusted', () => {
  const result = decodeQRPayload('lenzpay://pay?p=mkt_x&a=-500');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.amount, undefined);
});

// ---------------------------------------------------------------------------
// NUBAN
// ---------------------------------------------------------------------------

test('NUBAN check digits are validated for 3-digit bank codes', () => {
  const account = validNUBAN('044', '012345678');

  assert.equal(isValidNUBAN(account, '044'), true);

  // Same digits, wrong bank — the bank code is part of the checksum.
  assert.equal(isValidNUBAN(account, '058'), false);
});

test('a single mistyped digit fails the checksum', () => {
  const account = validNUBAN('044', '012345678');
  const mistyped = `${account[0] === '9' ? '8' : '9'}${account.slice(1)}`;
  assert.equal(isValidNUBAN(mistyped, '044'), false);
});

test('non-10-digit input is never valid', () => {
  for (const value of ['123', '01234567890', 'abcdefghij', '']) {
    assert.equal(isValidNUBAN(value, '044'), false);
  }
});

test('6-digit fintech bank codes are not blocked by NUBAN validation', () => {
  assert.equal(isValidNUBAN('0123456789', '999992'), true);
});

test('Lenz Tags accept handles and reject junk', () => {
  assert.equal(isValidLenzTag('@ridehailer_lagos'), true);
  assert.equal(isValidLenzTag('@abc'), true);
  assert.equal(isValidLenzTag('ridehailer'), false, 'must start with @');
  assert.equal(isValidLenzTag('@ab'), false, 'too short');
  assert.equal(isValidLenzTag('@has spaces'), false);
  assert.equal(isValidLenzTag(`@${'x'.repeat(21)}`), false, 'too long');
});

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

test('a QR code resolves against the directory and carries its fixed amount through', async () => {
  const known = payee({ id: 'mkt_bolt_001', displayName: 'Bolt Driver — Emeka' });
  const result = await resolvePayee(
    { type: 'qr', value: 'lenzpay://pay?p=mkt_bolt_001&a=2800' },
    directory([known])
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payee.displayName, 'Bolt Driver — Emeka');
  assert.equal(result.payee.isVerified, true);
  assert.equal(result.fixedAmount, 2_800);
});

test('an unknown QR payee with no settlement destination is refused', async () => {
  const result = await resolvePayee(
    { type: 'qr', value: 'lenzpay://pay?p=unknown_merchant&n=Totally%20Legit' },
    directory()
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /could not be verified/);
});

test('an unknown QR payee that carries a destination resolves but is flagged unverified', async () => {
  const account = validNUBAN('044', '011122233');
  const result = await resolvePayee(
    { type: 'qr', value: `lenzpay://pay?p=new_merchant&n=Corner%20Shop&acct=${account}&bank=044` },
    directory()
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payee.isVerified, false, 'the UI must warn, not reassure');
  assert.equal(result.payee.accountNumber, account);
});

test('account-number resolution validates before it ever hits the directory', async () => {
  let looked = false;
  const spy: PayeeDirectory = {
    ...directory(),
    async lookupAccount() {
      looked = true;
      return undefined;
    },
  };

  // Same serial as a valid account, but with the check digit deliberately wrong.
  const valid = validNUBAN('044', '012345678');
  const broken = `${valid.slice(0, 9)}${(Number(valid[9]) + 1) % 10}`;

  const result = await resolvePayee(
    { type: 'account_number', value: broken, bankCode: '044' },
    spy
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /not valid for this bank/);
  assert.equal(looked, false, 'a checksum failure must not cost a network call');
});

test('account-number resolution requires a bank', async () => {
  const result = await resolvePayee({ type: 'account_number', value: '0123456789' }, directory());
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /Select a bank/);
});

test('a valid but unregistered account reports not-found', async () => {
  const account = validNUBAN('044', '012345678');
  const result = await resolvePayee(
    { type: 'account_number', value: account, bankCode: '044' },
    directory()
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /No account found/);
});

test('Lenz Tag resolution is case-insensitive', async () => {
  const known = payee({ lenzTag: '@coffeeandco', displayName: 'Coffee & Co.' });
  const result = await resolvePayee({ type: 'lenz_tag', value: '@CoffeeAndCo' }, directory([known]));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payee.displayName, 'Coffee & Co.');
});

test('a raw crypto address resolves but is never marked verified', async () => {
  const result = await resolvePayee(
    { type: 'crypto_address', value: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE' },
    directory()
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payee.isVerified, false);
  assert.equal(result.payee.receivingMethod, 'crypto_settlement');
  assert.match(result.payee.displayName, /…/, 'address is shown truncated');
});

test('a truncated crypto address is rejected', async () => {
  const result = await resolvePayee({ type: 'crypto_address', value: 'TQn9Y2kh' }, directory());
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// Fixture integrity
// ---------------------------------------------------------------------------

test('every directory payee has a checksum-valid account number', async () => {
  const { MOCK_PAYEES } = await import('@/mock/payees');

  for (const entry of MOCK_PAYEES) {
    if (!entry.accountNumber || !entry.bankCode) continue;
    assert.ok(
      isValidNUBAN(entry.accountNumber, entry.bankCode),
      `${entry.displayName}: ${entry.accountNumber} fails its own NUBAN check for bank ${entry.bankCode} — manual entry would reject it before the lookup`
    );
  }
});

test('the directory resolves its own entries end to end', async () => {
  const { MOCK_PAYEES, mockPayeeDirectory } = await import('@/mock/payees');
  const bolt = MOCK_PAYEES[0];

  const byAccount = await resolvePayee(
    { type: 'account_number', value: bolt.accountNumber!, bankCode: bolt.bankCode! },
    mockPayeeDirectory
  );
  assert.equal(byAccount.ok, true);
  if (!byAccount.ok) return;
  assert.equal(byAccount.payee.displayName, bolt.displayName);

  const byTag = await resolvePayee(
    { type: 'lenz_tag', value: bolt.lenzTag! },
    mockPayeeDirectory
  );
  assert.equal(byTag.ok, true);

  const byQr = await resolvePayee(
    { type: 'qr', value: `lenzpay://pay?p=${bolt.id}&a=2800` },
    mockPayeeDirectory
  );
  assert.equal(byQr.ok, true);
  if (!byQr.ok) return;
  assert.equal(byQr.fixedAmount, 2_800);
});

// ---------------------------------------------------------------------------
// Generator / parser round-trip
// ---------------------------------------------------------------------------

test('every QR this app generates is one this app can read back', () => {
  const cases = [
    { payeeId: 'mch_001' },
    { payeeId: 'mch_001', displayName: 'Emeka\u2019s Kitchen', currency: 'NGN' as const },
    { payeeId: 'mkt_bolt_001', amount: 2_800, currency: 'NGN' as const },
    { payeeId: 'weird id/with?chars&', displayName: 'A & B — Ltd' },
    { payeeId: 'p1', accountNumber: '0123456784', bankCode: '044' },
  ];

  for (const input of cases) {
    const payload = buildPaymentQR(input);
    const decoded = decodeQRPayload(payload);

    assert.equal(decoded.ok, true, `failed to decode: ${payload}`);
    if (!decoded.ok) continue;

    assert.equal(decoded.payload.payeeId, input.payeeId, `payee id lost in ${payload}`);
    if ('displayName' in input) assert.equal(decoded.payload.displayName, input.displayName);
    if ('amount' in input) assert.equal(decoded.payload.amount, input.amount);
    if ('accountNumber' in input) assert.equal(decoded.payload.accountNumber, input.accountNumber);
  }
});

test('an open-ended QR pins no amount', () => {
  const decoded = decodeQRPayload(buildPaymentQR({ payeeId: 'mch_001' }));
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.payload.amount, undefined);
});

test('the legacy path form still scans', () => {
  // Printed codes outlive the format that produced them.
  const decoded = decodeQRPayload('lenzpay://pay/mch_001');
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.payload.payeeId, 'mch_001');
});

test("the consumer app can scan the merchant app's own QR", async () => {
  const { MOCK_MERCHANT_PROFILE } = await import('@/mock/merchant');
  const { mockPayeeDirectory } = await import('@/mock/payees');

  const result = await resolvePayee(
    { type: 'qr', value: MOCK_MERCHANT_PROFILE.qrCodeValue },
    mockPayeeDirectory
  );

  assert.equal(result.ok, true, 'the merchant QR must resolve, or the loop is broken');
  if (!result.ok) return;
  assert.equal(result.payee.id, MOCK_MERCHANT_PROFILE.id);
  assert.equal(result.payee.isVerified, true);
});

test('a merchant-set amount survives all the way to a resolved payee', async () => {
  const { mockPayeeDirectory } = await import('@/mock/payees');

  const result = await resolvePayee(
    { type: 'qr', value: buildPaymentQR({ payeeId: 'mch_001', amount: 7_500 }) },
    mockPayeeDirectory
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fixedAmount, 7_500);
});
