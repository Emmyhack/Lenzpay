# Profit Model

How Lenz Pay makes money, what each payment costs, and the three findings that
changed the product's configuration.

Implemented in `services/pricing.ts`, enforced by `services/pricing.test.ts`.
Every figure below is reproducible by running that suite.

`pricing.ts` is deliberately **not** imported by the app — pricing belongs to
the backend, not a phone. It is still coupled to the running product: the tests
assert against the app's live `CASHBACK_RATES` and `REWARD_POINT_VALUE`, so
raising a reward rate beyond what a payment can fund breaks the build.

---

## Revenue

| Stream | Default | Notes |
|---|---|---|
| **Merchant discount rate** | 1.5%, floor ₦30, cap ₦2,000 | Lenz keeps 60% under a partner licence; the PSP takes the rest |
| **FX spread** | 0.9% fiat, 0.8–1.5% crypto | Lenz keeps 55%, the FX partner takes the rest |
| **Split fee** | ₦10 per multi-source payment | Calibrated to make splitting margin-neutral |
| **Subscription** | ₦0 | Modelled but unused — the lever if per-payment margin stays thin |

## Costs

| Cost | Driver |
|---|---|
| **Collection** | One debit per leg per sweep. ₦55 flat on a bank debit under ₦20k |
| **Payout** | NIP transfer fee + ₦50 EMTL at ₦10,000 and above |
| **FX partner** | Their share of the spread |
| **Float carry** | 25%/yr on the exposure, for as long as collection is deferred |
| **Rewards** | Cashback paid, plus points accrued at ₦0.05 each |

---

## The three findings

### 1. Netting is the business

Without netting, **every naira payment loses money — including single-source
ones.** The fixed debit fee is simply larger than the retained percentage on a
typical payment.

| Payment | No netting | Netted, 5 payments/sweep |
|---|---|---|
| ₦4,500, one bank | **−₦17.58** | +₦26.42 |
| ₦4,500, two banks | **−₦72.58** | +₦15.42 |
| ₦50,000, one bank | **−₦144.25** | +₦255.75 |
| ₦4,500, USD converted | +₦43.27 | +₦46.87 |

Amortising one debit across a sweep window is worth more than any pricing or
routing change available. It is the single most sensitive input in the model
(`paymentsPerSweep`), and it is only possible because the float decouples
paying the payee from collecting the money.

**Consequence:** the collection sweep is not an optimisation. It is load-bearing,
and it must run as a scheduled backend job — a client-triggered sweep would mean
a user who stops opening the app is never debited.

### 2. Rewards were larger than revenue

Cashback was configured at 0.5%–3% by category against gross revenue of ~1.5%,
of which Lenz keeps a share. **Every crypto-category payment lost money on
rewards alone, before a rail was touched.**

Rates are now derived from net contribution rather than chosen:

| Category | Was | Now |
|---|---|---|
| Crypto | 3.0% | 0.25% |
| Food | 2.0% | 0.20% |
| Transport | 1.5% | 0.15% |
| Shopping | 1.0% | 0.12% |
| Other | 0.5% | 0.10% |

Point value was also cut from ₦0.20 to ₦0.05, putting the true cost of points
at ~0.025% of the payment.

`sustainableCashbackRate()` computes the ceiling from a payment's own margin,
and a test asserts contribution stays positive at these rates across ₦1,000 to
₦100,000 for every category. Raising a rate without raising margin fails that
test.

### 3. Small payments need a floor

A ₦1,000 payment earns ₦15 gross at 1.5%, while one amortised debit costs ~₦11
and rewards take another ~₦1.75. **Below roughly ₦2,000, a percentage-only fee
cannot cover a fixed cost** no matter how well the engine routes.

Hence `mdrFloor: ₦30`. It stops binding above ₦2,000, where the percentage
takes over. Without it, small-ticket payments — which is most of them — are
structurally loss-making.

---

## Sensitivity

Ranked by how much each moves contribution:

1. **`paymentsPerSweep`** — dominates everything. Doubling it roughly halves
   collection cost per payment.
2. **`lenzMdrShare`** — a pure commercial negotiation; every point is margin.
3. **Rail cost** — negotiable at volume. `setRailCosts()` re-prices the whole
   model, including which legs the planner considers worth adding.
4. **`floatDaysOutstanding`** — a longer sweep window trades collection cost
   against carry cost. There is an optimum; find it with real volume data.
5. **Reward rates** — fully under our control, and the first thing to cut if
   margin compresses.

## Break-even

`breakEvenPayments(monthlyFixedCosts, averageContribution)`. At ~₦25 average
contribution, a ₦1m/month cost base needs **40,000 payments/month** — roughly
1,300 a day.

That number is the business plan. If the realistic payment count is far below
it, the answer is a higher take rate or a subscription, not a better engine.

---

## Before this is real

- Replace `DEFAULT_PRICING` with negotiated terms. `lenzMdrShare` at 0.6 and
  `lenzFxShare` at 0.55 are modelling assumptions, not agreements.
- Replace `RAIL_COSTS` list prices via `setRailCosts()` once aggregator pricing
  is agreed.
- Measure real `paymentsPerSweep`. The whole model rests on it, and the
  assumption of 5 is a guess until there is traffic.
- Model collection failure rates. The model currently assumes every debit
  eventually succeeds; escalated exposure is a real cost it does not yet carry.
