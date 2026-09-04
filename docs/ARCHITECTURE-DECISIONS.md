# Architecture Decisions

Resolutions to the four open questions at the end of the Lenz Pay Product &
Architecture Document (v1.0). Each records what was decided, why, what it costs,
and what would justify revisiting it.

These four looked independent in the spec. They aren't. One technical fact about
Nigerian bank rails determines three of them, so it comes first.

---

## ADR-000 — The constraint that drives everything: bank rails cannot hold funds

**Status:** accepted · **Drives:** ADR-001, ADR-003, ADR-004

§5.4 makes atomicity depend on hold-then-capture: place an authorisation on
every contributing account, and only convert those holds into real debits once
all of them have landed. That is the right design, and it is the thing that
prevents *"charged 3 accounts, payment still failed."*

It requires a rail that can **authorise without moving money**.

Nigerian bank rails do not have one. NIBSS NIP is a push transfer. A direct-debit
mandate is a pull. Both are single-shot: the money either moves or it doesn't.
There is no authorisation step to hold against and later capture or release.

So for Phases 1–2 — bank accounts only, which is the entire MVP — the primitive
§5.4 depends on is unavailable. Not degraded: absent.

**Consequence:** atomicity has to come from somewhere else. It comes from the
float (ADR-004). The engine implements both strategies and picks per plan from
the rails involved (`chooseStrategy` in `services/orchestration/executor.ts`), so
hold-then-capture is still used wherever it genuinely exists — the FX partner,
the custody partner, and eventually the Lenz Card.

**Verify before building against this:** confirm directly with each aggregator
whether *any* of their debit products expose an authorise/capture split. If one
does, that changes the phasing materially and this ADR should be revisited.

---

## ADR-001 — Bank aggregation: Open Banking aggregator, dual-provider from day one

**Status:** accepted · **Question:** Mono vs Okra vs direct NIBSS

**Decision:** integrate an Open Banking aggregator that offers *both* account
linking (balance reads) and debit initiation. Not direct NIBSS. Design for two
aggregators from the start, with per-source routing.

**Why not direct NIBSS:** it requires licensing Lenz Pay doesn't hold, and would
put the entire MVP behind a regulatory process measured in quarters. §7 already
recommends partnering with a licensed PSP for the rails rather than seeking a
switching licence on day one — direct NIBSS contradicts that.

**Why one aggregator that does both:** the engine needs exactly two things from
this layer — read a live balance, and initiate a debit. Getting both from one
integration halves the surface area and keeps balance freshness (which feeds
collection confidence, ADR-004) consistent with the debit path.

**Why dual-provider from day one:** single-aggregator dependency is a live risk
in this market. Providers exit, and bank-by-bank reachability differs between
them. `RailRegistry` already supports per-source adapter overrides, so pinning a
source to whichever aggregator reaches its bank costs nothing structurally — but
only if the second slot exists before it's needed.

**What this costs:** aggregator margin on every debit, and reachability bounded
by their bank coverage rather than by NIBSS's.

**Revisit when:** transaction volume makes aggregator fees exceed the cost of a
licensed direct integration, or when a licence is obtained for other reasons.

> **Provider naming deliberately omitted.** Current commercial standing and
> per-bank coverage are exactly the facts that go stale, and picking a named
> vendor here would encode a claim I can't verify. The decision is the
> *architecture* — aggregator over direct, two over one. Evaluate current
> vendors against `ProviderCapabilities` in `services/orchestration/providers.ts`,
> and confirm the `nativeHold` answer explicitly during procurement.

---

## ADR-002 — FX: pure pass-through, no own book

**Status:** accepted · **Question:** own liquidity vs licensed partner

**Decision:** Lenz Pay quotes a licensed FX partner's rate plus a disclosed
markup, and never holds a currency position of its own. The markup is the
revenue; the position is the partner's.

**Why:** running an own book means inventory risk, an FX licensing path on the
critical path, and treasury capability unrelated to the product's actual
innovation. §7 already recommends this for licensing reasons; the commercial
argument points the same way. The spread is implemented as `feeScheduleFor` in
`fx.ts` and disclosed to the user before confirmation (§5.5) via
`PlanDisclosure`.

**What this costs:** worse rates than an own book could eventually offer, and
dependence on the partner honouring a locked quote through to settlement — not
merely at quote time. That distinction is a procurement question, not an
implementation detail: `Orchestration.rateLockWindowMs` is 45s and the partner
must honour at least that.

