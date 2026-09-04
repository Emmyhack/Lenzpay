import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CapabilityRegistry,
  balanceCertainty,
  guaranteeFor,
  guaranteeStrength,
  latencyScore,
  railProfile,
  requiresFloat,
  spendableBalance,
  successProbability,
  weakestGuarantee,
} from './capabilities';
import { rankSources } from './ranking';
import {
  FIXED_NOW,
  card,
  custodyAccount,
  cryptoWallet,
  feed,
  ngnBank,
  usdAccount,
} from './__fixtures__';

const at = { now: FIXED_NOW };
const registry = new CapabilityRegistry();

// ---------------------------------------------------------------------------
// The constraint that drives everything (ADR-000)
// ---------------------------------------------------------------------------

test('a Nigerian bank account can be read and debited but never held', () => {
  const capabilities = railProfile('bank');

  assert.equal(capabilities.balanceVisibility, 'exact');
  assert.equal(capabilities.debitSupported, true);
  assert.equal(capabilities.holdSupported, false);
  assert.equal(guaranteeFor(capabilities), 'FLOAT_BACKED');
  assert.equal(requiresFloat(capabilities), true);
});

test('a card is the mirror image: no balance, but a real authorisation', () => {
  const capabilities = railProfile('card');

  assert.equal(capabilities.balanceVisibility, 'none');
  assert.equal(capabilities.holdSupported, true);
  assert.equal(capabilities.captureSupported, true);
  assert.equal(guaranteeFor(capabilities), 'PREAUTHORIZED');
  assert.equal(
    requiresFloat(capabilities),
    false,
    'an authorised card leg carries its own guarantee'
  );
});

test('an external crypto wallet needs a signature and cannot be reversed', () => {
  const capabilities = railProfile('crypto');

  assert.equal(capabilities.requiresUserSignature, true);
  assert.equal(capabilities.delegatedSpend, false);
  assert.equal(capabilities.reversible, 'none');
  assert.equal(guaranteeFor(capabilities), 'SIGNED');
});

test('a custody account can genuinely ring-fence funds', () => {
  assert.equal(guaranteeFor(railProfile('custody')), 'RESERVED');
  assert.equal(requiresFloat(railProfile('custody')), false);
});

// ---------------------------------------------------------------------------
// Guarantee ordering
// ---------------------------------------------------------------------------

test('guarantees are ordered: our own reserve beats someone else’s authorisation', () => {
  // A reserve is a book entry in an account we control. A card preauth is a
  // promise from an issuer that can still decline, lapse, or be disputed.
  assert.ok(guaranteeStrength('RESERVED') > guaranteeStrength('PREAUTHORIZED'));
  assert.ok(guaranteeStrength('PREAUTHORIZED') > guaranteeStrength('SIGNED'));
  assert.ok(guaranteeStrength('SIGNED') > guaranteeStrength('FLOAT_BACKED'));
});

test('a plan is only as protected as its weakest leg', () => {
  assert.equal(weakestGuarantee(['RESERVED', 'PREAUTHORIZED']), 'PREAUTHORIZED');
  assert.equal(weakestGuarantee(['PREAUTHORIZED', 'FLOAT_BACKED']), 'FLOAT_BACKED');
  assert.equal(
    weakestGuarantee([]),
    'FLOAT_BACKED',
    'an empty plan must not claim to be guaranteed'
  );
});

// ---------------------------------------------------------------------------
// Per-source overrides
// ---------------------------------------------------------------------------

test('a provider that does support authorisation overrides the rail default', () => {
  const aggregatorWithPreauth = ngnBank(50_000, {
    id: 'src_special',
    capabilities: { holdSupported: true, captureSupported: true },
  });

  const capabilities = registry.resolve(aggregatorWithPreauth);

  assert.equal(guaranteeFor(capabilities), 'PREAUTHORIZED');
  assert.equal(
    requiresFloat(capabilities),
    false,
    'a bank that can authorise no longer needs the float'
  );
});

