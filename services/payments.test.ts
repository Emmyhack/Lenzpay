import test from 'node:test';
import assert from 'node:assert/strict';

import type { ExecutionResult } from '@/types/orchestration';
import type { PaymentSource } from '@/types/payment';
import { initiatePayment } from './payments';
import {
  IdempotencyStore,
  Ledger,
  RailRegistry,
  configureEngine,
  createMockRail,
  createMockSettlementRail,
  paymentEngine,
  Treasury,
} from './orchestration';
import { payee } from './orchestration/__fixtures__';

/**
 * Integration coverage for the path the app actually runs:
 * usePaymentLogic → paymentEngine.plan → initiatePayment → paymentEngine.execute.
 *
 * The unit suites prove the engine's internals; this proves the wiring between
 * them, including the shape of the `Transaction` the receipt screen renders.
 */

function useDeterministicEngine(
  options: { failCaptureFor?: Set<string>; settlementFails?: boolean } = {}
) {
  const ledger = new Ledger();
  const rail = createMockRail({
    id: 'test',
    latencyMs: 0,
    failCaptureFor: options.failCaptureFor,
  });

  configureEngine({
    rails: new RailRegistry()
      .registerType('bank', rail)
      .registerType('wallet', rail)
      .registerType('usd', rail)
      .registerType('crypto', rail),
    settlementRail: createMockSettlementRail({ fail: options.settlementFails }),
    ledger,
    idempotency: new IdempotencyStore<ExecutionResult>(),
    treasury: new Treasury(),
  });

  return ledger;
}

function bank(id: string, rawBalance: number, label: string): PaymentSource {
  return {
    id,
    type: 'bank',
    label,
    accountMask: `*${id.slice(-4)}`,
    currency: 'NGN',
    balance: rawBalance,
    rawBalance,
    rawCurrency: 'NGN',
    isDefault: false,
    lastSynced: new Date(),
  };
}

function usd(id: string, rawBalance: number, label: string): PaymentSource {
  return { ...bank(id, rawBalance, label), type: 'usd', rawCurrency: 'USD' };
}

function planFor(sources: PaymentSource[], amount: number) {
  const result = paymentEngine.plan(sources, amount, 'NGN');
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  return result.plan;
}

const BASE = { userId: 'usr_001', attemptNonce: 'nonce_1', mode: 'auto' as const };

test('a single-source payment produces a complete receipt', async () => {
  const ledger = useDeterministicEngine();
  const plan = planFor([bank('src_a', 50_000, 'Access Bank')], 4_500);

  const result = await initiatePayment({
    ...BASE,
    payee: payee(),
    plan,
    merchantCategory: 'transport',
  });

  assert.equal(result.success, true);
  const txn = result.transaction!;
  assert.equal(txn.amount, 4_500);
  assert.equal(txn.status, 'completed');
  assert.equal(txn.sourceLabel, 'Access Bank *rc_a');
  assert.equal(txn.fxRate, undefined, 'no FX leg means no rate line');
  assert.equal(txn.cashbackNGN, Math.round(4_500 * 0.015), 'transport cashback rate applies');
  assert.ok(txn.txnRef.startsWith('LNZ-'));
  assert.equal(ledger.reconciles(txn.id), true);
});

test('a waterfall receipt names the split and reconciles', async () => {
  const ledger = useDeterministicEngine();
  const plan = planFor(
    [bank('src_a', 3_000, 'GTBank'), bank('src_b', 2_500, 'Access Bank')],
    4_500
  );

  const result = await initiatePayment({ ...BASE, mode: 'split', payee: payee(), plan });

  assert.equal(result.success, true);
  assert.equal(result.transaction!.sourceLabel, 'Smart Split (2 sources)');
  const execution = result.execution!;
  assert.equal(execution.ok, true);
  if (!execution.ok) return;
  assert.equal(execution.legs.length, 2);
  assert.equal(ledger.reconciles(result.transaction!.id), true);
});

test('a cross-currency payment surfaces the rate on the receipt', async () => {
  useDeterministicEngine();
  const plan = planFor([usd('src_usd', 500, 'Grey Finance')], 100_000);

  const result = await initiatePayment({ ...BASE, payee: payee(), plan });

  assert.equal(result.success, true);
  assert.match(result.transaction!.fxRate ?? '', /^1 USD = ₦/);
});

test('a failed payment reports the reason and no transaction', async () => {
  useDeterministicEngine({ failCaptureFor: new Set(['src_b']) });
  const plan = planFor(
    [bank('src_a', 3_000, 'GTBank'), bank('src_b', 2_500, 'Access Bank')],
    4_500
  );

  const result = await initiatePayment({ ...BASE, mode: 'split', payee: payee(), plan });

  assert.equal(result.success, false);
  assert.equal(result.transaction, undefined);
  assert.match(result.failureReason ?? '', /declined/);
  assert.equal(result.needsManualReview, false, 'the captured leg was refunded');
});

test('the same payment submitted twice charges once', async () => {
  useDeterministicEngine();
  const plan = planFor([bank('src_a', 50_000, 'Access Bank')], 4_500);

  const first = await initiatePayment({ ...BASE, payee: payee(), plan });
  const second = await initiatePayment({ ...BASE, payee: payee(), plan });

  assert.equal(first.transaction!.id, second.transaction!.id, 'replayed, not re-executed');
});

test('a deliberate repeat payment with a new nonce is a distinct transaction', async () => {
  useDeterministicEngine();
  const plan = planFor([bank('src_a', 50_000, 'Access Bank')], 4_500);

  const first = await initiatePayment({ ...BASE, payee: payee(), plan });
  const repeat = await initiatePayment({
    ...BASE,
    attemptNonce: 'nonce_2',
    payee: payee(),
    plan,
  });

  assert.notEqual(first.transaction!.id, repeat.transaction!.id);
});
