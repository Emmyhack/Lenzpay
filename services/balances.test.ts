import test from 'node:test';
import assert from 'node:assert/strict';

import type { PaymentSource } from '@/types/payment';
import {
  createApiBalanceProvider,
  createMockBalanceProvider,
  type BalanceHttpClient,
} from './balances';

/**
 * Balance providers — the input `prepare()` uses to decide whether to front
 * money on a leg that cannot be locked.
 */

const NOW = 1_760_000_000_000;

function source(overrides: Partial<PaymentSource> = {}): PaymentSource {
  return {
    id: 'src_a',
    type: 'bank',
    label: 'Access Bank',
    accountMask: '*4421',
    currency: 'NGN',
    balance: 100_000,
    rawBalance: 100_000,
    rawCurrency: 'NGN',
    isDefault: false,
    lastSynced: new Date(NOW),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

test('a stable mock reports the spendable balance, not the headline one', async () => {
  const account = source({ rawBalance: 100_000, spendableRawBalance: 85_000 });
  const provider = createMockBalanceProvider({
    lookup: () => account,
    now: () => NOW,
  });

  const reading = await provider.read(account);

  assert.equal(reading.ok, true);
  if (!reading.ok) return;
  assert.equal(reading.balance, 85_000);
  assert.equal(reading.observedAt, NOW);
});

test('sufficiency answers the question without disclosing the balance', async () => {
  const account = source({ rawBalance: 50_000 });
  const provider = createMockBalanceProvider({ lookup: () => account, now: () => NOW });

  assert.ok(provider.sufficient);
  const yes = await provider.sufficient!(account, 40_000);
  const no = await provider.sufficient!(account, 60_000);

  assert.deepEqual(yes, { ok: true, sufficient: true, observedAt: NOW });
  assert.deepEqual(no, { ok: true, sufficient: false, observedAt: NOW });
});

test('an unlinked source fails rather than reporting zero', async () => {
  const provider = createMockBalanceProvider({ lookup: () => undefined });
  const reading = await provider.read(source());

  assert.equal(reading.ok, false);
  if (reading.ok) return;
  assert.match(
    reading.reason,
    /no longer linked/,
    'reporting a zero balance would look like an empty account rather than a broken link'
  );
});

test('drift moves balances both ways, so the failure path is reachable in dev', async () => {
  const account = source({ rawBalance: 100_000 });

  const low = createMockBalanceProvider({
    lookup: () => account,
    driftRatio: 0.1,
    random: () => 0, // -10%
    now: () => NOW,
  });
  const high = createMockBalanceProvider({
    lookup: () => account,
    driftRatio: 0.1,
    random: () => 1, // +10%
    now: () => NOW,
  });

  const lowReading = await low.read(account);
  const highReading = await high.read(account);

  assert.equal(lowReading.ok, true);
  assert.equal(highReading.ok, true);
  if (!lowReading.ok || !highReading.ok) return;

  assert.ok(lowReading.balance < 100_000, 'balances can fall');
  assert.ok(highReading.balance > 100_000, 'and rise — a one-way drift is not drift');
});

test('drift never produces a negative balance', async () => {
  const account = source({ rawBalance: 100 });
  const provider = createMockBalanceProvider({
    lookup: () => account,
    driftRatio: 5,
    random: () => 0,
  });

  const reading = await provider.read(account);
  assert.equal(reading.ok, true);
  if (!reading.ok) return;
  assert.ok(reading.balance >= 0);
});

// ---------------------------------------------------------------------------
// API provider
// ---------------------------------------------------------------------------

function client(handler: (url: string) => unknown): BalanceHttpClient {
  return {
    async get<T>(url: string) {
      return { data: handler(url) as T };
    },
  };
}

test('the API provider reads the spendable figure the backend reports', async () => {
  const provider = createApiBalanceProvider({
    client: client(() => ({ spendable: 42_000, observedAt: NOW })),
  });

  const reading = await provider.read(source());

  assert.equal(reading.ok, true);
  if (!reading.ok) return;
  assert.equal(reading.balance, 42_000);
  assert.equal(reading.observedAt, NOW);
});

test('sufficiency is omitted entirely when the backend does not offer it', () => {
  const without = createApiBalanceProvider({ client: client(() => ({ spendable: 1 })) });
  const with_ = createApiBalanceProvider({
    client: client(() => ({ sufficient: true })),
    supportsSufficiency: true,
  });

  assert.equal(
    without.sufficient,
    undefined,
    'prepare() must fall back to reading, not call an endpoint that is not there'
  );
  assert.ok(with_.sufficient);
});

test('a transport failure reads as unreachable, not as an empty account', async () => {
  const provider = createApiBalanceProvider({
    client: {
      async get() {
        throw new Error('Request failed with status code 502');
      },
    },
  });

  const reading = await provider.read(source());

  assert.equal(reading.ok, false);
  if (reading.ok) return;
  assert.match(reading.reason, /Could not reach/);
  assert.doesNotMatch(reading.reason, /502/, 'a status code is not something a user can act on');
});

test('a malformed response fails rather than being coerced to a number', async () => {
  const provider = createApiBalanceProvider({
    client: client(() => ({ spendable: 'lots' })),
  });

  const reading = await provider.read(source());
  assert.equal(reading.ok, false);
});

test('the source id is escaped into the path', async () => {
  const seen: string[] = [];
  const provider = createApiBalanceProvider({
    client: client((url) => {
      seen.push(url);
      return { spendable: 1 };
    }),
  });

  await provider.read(source({ id: 'src/../admin' }));

  assert.equal(seen.length, 1);
  assert.doesNotMatch(seen[0], /src\/\.\.\//, 'a source id must not be able to walk the path');
});
