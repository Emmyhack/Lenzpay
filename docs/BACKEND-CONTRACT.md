# Backend Contract

What the LenzPay backend has to provide, and why each requirement exists.

The orchestration engine (`services/orchestration/`) is written and tested. It
runs today against mock rails and a mock balance provider, wired through
`services/engineSetup.ts` — the single seam you replace. This document is the boundary:
everything the engine needs from the outside world, expressed as the interfaces
it already calls, so the backend can be built against something concrete rather
than inferred from the client.

Read `ARCHITECTURE-DECISIONS.md` first if you have not. In particular ADR-000,
ADR-004, ADR-012 and ADR-013 — the constraints below are consequences of those,
not preferences.

---

## 0. The one constraint that shapes everything

**Nigerian bank rails cannot authorise without moving money.**

NIBSS NIP is a push. A direct-debit mandate is a pull. Both are single-shot:
the money either moves or it doesn't. There is no authorise-then-capture step.

Every awkward-looking requirement in this document — the float, the netted
collection sweep, the double-entry ledger, the per-leg guarantees — follows
from that one fact. If you find yourself thinking "why not just hold the funds
and capture later", the answer is that the primitive does not exist on this
corridor. Not degraded: absent.

**If any aggregator's debit product turns out to expose an authorise/capture
split, tell us immediately.** It would change the phasing materially and revise
ADR-000. This is the single highest-value thing to verify in provider
conversations.

---

## 1. Who owns what

| Concern | Owner |
|---|---|
| Ranking, planning, leg arithmetic, FX rounding | **Client engine** (done) |
| Guarantee model, prepare/lock semantics | **Client engine** (done) |
| Balance reads and sufficiency checks | **Backend** |
| Debit initiation, authorisation, capture, release, refund | **Backend** |
| Payee settlement (payout) | **Backend** |
| Collection sweep scheduling | **Backend** — hard blocker, see §6 |
| Double-entry ledger of record | **Backend** |
| Float capital and exposure limits | **Backend** |
| Pricing, MDR, FX spread economics | **Backend** (`pricing.ts` is a model, deliberately not imported by the app) |

The engine is deliberately provider-agnostic. It never asks "is this Mono?" —
it asks "can this rail hold funds without moving them?". Keep it that way:
provider differences belong in capability declarations (§3), not in engine
branches.

---

## 2. The three verbs

```
plan()  ──▶  prepare()  ──▶  execute()
 pure        side effects     moves money
```

**`plan()`** runs on every amount keystroke to keep the preview live. It must
stay free of side effects. Nothing you build should be called from it.

**`prepare()`** runs once, after the user expresses intent and before they
commit. This is where every external effect lives, and where most of your work
is called from:

- re-validate and re-lock FX quotes
- place real authorisations where the rail supports them (cards)
- ring-fence funds where we control the account (custody, FX partner)
- confirm a standing on-chain allowance covers the leg
- re-read balances on rails that can offer nothing better
- obtain float authorisation for whatever remains unprotected

It emits a `LockedPlan` — immutable, one `GuaranteeKind` per leg.

**`execute()`** reads only the `LockedPlan`. Anything re-derived between
confirmation and execution is drift, and drift is precisely the bug class this
design exists to prevent.

**The invariant to protect:** *the thing the user confirms is the thing the
executor executes.* If a change you make would let those diverge, it is wrong
regardless of how convenient it is.

---

## 3. Source capabilities

Every funding source resolves to a `SourceCapabilities` record **before**
planning. Defaults live in `capabilities.ts` per source type; you override them
per source, because capabilities vary *within* a rail — one aggregator exposes
authorise/capture, another only a single-shot debit.

```ts
interface SourceCapabilities {
  rail: 'NIP' | 'DIRECT_DEBIT' | 'WALLET' | 'CARD' | 'ONCHAIN' | 'CUSTODY';
  balanceVisibility: 'exact' | 'sufficiency_only' | 'none';
  debitSupported: boolean;
  holdSupported: boolean;      // a genuine authorisation, not an emulation
  captureSupported: boolean;
  releaseSupported: boolean;
  refundSupported: boolean;
  reversible: 'full' | 'limited' | 'none';
  requiresUserSignature: boolean;
  delegatedSpend: boolean;
  delegatedLimit: number | null;
  reserveSupported: boolean;
  settlementLatencyMs: number;
  failureRate: number;         // 0..1 prior, rail-level not account-level
}
```

