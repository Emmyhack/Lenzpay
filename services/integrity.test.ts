import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePaymentRisk } from './fraud';
import { buildEmvco, crc16, looksLikeEmvco, parseEmvco, parseTlv } from './emvco';
import { decodeQRPayload, resolvePayee } from './payee';
import { DisputeQueue, isDisputable } from './disputes';
import { Ledger, legPostings } from './orchestration/ledger';
import { planPayment } from './orchestration/planner';
import { devRateFeed } from './orchestration/fx';
import { collectionCost, resetRailCosts, setRailCosts } from './orchestration/costs';
import { Orchestration } from '@/constants/config';
import { FIXED_NOW, ngnBank, payee as makePayee } from './orchestration/__fixtures__';
import type { Transaction } from '@/types/payment';

const feed = devRateFeed(FIXED_NOW);

function planFor(sources: Parameters<typeof planPayment>[0], amount: number, maxLegs = 2) {
  const result = planPayment(sources, amount, 'NGN', feed, { now: FIXED_NOW, maxLegs });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  return result.plan;
}

// ---------------------------------------------------------------------------
// Fraud rule must be reachable
// ---------------------------------------------------------------------------

test('the wide-waterfall fraud rule can actually fire at the current leg cap', () => {
  const plan = planFor(
    [ngnBank(3_000, { id: 'a' }), ngnBank(2_500, { id: 'b' })],
    4_500,
    Orchestration.maxWaterfallLegs
  );

  const alert = evaluatePaymentRisk({
    amountNGN: 4_500,
    payee: makePayee(),
    plan,
    perTransactionLimitNGN: 200_000,
    unusualAmountAlertsEnabled: false,
  });

  assert.notEqual(alert, null, 'a maximally wide waterfall must be a signal');
  assert.ok(alert!.reasons.some((r) => r.includes('funding sources')));
});

test('a single-source payment to a verified payee raises nothing', () => {
  const alert = evaluatePaymentRisk({
    amountNGN: 4_500,
    payee: makePayee(),
    plan: planFor([ngnBank(50_000, { id: 'a' })], 4_500),
    perTransactionLimitNGN: 200_000,
    unusualAmountAlertsEnabled: false,
  });

  assert.equal(alert, null);
});

// ---------------------------------------------------------------------------
// Negotiated rail pricing
// ---------------------------------------------------------------------------

test('negotiated commercial terms override the published list price', () => {
  const bank = ngnBank(100_000, { id: 'b' });
  assert.equal(collectionCost(bank, 4_500), 55, 'list price');

  setRailCosts({ bank: { flatFee: 30 } });
  assert.equal(collectionCost(bank, 4_500), 30, 'negotiated');

  resetRailCosts();
  assert.equal(collectionCost(bank, 4_500), 55);
});

test('cheaper negotiated debits make more legs economic', () => {
  const dust = ngnBank(60, { id: 'dust' });

  resetRailCosts();
  const atListPrice = planFor([ngnBank(20_000, { id: 'big' }), dust], 15_000);
  assert.equal(atListPrice.legs.length, 1, '₦60 is not worth a ₦55 debit');

  setRailCosts({ bank: { flatFee: 5 } });
  const atNegotiated = planFor([ngnBank(20_000, { id: 'big' }), dust], 20_050);
  assert.ok(atNegotiated.legs.length >= 1);
  resetRailCosts();
});

// ---------------------------------------------------------------------------
// EMVCo / NQR
// ---------------------------------------------------------------------------

test('CRC-16/CCITT-FALSE matches the EMVCo reference value', () => {
  // The canonical example from the EMVCo MPM specification.
  assert.equal(crc16('123456789'), '29B1');
});

test('TLV parsing handles nested templates and rejects truncation', () => {
  const tags = parseTlv('000201010211');
  assert.deepEqual(tags, [
    { tag: '00', value: '01' },
    { tag: '01', value: '11' },
  ]);

  assert.equal(parseTlv('0002'), null, 'header with no value');
  assert.equal(parseTlv('00050'), null, 'value shorter than declared');
});