test('capabilities vary within a rail, so per-source beats per-type', () => {
  const scoped = new CapabilityRegistry()
    .registerType('bank', { failureRate: 0.2 })
    .registerSource('src_good', { failureRate: 0.01 });

  const ordinary = ngnBank(1_000, { id: 'src_other' });
  const better = ngnBank(1_000, { id: 'src_good' });

  assert.equal(scoped.resolve(ordinary).failureRate, 0.2);
  assert.equal(scoped.resolve(better).failureRate, 0.01);
});

// ---------------------------------------------------------------------------
// Balance certainty
// ---------------------------------------------------------------------------

test('a card scores zero balance certainty because it discloses nothing', () => {
  const source = card(200_000);
  const certainty = balanceCertainty(source, registry.resolve(source), FIXED_NOW, 300_000);

  assert.equal(certainty, 0);
});

test('a sufficiency-only check is worth nearly as much as reading the balance', () => {
  const source = ngnBank(50_000, { capabilities: { balanceVisibility: 'sufficiency_only' } });
  const certainty = balanceCertainty(source, registry.resolve(source), FIXED_NOW, 300_000);

  assert.ok(certainty > 0.8, 'it answers the only question planning asks');
  assert.ok(certainty < 1, 'but it describes one amount, not the account');
});

test('a stale balance decays toward a floor rather than to zero', () => {
  const source = ngnBank(50_000, { lastSynced: new Date(FIXED_NOW - 60 * 60_000) });
  const capabilities = registry.resolve(source);

  const fresh = balanceCertainty(
    ngnBank(50_000, { lastSynced: new Date(FIXED_NOW) }),
    capabilities,
    FIXED_NOW,
    300_000
  );
  const stale = balanceCertainty(source, capabilities, FIXED_NOW, 300_000);

  assert.equal(fresh, 1);
  assert.ok(stale < fresh, 'an hour-old balance is a weaker signal');
  assert.ok(stale > 0.5, 'but it is not worthless');
});

// ---------------------------------------------------------------------------
// Spendable balance
// ---------------------------------------------------------------------------

test('the planner commits the spendable balance, not the headline one', () => {
  // ₦100,000 on the statement, ₦85,000 actually usable.
  const source = ngnBank(100_000, { spendableRawBalance: 85_000 });

  assert.equal(spendableBalance(source), 85_000);
});

test('spendable never exceeds the headline balance, whatever a provider reports', () => {
  const source = ngnBank(10_000, { spendableRawBalance: 999_999 });

  assert.equal(spendableBalance(source), 10_000);
});

test('a source with no breakdown falls back to its raw balance', () => {
  assert.equal(spendableBalance(ngnBank(42_000)), 42_000);
});

test('ranking sizes legs off the spendable balance', () => {
  const constrained = ngnBank(100_000, { spendableRawBalance: 20_000, label: 'Tied up' });
  const [ranked] = rankSources([constrained], 5_000, 'NGN', feed(), at);

  assert.equal(ranked.normalizedBalance, 20_000);
  assert.equal(
    ranked.coversFull,
    true,
    'it still covers a ₦5,000 payment out of what is genuinely available'
  );
});

test('a pending debit can make an apparently sufficient account insufficient', () => {
  const source = ngnBank(100_000, { spendableRawBalance: 4_000 });
  const [ranked] = rankSources([source], 10_000, 'NGN', feed(), at);

  assert.equal(
    ranked.coversFull,
    false,
    'planning against the headline ₦100,000 would have built a leg that fails collection'
  );
});

// ---------------------------------------------------------------------------
// Success probability and latency
// ---------------------------------------------------------------------------