Return these on each source from `GET /sources` as a `capabilities` field
(partial is fine — it merges over the rail default).

**Be honest here.** `holdSupported: true` on a rail that actually emulates a
hold by debiting immediately would silently reintroduce the exact failure the
architecture exists to prevent: *charged 3 accounts, payment still failed.*
If a provider's "hold" is really a debit, declare `holdSupported: false`.

### Guarantee derivation

The engine derives a `GuaranteeKind` from those flags:

| Guarantee | When | Strength |
|---|---|---|
| `RESERVED` | `reserveSupported` — funds ring-fenced in an account we control | 1.00 |
| `PREAUTHORIZED` | `holdSupported && captureSupported` | 0.90 |
| `SIGNED` | on-chain, signature or standing allowance obtained | 0.70 |
| `FLOAT_BACKED` | nothing can be locked | 0.45 |

`RESERVED` outranks `PREAUTHORIZED` deliberately: a reserve is a book entry
that cannot be declined, whereas a card preauthorisation can still decline at
capture, lapse, or be disputed.

`FLOAT_BACKED` is **not** a failure state. It is the accurate name for
"verified but unlockable", which is what every Nigerian bank leg is.

---

## 4. Interfaces to implement

### 4.1 `BalanceProvider` — client side done, endpoints outstanding

```ts
interface BalanceProvider {
  read(source: PaymentSource): Promise<
    | { ok: true; balance: number; observedAt: number }
    | { ok: false; reason: string }
  >;

  // Optional, and preferred where the provider offers it.
  sufficient?(
    source: PaymentSource,
    amountInSourceCurrency: number
  ): Promise<
    | { ok: true; sufficient: boolean; observedAt: number }
    | { ok: false; reason: string }
  >;
}
```

Wire it via `configureEngine({ balances })`.

**Prefer `sufficient` over `read`.** Asking *"can this account provide
₦37,500?"* discloses strictly less than reading the balance, and it answers the
only question planning needs. Mono's direct-debit balance inquiry can do this;
use it. When a leg is verified this way the engine sets `verifiedBalance: null`
on purpose — inventing a figure would misstate what we actually know.

**`observedAt` is not decoration.** It feeds collection confidence, which gates
whether the float will front a payment at all. A wrong or defaulted timestamp
silently changes credit decisions.

**A reference implementation now exists** in `services/balances.ts`:

- `createMockBalanceProvider({ lookup, driftRatio })` — reads through the app's
  own source state. `driftRatio` moves balances *both ways* between planning and
  preparing, so the `balance_moved` path is reachable in development rather than
  only in production.
- `createApiBalanceProvider({ client, supportsSufficiency })` — **the one you
  implement against.** The HTTP client is a parameter rather than an import, so
  the module stays provider-agnostic and testable.

Both are bound in `services/engineSetup.ts`, which is the single seam where a
real backend replaces the mock. Flip `supportsSufficiency` to `true` once the
sufficiency endpoint exists.

Two behaviours the tests pin, and that your implementation must preserve:

- **A transport failure is not an empty account.** A 502 must surface as
  "could not reach", never as a zero balance — one is a retry, the other is a
  declined payment. The provider deliberately does not leak the status code into
  the user-facing message.
- **A malformed response fails rather than being coerced.** `spendable: "lots"`
  is an error, not `NaN` flowing into a funding plan.

### 4.2 Balance semantics — `balance` is not the number to use

Return **spendable** balance as `spendableRawBalance` on the source:

```
Displayed / ledger balance   ₦100,000
Pending debits               −₦10,000
Required minimum              −₦5,000
                             ─────────
spendableRawBalance           ₦85,000
```

The engine sizes legs off `spendableRawBalance` and falls back to `rawBalance`
only when you cannot break it down. Planning against the headline figure
produces legs that pass planning and fail collection — which, on a float-fronted
payment, means Lenz has already paid the payee.

