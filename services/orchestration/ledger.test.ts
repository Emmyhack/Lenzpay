import test from 'node:test';
import assert from 'node:assert/strict';

import { Ledger, UnbalancedPostingError, legPostings, reversalPostings } from './ledger';
import { planPayment } from './planner';
import { FIXED_NOW, cryptoWallet, feed, ngnBank, payee, usdAccount } from './__fixtures__';

const at = { now: FIXED_NOW };

function legsFor(sources: Parameters<typeof planPayment>[0], amount: number) {
  const result = planPayment(sources, amount, 'NGN', feed(), at);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  return result.plan.legs;
}

test('an unbalanced posting set is rejected outright', () => {
  const ledger = new Ledger();

  assert.throws(
    () =>
      ledger.post('txn_1', [
        {
          account: 'lenz_float',
          accountRef: 'float_NGN',
          direction: 'debit',
          amount: 100,
          currency: 'NGN',
          description: 'lopsided',
        },
      ]),
    UnbalancedPostingError
  );

  assert.equal(ledger.all().length, 0, 'nothing is written when the set is rejected');
});

test('negative amounts are rejected — direction carries the sign', () => {
  const ledger = new Ledger();
  assert.throws(
    () =>
      ledger.post('txn_1', [
        {
          account: 'lenz_float',
          accountRef: 'float_NGN',
          direction: 'debit',
          amount: -100,
          currency: 'NGN',
          description: 'negative',
        },
      ]),
    /non-negative/
  );
});

test('a same-currency leg books a simple two-sided movement', () => {
  const ledger = new Ledger();
  const [leg] = legsFor([ngnBank(50_000, { id: 'src_a' })], 4_500);

  ledger.post('txn_1', legPostings(leg, payee()));

  const entries = ledger.forTransaction('txn_1');
  assert.equal(entries.length, 4, 'source out, float in, float out, payee in');
  assert.equal(ledger.reconciles('txn_1'), true);
  assert.ok(
    entries.every((entry) => entry.currency === 'NGN'),
    'no clearing hop for a same-currency leg'
  );
  assert.equal(entries.filter((entry) => entry.account === 'fx_clearing').length, 0);
});

test('a converting leg routes through fx_clearing and balances in both currencies', () => {
  const ledger = new Ledger();
  const [leg] = legsFor([usdAccount(500, { id: 'src_usd' })], 100_000);

  ledger.post('txn_1', legPostings(leg, payee()));

  const net = ledger.netByCurrency('txn_1');
  assert.equal(net.USD, 0);
  assert.equal(net.NGN, 0);

  const clearing = ledger.forTransaction('txn_1').filter((e) => e.account === 'fx_clearing');
  assert.equal(clearing.length, 2, 'one side per currency');
  assert.equal(clearing.find((e) => e.currency === 'USD')?.direction, 'debit');
  assert.equal(clearing.find((e) => e.currency === 'NGN')?.direction, 'credit');
});

test('the spread booked to revenue equals the gap between the debit and the payout', () => {
  const ledger = new Ledger();
  const [leg] = legsFor([usdAccount(500, { id: 'src_usd' })], 100_000);

  ledger.post('txn_1', legPostings(leg, payee()));

  const revenue = ledger
    .forTransaction('txn_1')
    .filter((entry) => entry.account === 'fx_spread_revenue')
    .reduce((sum, entry) => sum + entry.amount, 0);

  // What the user gave up at mid-market, minus what the payee received.
  const midMarket = leg.amountInSourceCurrency * leg.quote.rate;
  assert.equal(revenue, leg.feeInSettlementCurrency);
  assert.ok(Math.abs(revenue - (midMarket - 100_000)) < 0.01);
});

test('a whole waterfall reconciles across every currency it touches', () => {
  const ledger = new Ledger();
  const legs = legsFor(
    [
      ngnBank(3_000, { id: 'src_ngn' }),
      usdAccount(4, { id: 'src_usd' }),
      cryptoWallet('USDT', 30, { id: 'src_usdt' }),
    ],
    50_000
  );
  assert.equal(legs.length, 3);

  for (const leg of legs) ledger.post('txn_1', legPostings(leg, payee()));

  assert.equal(ledger.reconciles('txn_1'), true);

  // The payee is credited exactly the amount owed, in one currency.
  const owed = ledger
    .forTransaction('txn_1')
    .filter((entry) => entry.account === 'payee_settlement')
    .reduce((sum, entry) => sum + entry.amount, 0);
  assert.equal(owed, 50_000);
});

test('reversing a single leg leaves the rest of the transaction intact', () => {
  const ledger = new Ledger();
  // ₦8,000 + 10 USDT (≈₦15,256): neither covers ₦20,000 alone.
  const legs = legsFor(
    [ngnBank(8_000, { id: 'src_ngn' }), cryptoWallet('USDT', 10, { id: 'src_usdt' })],
    20_000
  );
  assert.equal(legs.length, 2);

  for (const leg of legs) ledger.post('txn_1', legPostings(leg, payee()));

  // Partial reversal is first-class (§7): unwind only the crypto leg.
  const cryptoLeg = legs.find((leg) => leg.sourceCurrency === 'USDT')!;
  const original = ledger.forLeg(cryptoLeg.id).filter((entry) => !entry.reversalOf);
  ledger.post('txn_1', reversalPostings(original, 'off-ramp failed'));

  assert.equal(ledger.reconciles('txn_1'), true);

  // The crypto leg nets to zero on its own; the NGN leg is untouched.
  const cryptoNet = ledger
    .forLeg(cryptoLeg.id)
    .reduce(
      (acc, entry) => {
        const delta = entry.direction === 'debit' ? entry.amount : -entry.amount;
        acc[entry.currency] = (acc[entry.currency] ?? 0) + delta;
        return acc;
      },
      {} as Record<string, number>
    );
  for (const value of Object.values(cryptoNet)) {
    assert.ok(Math.abs(value) < 1e-9, 'the reversed leg fully unwinds');
  }

  const ngnLeg = legs.find((leg) => leg.sourceCurrency === 'NGN')!;
  assert.equal(
    ledger.forLeg(ngnLeg.id).some((entry) => entry.reversalOf),
    false,
    'the surviving leg has no reversal entries'
  );
});

test('every reversal entry points back at the entry it undoes', () => {
  const ledger = new Ledger();
  const [leg] = legsFor([usdAccount(500, { id: 'src_usd' })], 100_000);

  const original = ledger.post('txn_1', legPostings(leg, payee()));
  const reversed = ledger.post('txn_1', reversalPostings(original, 'settlement failed'));

  assert.equal(reversed.length, original.length);
  assert.deepEqual(
    reversed.map((entry) => entry.reversalOf),
    original.map((entry) => entry.id)
  );
  assert.deepEqual(
    reversed.map((entry) => entry.direction),
    original.map((entry) => (entry.direction === 'debit' ? 'credit' : 'debit'))
  );
});