test('a generated EMVCo code round-trips through the parser', () => {
  const code = buildEmvco({
    merchantName: 'EMEKAS KITCHEN',
    merchantCity: 'LAGOS',
    amount: 4_500,
    merchantAccount: { tag: '26', value: '0011NG.COM.NIBSS' },
  });

  assert.equal(looksLikeEmvco(code), true);

  const parsed = parseEmvco(code);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.payload.crcValid, true);
  assert.equal(parsed.payload.merchantName, 'EMEKAS KITCHEN');
  assert.equal(parsed.payload.merchantCity, 'LAGOS');
  assert.equal(parsed.payload.currency, 'NGN');
  assert.equal(parsed.payload.amount, 4_500);
  assert.equal(parsed.payload.merchantAccounts.length, 1);
});

test('a static NQR-style code carries no amount', () => {
  const parsed = parseEmvco(buildEmvco({ merchantName: 'CORNER SHOP' }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.payload.amount, undefined);
  assert.equal(parsed.payload.initiationMethod, '11', 'static');
});

test('a corrupted EMVCo code is refused rather than paid', () => {
  const code = buildEmvco({ merchantName: 'EMEKAS KITCHEN', amount: 4_500 });
  // Flip a digit in the amount, leaving the CRC stale.
  const tampered = code.replace('4500.00', '9500.00');

  const decoded = decodeQRPayload(tampered);
  assert.equal(decoded.ok, false);
  if (decoded.ok) return;
  assert.match(decoded.reason, /checksum/i);
});

test('the scanner accepts national QR codes it did not issue', async () => {
  const code = buildEmvco({
    merchantName: 'MAMA PUT KITCHEN',
    amount: 2_500,
    merchantAccount: { tag: '26', value: '0011NG.COM.NIBSS0106123456' },
  });

  const directory = {
    async lookupId() {
      return undefined;
    },
    async lookupAccount() {
      return undefined;
    },
    async lookupTag() {
      return undefined;
    },
  };

  const result = await resolvePayee({ type: 'emvco', value: code }, directory);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payee.displayName, 'MAMA PUT KITCHEN');
  assert.equal(result.fixedAmount, 2_500);
  assert.equal(result.payee.isVerified, false, 'not in our directory — warn, do not reassure');
});

test('the same merchant code always resolves to the same payee id', () => {
  const code = buildEmvco({
    merchantName: 'SHOP',
    merchantAccount: { tag: '26', value: '0011NG.COM.NIBSS0106999888' },
  });

  const a = decodeQRPayload(code);
  const b = decodeQRPayload(code);
  assert.equal(a.ok && b.ok && a.payload.payeeId === b.payload.payeeId, true);
});

// ---------------------------------------------------------------------------
// Disputes and partial reversal
// ---------------------------------------------------------------------------

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn_1',
    merchantName: 'Shoprite Lekki',
    category: 'shopping',
    amount: 18_400,
    direction: 'debit',
    sourceLabel: 'Smart Split (2 sources)',
    mode: 'split',
    pointsEarned: 92,
    cashbackNGN: 22,
    timestamp: new Date(FIXED_NOW),
    status: 'completed',
    txnRef: 'LNZ-TEST-002',
    ...overrides,
  };
}

