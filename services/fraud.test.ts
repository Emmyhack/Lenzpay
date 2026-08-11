import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePaymentRisk } from './fraud';
import type { FundingPlan, Payee } from '@/types/orchestration';

const payee: Payee = {
  id: 'payee_test',
  displayName: 'Test Merchant',
  resolutionType: 'lenz_tag',
  settlementCurrency: 'NGN',
  receivingMethod: 'bank_transfer',
  isVerified: true,
};

function plan(amount: number, legCount = 1): FundingPlan {
  return {
    id: 'plan_test',
    kind: legCount > 1 ? 'waterfall' : 'single_source',
    legs: Array.from({ length: legCount }, (_, index) => ({
      id: `leg_${index}`,
      sourceId: `source_${index}`,
      source: {
        id: `source_${index}`,
        type: 'bank',
        label: 'Bank',
        accountMask: '*0000',
        currency: 'NGN',
        balance: amount,
        rawBalance: amount,
        rawCurrency: 'NGN',
        isDefault: index === 0,
        lastSynced: new Date(),
      },
      amountInSourceCurrency: amount / legCount,
      sourceCurrency: 'NGN',
      amountInSettlementCurrency: amount / legCount,
      settlementCurrency: 'NGN',
      feeInSettlementCurrency: 0,
      quote: {
        id: 'identity', from: 'NGN', to: 'NGN', rate: 1, feeRate: 0,
        flatFee: 0, provider: 'none', quotedAt: Date.now(), expiresAt: Infinity,
      },
      status: 'planned',
    })),
    amount,
    currency: 'NGN',
    totalFees: 0,
    collectionCost: 0,
    expiresAt: null,
    createdAt: Date.now(),
  };
}

test('ordinary payments pass without creating a security alert', () => {
  assert.equal(evaluatePaymentRisk({
    amountNGN: 5_000,
    payee,
    plan: plan(5_000),
    perTransactionLimitNGN: 200_000,
    dailyLimitNGN: 10_000_000,
    spentTodayNGN: 0,
    unusualAmountAlertsEnabled: true,
  }), null);
});

test('a payment over the configured limit is blocked before execution', () => {
  const result = evaluatePaymentRisk({
    amountNGN: 250_000,
    payee,
    plan: plan(250_000),
    perTransactionLimitNGN: 200_000,
    dailyLimitNGN: 10_000_000,
    spentTodayNGN: 0,
    unusualAmountAlertsEnabled: false,
  });
  assert.equal(result?.blocked, true);
  assert.match(result?.reasons[0] ?? '', /exceeds/);
});

test('a five-source waterfall is surfaced as an orchestration risk signal', () => {
  const result = evaluatePaymentRisk({
    amountNGN: 50_000,
    payee,
    plan: plan(50_000, 5),
    perTransactionLimitNGN: 200_000,
    dailyLimitNGN: 10_000_000,
    spentTodayNGN: 0,
    unusualAmountAlertsEnabled: true,
  });
  assert.match(result?.reasons[0] ?? '', /5 funding sources/);
});