**Revisit when:** FX volume is large enough that the spread paid to the partner
exceeds the cost of licensing and running a book — and not before, because the
failure mode of an under-capitalised own book is losing customer money.

---

## ADR-003 — Crypto: custody-as-a-service via a licensed VASP

**Status:** accepted · **Question:** custodial vs non-custodial · **Phase 4**

**Decision:** a licensed VASP partner holds the balance in the user's name;
Lenz Pay holds debit authority. Lenz neither self-custodies nor requires
non-custodial wallet signatures.

**Why not self-custody:** it makes Lenz a VASP. §7 explicitly says to route
crypto legs through a licensed partner pre-licence.

**Why not non-custodial linking:** it sounds like the safer option and is
actually the one that breaks the product. Every payment would need a wallet
signature mid-flow. That destroys the "just works" UX, and inside a waterfall
it's worse than that — the whole point of §5.4 is that all legs commit
together, which is incompatible with pausing to await a user's signature on one
of them.

Custody-as-a-service gets custodial UX without Lenz taking custody or the
licence burden.

**What this costs:** counterparty risk concentrated in the custody partner, and
a crypto conversion + off-ramp leg (~5 min) far slower than the bank legs. That
latency is precisely why the payee must never wait on it — see ADR-004.

**Revisit when:** Phase 4 actually begins. This decision has runway, and the
Nigerian digital-asset licensing landscape moves fast enough that the
options should be re-evaluated then rather than locked now.

---

## ADR-004 — Treasury: Lenz-funded settlement float, and it *is* the atomicity mechanism

**Status:** accepted · **Question:** who fronts liquidity · **Follows from:** ADR-000

**Decision:** Lenz Pay funds a settlement float. The float pays the payee in one
indivisible operation, then collects from the user's linked accounts afterwards.
Exposure is bounded by explicit limits in `services/orchestration/treasury.ts`.

This is not merely a latency-smoothing measure. Given ADR-000, **the float is
what makes multi-account payments atomic at all.**

### How it changes the risk

| | Hold-then-capture | Float-fronted |
|---|---|---|
| Payee sees | One payment, after all legs capture | One payment, immediately |
| If a leg fails | Whole payment aborts | Payment already succeeded |
| Who carries the risk | The user (partial-charge exposure) | Lenz (collection exposure) |

It converts the user's partial-charge risk into Lenz's collection risk. That is
the right trade in one direction only: a failed collection is a business cost
that can be priced, retried, and bounded. A user charged across three accounts
for a payment that never landed is an unrecoverable trust failure — and trust is
the entire product.

### Why this isn't lending

Float is fronted only after the planner has already proven the user's own linked
balances cover the payment. Lenz is bridging a settlement-timing gap of seconds
to hours, not extending credit. The exposure limits exist to bound the gap, not
to underwrite a borrower.

### Bounds (all in `constants/config.ts` → `Treasury`)

- **₦200,000** per transaction
- **₦500,000** outstanding per user
- **₦50,000,000** total outstanding — the treasury's hard ceiling
- **0.9** minimum collection confidence, computed as the *product* of per-leg
  confidence (source reliability × balance freshness). Multiplicative because a
  waterfall only fully collects if every leg does; one flaky account should drag
  the plan down, not be averaged away by three good ones.
- **3** collection attempts before escalation to manual recovery

### The rule when the float refuses

- **Single-leg plan** → fall back to direct debit. One account means no
  partial-charge risk, and the existing rollback path covers a failed payout.
- **Multi-leg plan** → **refuse the payment.** Debiting several accounts with
  neither holds nor float is exactly the failure this engine exists to prevent.
  Refusing is the correct answer, and the engine does it rather than gambling.

### What the user is told

A payment whose collection partially failed is reported as **successful**,
because it was — the payee has their money. The receipt names any account still
being debited, so the charge doesn't arrive later unexplained. The uncollected
amount is Lenz's to recover and is never framed to the user as their failure.

**What this costs:** working capital, and real collection losses. Both are
bounded by the limits above and priced into the spread. The float requirement
scales with transaction volume × collection latency, which is the number to
model before scaling the limits.

**Revisit when:** an aggregator offers a genuine authorise/capture split (see
ADR-000), at which point hold-then-capture becomes available for bank legs and
float exposure drops to the FX and crypto corridors only.

---

---

## ADR-005 — Operate under a partner licence first; take our own later

**Status:** accepted · **Implements:** the phased path out of ADR-000/004