### 4.3 `RailAdapter` — one per provider

```ts
interface RailAdapter {
  readonly id: string;
  readonly supportsNativeHold: boolean;
  hold(r: HoldRequest): Promise<{ ok: true; holdRef: string; expiresAt: number }
                              | { ok: false; reason: string; retryable: boolean }>;
  capture(r: CaptureRequest): Promise<{ ok: true; captureRef: string }
                                    | { ok: false; reason: string; retryable: boolean }>;
  release(r: ReleaseRequest): Promise<{ ok: true } | { ok: false; reason: string }>;
  refund?(r: RefundRequest): Promise<{ ok: true; refundRef: string }
                                   | { ok: false; reason: string }>;
}
```

Register with `RailRegistry.registerType(...)` / `.registerSource(...)`.

Rules that matter:

- **`release` must be idempotent, and releasing an unknown hold is a success.**
  The point of release is that the money is not held; a hold that never landed
  satisfies that. Rollback has to be safe to retry.
- **`retryable` is load-bearing.** `true` means "the rail was unavailable",
  `false` means "the rail said no". They lead to different user-facing outcomes.
- **Omit `refund` if you cannot programmatically refund.** The engine will
  report `partially_reversed` and escalate for manual treasury follow-up, which
  is correct. A `refund` that silently no-ops is much worse.
- **Do not re-authorise a leg that arrives already held.** `prepare()` may have
  placed the authorisation; the executor skips those. On a card, a second hold
  is a visible duplicate pending charge on the customer's statement.

### 4.4 `SettlementRail` — paying the payee

```ts
interface SettlementRail {
  settle(r: SettlementRequest): Promise<
    | { ok: true; settlementRef: string; settledAt: number }
    | { ok: false; reason: string; retryable: boolean }
  >;
}
```

This must be **one indivisible operation**. Float-fronted settlement pays the
payee once and then collects; if `settle` can partially succeed, the whole
atomicity argument collapses.

---

## 5. Idempotency

The client derives a key from the payment, not the attempt:

```
hash(userId ~ payeeId ~ amount ~ currency ~ planKind ~ legFingerprint ~ attemptNonce)
```

where `legFingerprint` is `sourceId:amountInSettlementCurrency` per leg.

Requirements:

- **Same key ⇒ replay the stored result. Never re-execute.**
- Keys must survive process restart. A retry after a crash must replay, not
  re-charge. (The client persists these for 24h; the backend is the real
  authority.)
- Per-leg rail calls are scoped further — `{key}:hold:{legId}`,
  `{key}:capture:{legId}`, `{key}:prep:{legId}`, `{key}:rel:{legId}` — so a
  retry of one leg never re-executes another. Pass these through to provider
  idempotency headers where the provider supports them.
- An in-flight key is **not** a failure. Return "in progress" and let the caller
  poll. Reporting failure while the original attempt still owns the money path
  is a lie that causes double payments.

---

## 6. The collection sweep — hard launch blocker

Netting is not an optimisation. Per `PROFIT-MODEL.md`, **without it every naira
payment loses money, including single-source ones**, because the flat ~₦55 debit
fee exceeds the retained percentage. A ₦4,500 single-bank payment goes from
−₦17.58 to +₦26.42 once netted across 5 payments per sweep.

The engine queues collection items and batches them: **one debit per account per
sweep**, covering everything that account owes since the last one.

```ts
runCollectionSweep({ queue, rails, onCollected, onFailed, retryLimit }, userId?)
```

**This must be a scheduled backend job.** The client method exists only for
development and now *refuses to run* outside it. The reason is blunt: collection
cannot depend on a client being open. A user who stops opening the app would
simply never be debited, turning float exposure into permanent loss.

Contract for the job:

- Idempotent per batch, safe to re-run
- Safe to run concurrently with payments — `buildBatches` only picks up items
  already queued
- Runs on `Treasury.sweepIntervalMs` (currently 24h)
- On success call `treasury.recover(transactionId, amount)` to release exposure
- After `collectionRetryLimit` (3) failures, escalate for manual recovery rather
  than retrying forever

---

## 7. Ledger

