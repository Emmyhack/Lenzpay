import type { CurrencyCode } from '@/types/payment';
import type {
  FundingLeg,
  LedgerAccount,
  LedgerDirection,
  LedgerEntry,
  Payee,
} from '@/types/orchestration';
import { Treasury as TreasuryConfig } from '@/constants/config';
import { roundCurrency } from '@/services/money';
import { nextId } from './ids';

/**
 * Whose books the float sits on. Under a partner licence the float is legally
 * the partner's, and the ledger has to say so — "our float" and "float we
 * collateralise on someone else's licence" are different liabilities.
 */
function floatRef(currency: string): string {
  return `float_${TreasuryConfig.floatOwner}_${currency}`;
}

/**
 * Ledger & reconciliation (§6.1).
 *
 * ## Sign convention
 *
 * This is a *movement* ledger, and the convention is uniform across every
 * account:
 *
 *   debit  = value flows **into** this account
 *   credit = value flows **out of** this account
 *
 * So a funding source is credited when the user's account gives up money;
 * float is debited on the way in and credited on the way out; the payee
 * settlement account is debited as funds destined for the payee accumulate.
 * A formal chart-of-accounts presentation (assets vs. liabilities vs. revenue)
 * is a reporting-layer concern and maps cleanly onto these movements.
 *
 * ## The invariant
 *
 * Every posting *set* balances **within each currency**: Σdebits = Σcredits.
 * Cross-currency movement is never expressed as one lopsided posting — it goes
 * through `fx_clearing`, which holds the currency position explicitly. That is
 * what lets a ₦4,500 payment funded from two banks and a crypto wallet
 * reconcile to the kobo, and what makes a per-leg reversal tractable.
 *
 * `post()` throws on an unbalanced set. That is deliberate: an unbalanced
 * ledger write is a bug that must never reach production silently.
 */

export interface PostingDraft {
  account: LedgerAccount;
  accountRef: string;
  direction: LedgerDirection;
  amount: number;
  currency: CurrencyCode;
  description: string;
  legId?: string;
  reversalOf?: string;
}

export class UnbalancedPostingError extends Error {
  readonly currency: CurrencyCode;
  readonly debits: number;
  readonly credits: number;

  constructor(currency: CurrencyCode, debits: number, credits: number) {
    super(`Unbalanced posting in ${currency}: debits ${debits} != credits ${credits}`);
    this.name = 'UnbalancedPostingError';
    this.currency = currency;
    this.debits = debits;
    this.credits = credits;
  }
}

export class Ledger {
  private readonly entries: LedgerEntry[] = [];

