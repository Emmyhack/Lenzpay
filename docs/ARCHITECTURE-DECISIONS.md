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

**Outstanding:** `assets/icon.png`, `splash-icon.png` and the Android adaptive
icon are the outliers and need regenerating in mint. That needs a design tool,
not code.

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
- Brand assets regenerated in `#34fea0` (ADR-008)
- `DEFAULT_PRICING` replaced with negotiated MDR/FX share; `paymentsPerSweep`
  measured against real traffic rather than assumed (PROFIT-MODEL.md)