You need your own double-entry ledger. **Do not determine financial state by
reading provider APIs.**

Accounts in use: `funding_source`, `lenz_float`, `payee_settlement`,
`fx_spread_revenue`, `fx_clearing`.

Float-fronted payment:

```
User receivable        +₦20,000
Lenz float             −₦20,000
Merchant payable       +₦20,000
```

Then when the debit eventually lands:

```
Bank settlement        +₦20,000
User receivable        −₦20,000
```

Requirements:

- Postings must balance per currency. The client's `Ledger.post()` throws
  `UnbalancedPostingError` if they don't; the backend should be at least as
  strict.
- Cross-currency legs post through `fx_clearing` so each currency balances
  independently.
- Every entry carries `transactionId` and, where applicable, `legId`. Per-leg
  attribution is what makes a split payment disputable (ADR-009) — a
  `sourceLabel` of "Smart Split (2 sources)" is a summary, not a record.
- Reversals reference the entry they reverse (`reversalOf`), never delete.

PostgreSQL as the authoritative transactional store.

---

## 8. Treasury and float

Current limits (`constants/config.ts`, `Treasury`):

| Limit | Value | Meaning |
|---|---|---|
| `perTransactionNGN` | 200,000 | Largest single payment the float will front |
| `perUserOutstandingNGN` | 500,000 | Most one user may owe across in-flight payments |
| `globalOutstandingNGN` | 50,000,000 | Hard treasury ceiling |
| `minCollectionConfidence` | 0.9 | Below this, refuse to front |
| `balanceFreshnessMs` | 5 min | Older balances count as unverified |
| `collectionRetryLimit` | 3 | Then escalate |

Two things to get right:

- **Only float-backed legs consume exposure.** A leg a card already authorised
  carries its own guarantee; charging the treasury for it consumes headroom
  against a risk that is not there.
- **Exposure must survive restart.** Forgetting it both loses the debt and
  resets the per-user ceiling, so a user could exceed their limit by relaunching.

Collection confidence multiplies each leg's `reliability × freshnessFactor`, so
one weak or stale account drags the whole plan down. That is intentional.

---

## 9. Provider notes

These are starting points, not decisions already made. Verify each directly.

**Bank (Mono or equivalent Open Banking aggregator).** Needs both account
linking (balance reads) and debit initiation from one integration. Design for
two aggregators from day one with per-source routing — single-aggregator
dependency is a live risk. Their direct-debit balance inquiry is what backs
`sufficient()`. **Not** direct NIBSS: it requires licensing we don't hold and
would gate the MVP behind a regulatory process measured in quarters.

**Card (Paystack, or Adyen for international).** The reason cards matter
architecturally is preauthorisation → capture/release, which is a real hold and
the only one available on the launch corridor. Declare `holdSupported: true`
only after confirming the preauth flow actually reserves funds. Reusable card
authorizations are useful for the same reason.

**Crypto.** Start with stablecoins only — `USDC`/`USDT` on one or two networks.
Do not open with BTC/ETH/SOL: price volatility, confirmation times, liquidity
and gas assets are complexity the planner does not need on day one.

Balance reading is easy and needs no custody: an address is public
(`eth_getBalance`, `getTokenAccountsByOwner`). *Spending* is the hard part. An
external wallet means a signature prompt mid-payment, which is a poor experience
when a payment is scraping bank + card + crypto together. An embedded
user-controlled wallet with a standing allowance avoids that — set
`delegatedSpend: true` and a real `delegatedLimit`. Above the limit the engine
returns `signature_required`, which is a prompt, not a failure.

**FX.** The planner must never compute against a public market price. It needs
an **executable quote** with an id and an expiry, and that `quoteId` becomes
part of the locked plan. Rate lock ≥ 45s, honoured **at settlement**.

---

## 10. Endpoints the client already calls

Set `EXPO_PUBLIC_USE_MOCK_DATA=false` to switch `services/*` from mocks to these.
Bearer token from `SecureStore`, 401 clears the credential.