**Decision:** Lenz does not seek its own CBN licence to launch. It operates as a
**Technical Service Provider** above licensed rails, and moves up a ladder of
regulatory postures as volume justifies it. The posture is a single setting —
`ACTIVE_PHASE` in `constants/config.ts` — and it drives float, leg cap, netting
and float ownership together, so "what are we licensed to do" cannot desync
from what the engine will actually attempt.

### The three tests that decide the licence

1. **Do we hold customer funds?** → Mobile Money Operator / Payment Service Bank
2. **Do we move money in our own name?** → Switching and Processing
3. **Do we extend credit?** → lending licence

Answer no to all three and no licence of our own is required. Orchestration is
*instruction*: debits run on the aggregator's mandate, payouts on the PSP's
rails, conversion inside the FX or VASP partner.

### The float is what breaks that

Fronting settlement from our own balance sheet triggers tests 2 and 3 at once.
The thing that solved atomicity is the thing that pushes us into the heavy
categories. Resolution, in preference order:

- **Partner-held float** — the PSP operates it on their licence; we
  collateralise it. Legally theirs, economically ours. Preserves the full
  product. This is `partner_float`, and it is the posture to get counsel on.
- **No float** — collect first, then settle. Zero credit exposure, zero licence,
  single-source only. This is `partner_tsp`, and it is shippable today.
- **Agent model** — operate as an agent of a licensed MMO.

### The phases

| Phase | Float | Legs | Netting | Licence |
|---|---|---|---|---|
| `partner_tsp` | none | 1 | no | **none of our own** |
| `partner_float` | partner-held | 2 | yes | partner's |
| `own_licence` | ours | 4 | yes | PSSP → Switching |

`partner_tsp` is not a degraded mode — it is exactly §9's Phase 1, and a
single-source payment needs no float because there is only one account to
debit and therefore no partial-charge risk to protect against. The product
phasing and the licensing path are the same ladder.

Smart Split and netted collection unlock **together** at `partner_float`, which
is fortunate: the split is what makes netting worth doing, and netting is what
makes the split affordable (ADR-006).

**Revisit when:** volume makes partner margin exceed the cost of licensing, or
a partner relationship becomes a single point of failure.

---

## ADR-006 — Price the cost of moving money, and net collection

**Status:** accepted

**Decision:** the cost of a *debit* is a first-class planning input, and
collection is deferred and netted per account rather than executed per leg.

### The problem

The engine priced conversion and ignored movement. Aggregator direct debit in
Nigeria costs a flat fee in the ₦50–60 range per debit on small amounts, and a
waterfall pays it **per leg**. On a ₦4,500 payment split three ways that is
~₦165 to collect against roughly ₦67 of revenue at 1.5% — deeply negative.

Worse, it is structurally adverse: the waterfall fires precisely when the user
is short across every account, so the most expensive path runs on the smallest,
least profitable payments.

### What changed

- `orchestration/costs.ts` models per-rail debit cost. `FundingPlan` now carries
  `collectionCost` — what *Lenz* pays to move, distinct from `totalFees`, what
  the *user* pays to convert.
- The planner prefers legs that clear their own debit fee, and will not add a
  source whose entire balance is worth less than the cost of pulling it.
- **Cost optimisation never overrides coverage.** If the economic subset cannot
  cover the payment but the full set can, the full set is used. A payment the
  user can afford must not fail because one leg is small. Pinned by test.
- Leg cap cut from 4 to 2 under `partner_float`. Each extra leg is another
  fixed fee for diminishing benefit.

### Netting

Because the float already decouples paying the payee from collecting,
collection need not be immediate or per-leg. `orchestration/collections.ts`
queues legs and sweeps one debit per account:

> Five payments a day across two accounts: ten debits inline, two netted.

The saving scales with activity, which inverts the economics — active users
become cheaper to serve per payment rather than more expensive.

**What it costs:** exposure lives from settlement until the next sweep rather
than for seconds. Sweep cadence is a direct trade of collection cost against
exposure duration, and `Treasury`'s ceilings are load-bearing here rather than
guarding an edge case.

**Before launch:** replace the list prices in `RAIL_COSTS` with your negotiated
commercial terms, and model cost-per-leg × expected-legs × payment-mix against
what the merchant actually pays. If netted collection doesn't get blended cost
into single-digit percent on a ₦5,000 payment, the product needs a different
price point rather than a different engine.

---

---

## ADR-007 — Read the national QR standard, even though we can't issue it

**Status:** accepted