test('disputing one leg reverses only that leg', () => {
  const ledger = new Ledger();
  const plan = planFor([ngnBank(3_000, { id: 'a' }), ngnBank(2_500, { id: 'b' })], 4_500);
  for (const leg of plan.legs) ledger.post('txn_1', legPostings(leg, makePayee()));

  const queue = new DisputeQueue();
  const disputed = plan.legs[1];
  const dispute = queue.raise({
    transaction: transaction({ amount: 4_500 }),
    reason: 'not_received',
    legs: [disputed],
    now: FIXED_NOW,
  });

  assert.equal(dispute.amount, disputed.amountInSettlementCurrency);

  queue.resolveRefunded(dispute.id, ledger, FIXED_NOW);

  // The disputed leg nets to zero; the untouched leg has no reversals.
  const reversedLeg = ledger.forLeg(disputed.id);
  const net = reversedLeg.reduce(
    (sum, e) => sum + (e.direction === 'debit' ? e.amount : -e.amount),
    0
  );
  assert.ok(Math.abs(net) < 1e-9, 'the disputed leg fully unwinds');

  assert.equal(
    ledger.forLeg(plan.legs[0].id).some((e) => e.reversalOf),
    false,
    'the good leg is untouched'
  );
  assert.equal(ledger.reconciles('txn_1'), true);
});

test('disputing the whole transaction reverses every leg', () => {
  const ledger = new Ledger();
  const plan = planFor([ngnBank(3_000, { id: 'a' }), ngnBank(2_500, { id: 'b' })], 4_500);
  for (const leg of plan.legs) ledger.post('txn_1', legPostings(leg, makePayee()));

  const queue = new DisputeQueue();
  const dispute = queue.raise({
    transaction: transaction({ amount: 4_500 }),
    reason: 'unauthorised',
    now: FIXED_NOW,
  });

  assert.equal(dispute.legIds.length, 0, 'no legs means the whole transaction');
  assert.equal(dispute.amount, 4_500);

  queue.resolveRefunded(dispute.id, ledger, FIXED_NOW);

  for (const leg of plan.legs) {
    assert.ok(ledger.forLeg(leg.id).some((e) => e.reversalOf), 'every leg reversed');
  }
  assert.equal(ledger.reconciles('txn_1'), true);
});

test('a rejected dispute moves no money', () => {
  const ledger = new Ledger();
  const plan = planFor([ngnBank(50_000, { id: 'a' })], 4_500);
  ledger.post('txn_1', legPostings(plan.legs[0], makePayee()));
  const before = ledger.all().length;

  const queue = new DisputeQueue();
  const dispute = queue.raise({ transaction: transaction(), reason: 'other', now: FIXED_NOW });
  queue.resolveRejected(dispute.id, FIXED_NOW);

  assert.equal(queue.get(dispute.id)!.status, 'resolved_rejected');
  assert.equal(ledger.all().length, before, 'no entries written');
});

test('disputes queue rather than silently vanish while there is no backend', () => {
  const queue = new DisputeQueue();
  const dispute = queue.raise({ transaction: transaction(), reason: 'duplicate', now: FIXED_NOW });

  assert.equal(dispute.status, 'queued');
  assert.equal(queue.queued().length, 1);

  queue.markSubmitted(dispute.id, FIXED_NOW);
  assert.equal(queue.queued().length, 0);
  assert.equal(queue.get(dispute.id)!.status, 'submitted');
});

test('only settled transactions inside the window can be disputed', () => {
  assert.equal(isDisputable(transaction(), FIXED_NOW), true);
  assert.equal(isDisputable(transaction({ status: 'failed' }), FIXED_NOW), false);
  assert.equal(
    isDisputable(transaction(), FIXED_NOW + 91 * 24 * 60 * 60 * 1000),
    false,
    'past the 90-day window'
  );
});

test('an EMVCo code scanned as a plain QR is still resolved, not refused', async () => {
  // The camera cannot know which scheme it read — everything arrives as 'qr'.
  const code = buildEmvco({ merchantName: 'ROADSIDE SUYA', amount: 1_200 });
  const directory = {
    async lookupId() {
      return undefined;
    },
    async lookupAccount() {
      return undefined;
    },
    async lookupTag() {
      return undefined;
    },
  };

  const result = await resolvePayee({ type: 'qr', value: code }, directory);

  assert.equal(result.ok, true, 'scanning a national QR must work through the camera path');
  if (!result.ok) return;
  assert.equal(result.payee.displayName, 'ROADSIDE SUYA');
  assert.equal(result.fixedAmount, 1_200);
});