```
GET    /sources                 → PaymentSource[]   (include `capabilities`, `spendableRawBalance`, `lastSynced`)
GET    /sources/:id/balance     → { spendable: number, observedAt?: number }
GET    /sources/:id/sufficient?amount=N
                                → { sufficient: boolean, observedAt?: number }   (optional but preferred)
POST   /sources/bank            ← { accountNumber, bankCode }
DELETE /sources/:id
GET    /transactions            → Transaction[]
POST   /kyc                     ← submission        → { status }
GET    /kyc/status              → { status }
GET    /merchant/payments       → MerchantPayment[]
GET    /merchant/settlements    → Settlement[]
POST   /rewards/redeem          ← { method, points } → Redemption
```

Still to be designed with you: the payment endpoints themselves
(`prepare`/`execute`), which today run in-process against mock rails.

---

## 11. Failure modes to handle deliberately

| Reason | Meaning | Right response |
|---|---|---|
| `rate_expired` | FX moved beyond tolerance | Re-prompt the user; nothing moved |
| `balance_moved` | Account no longer covers its leg | Re-plan; nothing moved |
| `authorization_declined` | Card said no | Other holds already released |
| `reserve_failed` | Custody ring-fence failed | Other holds already released |
| `signature_required` | On-chain, no allowance or above limit | Prompt the user — not a failure |
| `float_refused` | Treasury declined | Fall back to single-source, or decline |
| `capability_missing` | Source cannot be debited at all | Configuration bug — alert |

**A failed `prepare` must leave nothing held.** Every authorisation already
placed is released before the failure returns. When a release itself fails,
`fullyRolledBack` is `false` — that needs a human, not a retry, because money is
sitting unusable in a customer's account.

---

## 12. Launch blockers

From `ARCHITECTURE-DECISIONS.md`, the ones that are yours:

- [ ] Commercial agreements and production keys for both aggregators
- [ ] Licensed PSP partner of record for the debit rails
- [ ] Per-bank debit reachability confirmed; per-source routing table built
- [ ] FX partner quote API, rate lock ≥ 45s, honoured at settlement
- [ ] Float capital sized against modelled volume × collection latency
- [ ] Counsel sign-off on the float-as-credit question before `partner_float`
- [ ] `RAIL_COSTS` replaced with negotiated commercial terms
- [ ] **Collection sweep scheduled as a backend job** — without it nothing is
      ever collected
- [ ] **`/sources/:id/balance` implemented** — the client provider and its
      wiring are done; the endpoint is not. Until it returns real data, every
      float-fronted payment is an unverified credit decision
- [ ] `/sources/:id/sufficient` implemented, then `supportsSufficiency: true`
      in `engineSetup.ts` — discloses less and answers the same question
- [ ] `RAIL_PROFILES` capability defaults confirmed per provider, especially
      whether any debit product exposes authorise/capture
- [ ] Dispute backend to flush the local queue into
- [ ] VASP partner registration verified (crypto phase)

---

## 13. Things that will look like bugs but aren't

- **A collection failure does not fail the payment.** On a float-fronted
  payment the payee has already been paid. An uncollected leg is Lenz's
  exposure to recover, not a failed payment the user should be told about.
- **`verifiedBalance: null` on a successfully prepared leg.** The provider
  confirmed sufficiency without disclosing a figure. Correct.
- **A card ranks below a bank for a naira payment despite being safer.**
  Capability terms are weighted below currency proximity and conversion cost on
  purpose: execution certainty is Lenz's risk, conversion cost is the user's
  money. See ADR-012.
- **Reserve-flagged accounts rank last regardless of capability.** User intent
  outranks every capability term.
- **A single-source payment still uses the float.** Bank rails cannot hold, so
  even one leg needs it (ADR-000).

---

## Questions worth raising early

1. Does *any* aggregator debit product expose authorise/capture? This is the
   highest-value unknown in the whole design.
2. Which providers can answer sufficiency without disclosing a balance, and what
   does each charge for it?
3. What is the real per-debit cost at our expected volume? `RAIL_COSTS` are list
   prices and negotiable.
4. Can the FX partner honour a 45s lock **at settlement**, not just at quote?
5. What is the actual observed failure rate per bank? `failureRate` defaults are
   estimates, and they feed credit decisions.