**Decision:** the scanner parses EMVCo Merchant-Presented Mode — the format
behind Nigeria's NQR — alongside our own `lenzpay://` scheme.
`services/emvco.ts`.

**Why:** a merchant with an NQR sticker already on the counter is not going to
print a second one for us. Without this, every such merchant is unscannable,
which constrains acceptance far more than anything inside the app. Issuing NQR
requires being a scheme participant, which is a licensing question (ADR-005);
*reading* it requires only a TLV parser and a CRC check.

**Safety:** a code failing its CRC-16 is refused outright rather than paid — a
bad checksum means misread or tampered, and the alternative is settling to a
corrupted destination. A valid national code names a real merchant we have no
independent record of, so it resolves **unverified** and the UI warns rather
than reassures.

**What this costs:** we can accept these payments but not originate the codes,
so Lenz merchants still need a Lenz QR. Full interoperability needs scheme
participation.

---

## ADR-008 — One brand green

**Status:** accepted

**Decision:** `Colors.primary` (`#34fea0`, mint) is the single source of truth
for the brand accent, including the wordmark.

**Why:** the app icon uses `#b5e61d`, a yellow-lime. Two greens is a brand bug.
The token wins because every CTA, badge, chart accent and focus state already
uses it — changing the token would mean recolouring the entire product to match
one asset.

**Done.** The assets were recoloured in place: `icon.png`, `favicon.png`,
`splash-icon.png` and `android-icon-foreground.png` now carry `#34fea0`.

No design tool was needed — the glyphs already existed, so this was a recolour
rather than a redraw. The method matters for anyone repeating it:

- Accent coverage per pixel is derived from `g − b`, which separates the lime
  accent (201) from both the plate (−3) and the white "Lenz" (0). That is what
  lets the accent change without touching the white half of the wordmark.
- On the opaque icons antialiasing lives in RGB, so edge pixels are recomposed
  as `plate + coverage × mint`. On the transparent assets coverage lives in the
  alpha channel, so RGB is shifted and alpha preserved.
- Naively swapping exact-match pixels would have left lime fringing on every
  glyph edge. Verified afterwards: zero residual lime pixels, white pixel count
  unchanged, and all four files got smaller.

`android-icon-background.png` (solid plate) and `android-icon-monochrome.png`
(single-colour by definition) carry no accent and were correctly left alone.

The icon plate remains `#1c2326` while the app canvas is `#0e0e0f`. That is
deliberate — a home-screen icon is its own surface, and the splash background
was already aligned to the canvas separately.

---

## ADR-009 — Disputes and partial reversal

**Status:** accepted · **Implements:** §7

**Decision:** disputes are raised against specific *legs*, not only whole
transactions, and resolving one in the user's favour reverses exactly those legs.
`services/disputes.ts`.

**Why:** §7 requires partial reversal to be first-class. The ledger has always
supported it — every posting carries a `legId` — but nothing drove it. A user
whose bank leg settled fine while the crypto off-ramp failed should be able to
dispute that leg alone.

**Honesty about the gap:** there is no dispute backend. Submissions queue
locally so they survive to be flushed later. A button that silently drops the
case would be worse than no button. The previous UI labelled this "Dispute
Transaction" while routing to generic support — a label promising a flow that
did not exist; it now says "Report a problem" and does something real.

---

---

## ADR-010 — Persistence, and what it means for money

**Status:** accepted

**Decision:** state is persisted to MMKV behind a swappable interface
(`services/persistence.ts`). UI stores use zustand's `persist`; the engine's
money-critical state persists directly.

**Why this was urgent rather than tidy.** Everything lived in memory.
`react-native-mmkv` was a dependency and entirely unused. Three of the losses
were money, not preferences:

- **Collection queue.** Netting defers collection, so an uncollected leg is
  money the float has *already paid out*. Losing the queue on relaunch means it
  is never recovered — straight revenue loss, and the more successful netting
  is, the more there is to lose.
- **Float exposure.** Forgetting it loses the debt *and* resets the per-user
  ceiling, so a user could exceed their limit by relaunching the app.
- **Idempotency keys.** An in-memory store forgets every key on restart, so a
  payment retried after a crash executes twice — precisely the double-charge
  the store exists to prevent. It failed hardest in the case it was written for.

**Two decisions worth keeping:**

*Only completed idempotency records are restored.* An `in_flight` record cannot
be trusted across a restart — the process that owned it is gone, so nothing will
ever complete or abandon it, and restoring it would deadlock that key forever.

