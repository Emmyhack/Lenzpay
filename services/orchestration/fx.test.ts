import test from 'node:test';
import assert from 'node:assert/strict';

import { CURRENCY_PRECISION, type CurrencyCode } from '@/types/payment';
import { roundTo } from '@/services/money';
import {
  feeInSettlementCurrency,
  fromSettlement,
  getQuote,
  isQuoteExpired,
  legFee,
  requote,
  toSettlement,
} from './fx';
import { FIXED_NOW, feed } from './__fixtures__';

test('same-currency quotes are identity and never expire', () => {
  const quote = getQuote('NGN', 'NGN', feed(), { now: FIXED_NOW });

  assert.equal(quote.rate, 1);
  assert.equal(quote.feeRate, 0);
  assert.equal(quote.flatFee, 0);
  assert.equal(isQuoteExpired(quote, FIXED_NOW + 10 ** 9), false);
  assert.equal(toSettlement(quote, 5_000), 5_000);
  assert.equal(fromSettlement(quote, 5_000), 5_000);
  assert.equal(feeInSettlementCurrency(quote, 5_000), 0);
});

test('cross rates derive correctly from the NGN table', () => {
  const quote = getQuote('USD', 'NGN', feed(), { now: FIXED_NOW });
  assert.equal(quote.rate, 1_550);

  // USD -> USDT routes through NGN: 1550 / 1548
  const stable = getQuote('USD', 'USDT', feed(), { now: FIXED_NOW });
  assert.ok(Math.abs(stable.rate - 1_550 / 1_548) < 1e-12);
});

test('fromSettlement is a safe inverse of toSettlement — the payee is never short', () => {
  const corridors: [CurrencyCode, CurrencyCode][] = [
    ['USD', 'NGN'],
    ['GBP', 'NGN'],
    ['USDT', 'NGN'],
    ['BTC', 'NGN'],
    ['ETH', 'NGN'],
  ];
  const targets = [1, 37.5, 100, 4_500, 18_400.33, 250_000, 1_000_000];

  for (const [from, to] of corridors) {
    const quote = getQuote(from, to, feed(), { now: FIXED_NOW });

    // A leg can only debit whole minor units of the source currency, so the
    // smallest possible over-shoot is one of those, valued in the target.
    const oneSourceUnit = 10 ** -CURRENCY_PRECISION[from];
    const maxOvershoot = oneSourceUnit * quote.rate + 1;

    for (const target of targets) {
      const required = fromSettlement(quote, target);
      const delivered = toSettlement(quote, required);

      // Must never under-deliver...
      assert.ok(
        delivered >= target,
        `${from}->${to} @ ${target}: delivered ${delivered} < target ${target}`
      );
      // ...and must not over-deliver beyond that unavoidable rounding step.
      assert.ok(
        delivered - target <= maxOvershoot,
        `${from}->${to} @ ${target}: over-delivered by ${delivered - target}, max ${maxOvershoot}`
      );
    }
  }
});

test('legFee books the whole gap between what was debited and what lands', () => {
  const quote = getQuote('USD', 'NGN', feed(), { now: FIXED_NOW });

  // Deliver ₦1: rounding up to the nearest cent buys far more than ₦1 of NGN.
  const debited = fromSettlement(quote, 1);
  const fee = legFee(quote, debited, 1);

  // gross must reconstruct the mid-market value of the debit exactly — this is
  // what keeps the ledger's FX clearing account balanced at the quoted rate.
  assert.equal(1 + fee, roundTo(debited * quote.rate, 2));
});

test('toSettlement floors and never returns a negative for dust amounts', () => {
  const quote = getQuote('USD', 'NGN', feed(), { now: FIXED_NOW });
  // $0.01 grosses ~₦15.35, below the ₦50 flat fee.
  assert.equal(toSettlement(quote, 0.01), 0);
});

test('fee is the gap between mid-market value and what lands', () => {
  const quote = getQuote('USD', 'NGN', feed(), { now: FIXED_NOW });
  const amount = 100;

  const delivered = toSettlement(quote, amount);
  const fee = feeInSettlementCurrency(quote, amount);

  assert.equal(delivered + fee, amount * quote.rate);
  // 0.9% spread on ₦155,000 plus the ₦50 flat fee.
  assert.equal(fee, 100 * 1_550 * 0.009 + 50);
});

test('quotes expire at the end of the rate-lock window', () => {
  const quote = getQuote('USD', 'NGN', feed(), { now: FIXED_NOW, lockWindowMs: 45_000 });

  assert.equal(isQuoteExpired(quote, FIXED_NOW), false);
  assert.equal(isQuoteExpired(quote, FIXED_NOW + 44_999), false);
  assert.equal(isQuoteExpired(quote, FIXED_NOW + 45_000), true);
});

test('requote on an unexpired quote is a no-op', () => {
  const quote = getQuote('USD', 'NGN', feed(), { now: FIXED_NOW });
  const outcome = requote(quote, feed(), { now: FIXED_NOW + 1_000 });

  assert.equal(outcome.status, 'unchanged');
  assert.equal(outcome.quote, quote);
});

test('small rate drift re-quotes silently, large drift demands re-confirmation', () => {
  const quote = getQuote('USD', 'NGN', feed(), { now: FIXED_NOW });
  const later = FIXED_NOW + 60_000;

  // 0.2% move — inside the ±0.5% tolerance.
  const small = requote(quote, feed({ USD: 1_550 * 0.998 }), { now: later });
  assert.equal(small.status, 'within_tolerance');
  assert.ok(Math.abs(small.status === 'within_tolerance' ? small.drift : 1) < 0.005);

  // 2% move — outside it.
  const large = requote(quote, feed({ USD: 1_550 * 0.98 }), { now: later });
  assert.equal(large.status, 'reconfirm_required');
});

test('drift is signed so a move in the user’s favour is distinguishable', () => {
  const quote = getQuote('USD', 'NGN', feed(), { now: FIXED_NOW });
  const later = FIXED_NOW + 60_000;

  const worse = requote(quote, feed({ USD: 1_500 }), { now: later });
  const better = requote(quote, feed({ USD: 1_600 }), { now: later });

  assert.ok(worse.status !== 'unchanged' && worse.drift > 0, 'weaker rate → positive drift');
  assert.ok(better.status !== 'unchanged' && better.drift < 0, 'stronger rate → negative drift');
});