  /**
   * Write a set of postings atomically. Throws `UnbalancedPostingError` if any
   * currency in the set doesn't balance — nothing is written in that case.
   */
  post(transactionId: string, drafts: PostingDraft[], now = Date.now()): LedgerEntry[] {
    assertBalanced(drafts);

    const written = drafts.map<LedgerEntry>((draft) => ({
      id: nextId('led'),
      transactionId,
      legId: draft.legId,
      account: draft.account,
      accountRef: draft.accountRef,
      direction: draft.direction,
      amount: draft.amount,
      currency: draft.currency,
      description: draft.description,
      createdAt: now,
      reversalOf: draft.reversalOf,
    }));

    this.entries.push(...written);
    return written;
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  forTransaction(transactionId: string): LedgerEntry[] {
    return this.entries.filter((entry) => entry.transactionId === transactionId);
  }

  forLeg(legId: string): LedgerEntry[] {
    return this.entries.filter((entry) => entry.legId === legId);
  }

  /**
   * Net movement per currency for a transaction. Every value must be 0 for a
   * consistent ledger — this is the reconciliation check.
   */
  netByCurrency(transactionId: string): Record<string, number> {
    const net: Record<string, number> = {};
    for (const entry of this.forTransaction(transactionId)) {
      const delta = entry.direction === 'debit' ? entry.amount : -entry.amount;
      net[entry.currency] = roundCurrency(
        (net[entry.currency] ?? 0) + delta,
        entry.currency
      );
    }
    return net;
  }

  /** True when every currency nets to zero across the whole transaction. */
  reconciles(transactionId: string): boolean {
    return Object.values(this.netByCurrency(transactionId)).every(
      (value) => Math.abs(value) < 1e-9
    );
  }
}

function assertBalanced(drafts: PostingDraft[]): void {
  const byCurrency = new Map<CurrencyCode, { debits: number; credits: number }>();

  for (const draft of drafts) {
    if (draft.amount < 0) {
      throw new Error('Ledger amounts must be non-negative; use direction to signal flow');
    }
    const totals = byCurrency.get(draft.currency) ?? { debits: 0, credits: 0 };
    if (draft.direction === 'debit') totals.debits += draft.amount;
    else totals.credits += draft.amount;
    byCurrency.set(draft.currency, totals);
  }

  for (const [currency, { debits, credits }] of byCurrency) {
    const d = roundCurrency(debits, currency);
    const c = roundCurrency(credits, currency);
    if (Math.abs(d - c) > 1e-9) {
      throw new UnbalancedPostingError(currency, d, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Posting builders
// ---------------------------------------------------------------------------

/**
 * Postings for one captured leg, tracing the full path:
 *
 *   funding source → float(source ccy) → [fx clearing] → float(settlement ccy)
 *                  → payee settlement + spread revenue
 *
 * Same-currency legs skip the clearing hop entirely.
 */
export function legPostings(leg: FundingLeg, payee: Payee): PostingDraft[] {
  return [
    ...sourceToFloatPostings(leg),
    ...floatToPayeePostings(payee, leg.amountInSettlementCurrency, leg.settlementCurrency, leg.id),
  ];
}

/**
 * The collection half of a leg: money leaves the user's account, lands in
 * float, and is converted if needed — but is *not* paid onward.
 *
 * Split out from `legPostings` because float-fronted settlement pays the payee
 * up front as one operation and collects afterwards. Reusing the full leg
 * postings there would credit the payee once per leg on top of the payment
 * already made.
 */
export function sourceToFloatPostings(leg: FundingLeg): PostingDraft[] {
  const drafts: PostingDraft[] = [];
  const src = leg.sourceCurrency;
  const dst = leg.settlementCurrency;
  const net = leg.amountInSettlementCurrency;
  const fee = leg.feeInSettlementCurrency;
  const gross = roundCurrency(net + fee, dst);

  // 1. The user's account gives up value; float receives it.
  drafts.push(
    {
      account: 'funding_source',
      accountRef: leg.sourceId,
      direction: 'credit',
      amount: leg.amountInSourceCurrency,
      currency: src,
      description: `${leg.source.label} debited`,
      legId: leg.id,
    },
    {
      account: 'lenz_float',
      accountRef: floatRef(src),
      direction: 'debit',
      amount: leg.amountInSourceCurrency,
      currency: src,
      description: `Float receives from ${leg.source.label}`,
      legId: leg.id,
    }
  );

  // 2. Conversion, if the source doesn't already hold the settlement currency.
  //    Two balanced pairs joined by the clearing account, which is where the
  //    currency position lives.
  if (src !== dst) {
    drafts.push(
      {
        account: 'lenz_float',
        accountRef: floatRef(src),
        direction: 'credit',
        amount: leg.amountInSourceCurrency,
        currency: src,
        description: `Converted ${src}→${dst} @ ${leg.quote.rate}`,
        legId: leg.id,
      },
      {
        account: 'fx_clearing',
        accountRef: `${src}_${dst}`,
        direction: 'debit',
        amount: leg.amountInSourceCurrency,
        currency: src,
        description: `FX clearing in (${src})`,
        legId: leg.id,
      },
      {
        account: 'fx_clearing',
        accountRef: `${src}_${dst}`,
        direction: 'credit',
        amount: gross,
        currency: dst,
        description: `FX clearing out (${dst})`,
        legId: leg.id,
      },
      {
        account: 'lenz_float',
        accountRef: floatRef(dst),
        direction: 'debit',
        amount: gross,
        currency: dst,
        description: `Float receives converted ${dst}`,
        legId: leg.id,
      }
    );
  }

  // 3. Spread retained as revenue.
  if (fee > 0) {
    drafts.push(
      {
        account: 'lenz_float',
        accountRef: floatRef(dst),
        direction: 'credit',
        amount: fee,
        currency: dst,
        description: 'Conversion spread retained',
        legId: leg.id,
      },
      {
        account: 'fx_spread_revenue',
        accountRef: `${src}_${dst}`,
        direction: 'debit',
        amount: fee,
        currency: dst,
        description: `Spread on ${src}→${dst}`,
        legId: leg.id,
      }
    );
  }

  return drafts;
}

/**
 * Float pays the payee. One posting pair, independent of how many accounts
 * funded it — which is exactly what makes float-fronted settlement atomic from
 * the payee's side.
 */
export function floatToPayeePostings(
  payee: Payee,
  amount: number,
  currency: CurrencyCode,
  legId?: string
): PostingDraft[] {
  return [
    {
      account: 'lenz_float',
      accountRef: floatRef(currency),
      direction: 'credit',
      amount,
      currency,
      description: `Float releases to ${payee.displayName}`,
      legId,
    },
    {
      account: 'payee_settlement',
      accountRef: payee.id,
      direction: 'debit',
      amount,
      currency,
      description: `Owed to ${payee.displayName}`,
      legId,
    },
  ];
}

/**
 * Mirror of an existing set of entries, for a reversal. Partial reversal — e.g.
 * unwinding only the crypto leg of a waterfall — is a first-class operation
 * (§7), which is why this works on a leg's entries rather than a whole
 * transaction's.
 */
export function reversalPostings(entries: LedgerEntry[], reason: string): PostingDraft[] {
  return entries.map((entry) => ({
    account: entry.account,
    accountRef: entry.accountRef,
    direction: entry.direction === 'debit' ? 'credit' : 'debit',
    amount: entry.amount,
    currency: entry.currency,
    description: `Reversal: ${reason}`,
    legId: entry.legId,
    reversalOf: entry.id,
  }));
}

/** Process-wide ledger for the dev/mock build. */
export const ledger = new Ledger();