*Dates are tagged explicitly in the codec.* `JSON.stringify` calls
`Date.prototype.toJSON` **before** the replacer runs, so a naive
`value instanceof Date` check never fires and dates silently rehydrate as
strings. `PaymentSource.lastSynced` feeds `collectionConfidence`, which calls
`.getTime()` — that would have thrown, or worse, scored every restored source
as infinitely stale. The codec reads `this[key]` from a non-arrow replacer to
reach the original. Pinned by test; the first implementation had the bug.

**Not persisted, deliberately:** in-flight fraud alerts (session-scoped —
restoring one confronts the user with a warning they already handled) and
`isLoading` (would restore a spinner nothing resolves). The PIN was already in
`expo-secure-store`, which is hardware-backed, and stays there.

---

## ADR-011 — The daily limit now binds

**Status:** accepted

**Decision:** spend accumulates against a persisted daily ledger that rolls
over at local midnight, and `evaluatePaymentRisk` blocks a payment that would
breach it.

**Why:** `dailyLimitNGN` was stored, displayed and editable, and nothing ever
counted against it. A ₦500,000 daily limit did not stop ₦5,000,000 of payments.
A limit that does not bind is worse than no limit — it tells the user they are
protected when they are not.

Spend is recorded only on **successful settlement**, so a blocked or failed
attempt never consumes headroom. Reads roll the day over implicitly, so a stale
counter from yesterday can never count against today. The security screen now
shows *used of limit* rather than the ceiling alone — a limit you cannot watch
yourself approach is a weak control.

This depends on ADR-010: a daily limit that resets whenever the app restarts
would be trivially defeated.

---

## ADR-012 — Source capabilities are resolved before planning, not after

**Status:** accepted · **Supersedes part of:** ADR-000's `chooseStrategy` note

The engine used to model what a rail could do with a single boolean on the rail
adapter — `supportsNativeHold` — and consult it only *after* a plan was built,
in `chooseStrategy`. That ordering is backwards.

Whether a source can authorise, whether it will disclose a balance, whether
spending it needs the user to sign something — these change **which accounts
should be chosen**, not merely how the chosen ones get executed. Deciding them
after planning means the planner asks:

> who has enough money?

when the question that actually matters is:

> which combination is safest and cheapest to execute?

**Decision:** a Source Capability Registry (`services/orchestration/capabilities.ts`)
resolves every source to a `SourceCapabilities` record before ranking runs, and
ranking scores on it. Capabilities merge in three layers — rail profile, then
per-type override, then whatever the provider reported on the source itself.
The last layer is the one that matters in practice: capabilities vary *within*
a rail, since one aggregator exposes authorise/capture and another only a
single-shot debit, so they cannot be a per-type assumption.

**What this buys.** A card cannot report a balance but can place a real hold. A
bank account can report a balance but can never lock it. Neither fact was
expressible before, and both change the right answer.

**Weighting, and why the capability terms are deliberately small.** The four new
ranking terms (`settlementCertainty`, `balanceCertainty`, `railReliability`,
`latency`) are all weighted below `currencyProximity` and `conversionCost`. This
is not timidity — it encodes who bears which cost. Execution certainty is
*Lenz's* risk; conversion cost is the *user's* money. A custody account is
genuinely safer to execute than a bank account, but not so much safer that it
justifies converting someone's dollars while their naira sits idle. The
capability terms discriminate among comparable sources; they must not overturn
the user-facing cost preference. There is a test that says exactly this.

**Guarantee ordering.** `RESERVED` outranks `PREAUTHORIZED`, which surprises
people. Funds ring-fenced in an account we control are a book entry that cannot
be declined; a card preauthorisation is a promise from an issuer that can still
decline at capture, lapse, or be disputed. `FLOAT_BACKED` is the floor, and it
is not a failure state — it is the accurate name for "verified but unlockable",
which is what every Nigerian bank leg is and will remain until a rail there
offers an authorisation step (ADR-000).

**Also fixed here:** the planner now sizes legs off `spendableRawBalance` rather
than the headline balance. A ₦100,000 balance with a ₦10,000 pending debit and a
₦5,000 minimum is ₦85,000 of real capacity, and planning against the larger
number produces legs that pass planning and fail collection.

**Verify before building against this:** the `RAIL_PROFILES` defaults are honest
descriptions of the corridor as we understand it, not contractual facts. Confirm
per provider — particularly whether any aggregator's debit product exposes an
authorise/capture split, which would change ADR-000 materially.