test('rail failure rate and account history compound', () => {
  const source = ngnBank(10_000, { reliability: 0.9 });
  const capabilities = registry.resolve(source);

  const expected = (1 - capabilities.failureRate) * 0.9;
  assert.ok(Math.abs(successProbability(source, capabilities) - expected) < 1e-9);
  assert.ok(successProbability(source, capabilities) < 0.9, 'the rail can fail too');
});

test('a slow rail is penalised but never scored out of contention', () => {
  const slow = latencyScore({ ...railProfile('bank'), settlementLatencyMs: 600_000 });

  assert.ok(slow >= 0, 'slow beats failed');
  assert.ok(slow < latencyScore(railProfile('card')));
});

// ---------------------------------------------------------------------------
// Capability-aware ranking
// ---------------------------------------------------------------------------

test('every ranked source carries its capabilities and guarantee', () => {
  const ranked = rankSources([ngnBank(50_000), card(50_000)], 4_500, 'NGN', feed(), at);

  for (const entry of ranked) {
    assert.ok(entry.capabilities, 'capabilities travel with the ranking decision');
    assert.equal(entry.guarantee, guaranteeFor(entry.capabilities));
  }
});

test('the score breakdown records why a capability decision was made (§6.1)', () => {
  const [entry] = rankSources([ngnBank(50_000)], 4_500, 'NGN', feed(), at);
  const { breakdown } = entry;

  assert.equal(breakdown.settlementCertainty, guaranteeStrength('FLOAT_BACKED'));
  assert.equal(breakdown.balanceCertainty, 1);
  assert.ok(breakdown.floatExposurePenalty > 0, 'a bank leg exposes the float');
  assert.ok(breakdown.railReliability > 0 && breakdown.railReliability <= 1);
});

test('a bank that can authorise outranks an identical one that cannot', () => {
  const plain = ngnBank(50_000, { id: 'src_plain', label: 'Plain' });
  const authorising = ngnBank(50_000, {
    id: 'src_auth',
    label: 'Authorising',
    capabilities: { holdSupported: true, captureSupported: true },
  });

  const ranked = rankSources([plain, authorising], 4_500, 'NGN', feed(), at);

  assert.equal(
    ranked[0].source.label,
    'Authorising',
    'same money, same currency — the tiebreaker is what the rail can guarantee'
  );
  assert.equal(ranked[0].guarantee, 'PREAUTHORIZED');
});

test('capability scoring does not overturn the same-currency preference', () => {
  // A custody account is safer to execute than a bank account, but converting
  // the user's money costs the *user*, while float exposure costs Lenz.
  const ranked = rankSources(
    [custodyAccount(500_000, { label: 'Custody' }), ngnBank(500_000, { label: 'NGN Bank' })],
    4_500,
    'NGN',
    feed(),
    at
  );

  assert.equal(ranked[0].source.label, 'Custody', 'same currency, so certainty decides');

  const crossCurrency = rankSources(
    [usdAccount(10_000, { label: 'USD' }), ngnBank(500_000, { label: 'NGN Bank' })],
    4_500,
    'NGN',
    feed(),
    at
  );

  assert.equal(
    crossCurrency[0].source.label,
    'NGN Bank',
    'a safer rail must not justify converting naira-holding users into FX'
  );
});

test('a reserve source still ranks last however capable its rail is', () => {
  const ranked = rankSources(
    [
      custodyAccount(500_000, { label: 'Reserve custody', isReserve: true }),
      ngnBank(500_000, { label: 'Spending' }),
    ],
    4_500,
    'NGN',
    feed(),
    at
  );

  assert.equal(
    ranked[0].source.label,
    'Spending',
    'user intent outranks every capability term'
  );
});

test('crypto still ranks below same-currency cash despite being readable', () => {
  const ranked = rankSources(
    [cryptoWallet('BTC', 1, { label: 'BTC' }), ngnBank(500_000, { label: 'NGN Bank' })],
    4_500,
    'NGN',
    feed(),
    at
  );

  assert.equal(ranked[0].source.label, 'NGN Bank');
});
