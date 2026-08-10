import type { Payee } from '@/types/orchestration';
import type { Merchant } from '@/types/payment';
import type { PayeeDirectory } from '@/services/payee';
import { delay } from './delay';

/**
 * Stand-in for the aggregator name-enquiry endpoint and the Lenz merchant
 * directory. Swap for real lookups behind the same `PayeeDirectory` interface.
 */

// Account numbers below are real NUBAN check-digit-valid numbers for their
// bank codes, so the manual-entry flow's local validation passes before the
// directory lookup runs. Regenerate the last digit if a bank code changes.
export const MOCK_PAYEES: Payee[] = [
  {
    id: 'mkt_bolt_001',
    displayName: 'Bolt Driver — Emeka',
    resolutionType: 'qr',
    settlementCurrency: 'NGN',
    receivingMethod: 'bank_transfer',
    accountNumber: '0123456784',
    bankCode: '044',
    lenzTag: '@ridehailer_lagos',
    isVerified: true,
  },
  {
    id: 'mkt_coffee_001',
    displayName: 'Coffee & Co.',
    resolutionType: 'lenz_tag',
    settlementCurrency: 'NGN',
    receivingMethod: 'bank_transfer',
    accountNumber: '9876543216',
    bankCode: '058',
    lenzTag: '@coffeeandco',
    isVerified: true,
  },
  {
    // The merchant app's own profile (see mock/merchant.ts). Without this the
    // consumer app can scan the merchant QR but has nowhere to settle to.
    id: 'mch_001',
    displayName: 'Emeka\u2019s Kitchen',
    resolutionType: 'qr',
    settlementCurrency: 'NGN',
    receivingMethod: 'bank_transfer',
    accountNumber: '2210987653',
    bankCode: '058',
    lenzTag: '@emekaskitchen',
    isVerified: true,
  },
  {
    id: 'mkt_crypto_001',
    displayName: 'Lekki Electronics',
    resolutionType: 'qr',
    settlementCurrency: 'NGN',
    receivingMethod: 'bank_transfer',
    // Accepts stablecoins directly, so the engine can skip the off-ramp (§5.6).
    acceptedCryptoAssets: ['USDT'],
    accountNumber: '5544332213',
    bankCode: '033',
    lenzTag: '@lekkielectronics',
    isVerified: true,
  },
];

/**
 * Bridge from the UI's `Merchant` (a display concept) to the engine's `Payee`
 * (a settlement concept). Prefers the directory entry so a scanned merchant
 * settles to its real registered account; falls back to a synthesised payee so
 * demo merchants still route end-to-end.
 */
export function payeeFromMerchant(merchant: Merchant): Payee {
  const known = MOCK_PAYEES.find((payee) => payee.id === merchant.id);
  if (known) return { ...known, displayName: merchant.name };

  return {
    id: merchant.id,
    displayName: merchant.name,
    resolutionType: 'qr',
    settlementCurrency: 'NGN',
    receivingMethod: 'bank_transfer',
    acceptedCryptoAssets: merchant.acceptedCurrencies.filter(
      (currency) => currency === 'BTC' || currency === 'USDT' || currency === 'ETH'
    ),
    isVerified: merchant.isVerified,
  };
}

export const mockPayeeDirectory: PayeeDirectory = {
  async lookupId(payeeId) {
    await delay(120, 300);
    return MOCK_PAYEES.find((payee) => payee.id === payeeId);
  },

  async lookupAccount(accountNumber, bankCode) {
    await delay(300, 700); // name enquiry is a network round-trip
    return MOCK_PAYEES.find(
      (payee) => payee.accountNumber === accountNumber && payee.bankCode === bankCode
    );
  },

  async lookupTag(tag) {
    await delay(150, 350);
    const normalised = tag.toLowerCase();
    return MOCK_PAYEES.find((payee) => payee.lenzTag?.toLowerCase() === normalised);
  },
};