---

## ADR-013 — Three verbs: `plan` → `prepare` → `execute`

**Status:** accepted · **Depends on:** ADR-012

Two requirements were in direct conflict.

`plan()` must stay pure. It runs on every amount keystroke to keep the preview
live, and a planner that preauthorised a card as a side effect of being
*rendered* would place real holds on a user's account while they were still
typing.

But a plan built purely from cached balances is an estimate, and the product
promises the confirmation screen is not an estimate.

**Decision:** insert a third verb. Everything with an external effect moves into
`prepare()`, which runs once, after the user expresses intent and before they
commit:

- re-validate and re-lock FX quotes
- place real authorisations where the rail supports them (cards)
- ring-fence funds where we control the account (custody, FX partner)
- confirm a standing on-chain allowance covers the leg
- re-read balances on rails that can offer nothing better
- obtain float authorisation for whatever remains unprotected

The output is a `LockedPlan`: immutable, carrying a `GuaranteeKind` per leg, and
the only object `execute()` reads.

**This preserves the property the two-verb design had and must not lose** —
*the thing the user confirms is the thing the executor executes* — while
allowing the figures on the confirmation screen to be genuinely committed
rather than merely predicted. Anything re-derived between confirmation and
execution is drift, and drift is the class of bug the single-plan-object design
exists to prevent.

**Consequences worth stating plainly:**

- **Strategy is now read, not guessed.** `strategyForLocked()` inspects what the
  rails actually did rather than predicting what they could do. `SIGNED` counts
  as unprotected even though the user approved it, because an on-chain transfer
  cannot be released once broadcast, so a plan mixing it with other legs still
  needs the float to stay atomic.
- **The float is only charged for legs that need it.** Exposure is scored on the
  `FLOAT_BACKED` legs alone. Charging the treasury for a leg a card already
  authorised would consume headroom against a risk that is not there.
- **A failed prepare must leave nothing held.** Every authorisation already
  placed is released before the failure returns. Anything still authorised
  would sit against the user's balance until the rail's TTL expired — money
  they cannot spend, for a payment that never happened. When a release itself
  fails, `fullyRolledBack` is false and it needs a human, not a retry.
- **The executor no longer re-authorises prepared legs.** A leg arriving with a
  hold reference is skipped in the hold loop; re-holding would place a second
  authorisation against the same funds, which on a card is a visible duplicate
  pending charge.
- **Sufficiency checks are preferred over balance reads** where a provider
  offers them. "Can this account provide ₦37,500?" discloses strictly less than
  reading the balance and answers the only question planning needs. When a leg
  is verified that way, `verifiedBalance` stays `null` — inventing a figure
  would misstate what we actually know.

**Not yet done.** `BalanceProvider` is an injected interface with no production
implementation; absent one, float-backed legs are verified against the balance
the plan was built from. That is acceptable in development and is an unverified
credit decision in production.

---

## Launch-readiness blockers

Encoded as data in `providers.ts` (`outstandingBlockers()`) rather than left in
prose, so a readiness check can assert on them:

- Commercial agreements and production keys for both aggregators
- A licensed PSP partner of record for the debit rails (§7)
- Per-bank debit reachability confirmed, and the per-source routing table built
- FX partner quote API with a rate lock ≥ 45s, honoured **at settlement**
- VASP partner registration status verified directly (Phase 4)
- Float capital sized against modelled volume × collection latency
- Counsel sign-off on the float-as-credit question before moving to `partner_float` (ADR-005)
- `RAIL_COSTS` replaced with negotiated commercial terms (ADR-006)
- Collection sweep scheduled as a backend job. The client-side trigger now
  **refuses to run** outside dev, so this is a hard launch dependency: without
  the job, nothing is ever collected (ADR-006, PROFIT-MODEL.md)
- Dispute backend to flush the local queue into (ADR-009)
- A real `BalanceProvider` wired to the aggregator, so `prepare()` verifies
  float-backed legs against a live balance rather than a cached one. Without it
  every float-fronted payment is an unverified credit decision (ADR-013)
- `RAIL_PROFILES` capability defaults confirmed per provider, especially whether
  any debit product exposes authorise/capture (ADR-012, and it would revise
  ADR-000)
- Brand assets regenerated in `#34fea0` (ADR-008)
- `DEFAULT_PRICING` replaced with negotiated MDR/FX share; `paymentsPerSweep`
  measured against real traffic rather than assumed (PROFIT-MODEL.md)
