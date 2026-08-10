import type { Payee } from '@/types/orchestration';
import type { Merchant } from '@/types/payment';
import type { PayeeDirectory } from '@/services/payee';
import { delay } from './delay';

/**
 * Stand-in for the aggregator name-enquiry endpoint and the Lenz merchant
 * directory. Swap for real lookups behind the same `PayeeDirectory` interface.
 */

export const MOCK_PAYEES: Payee[] = [
  {
    id: 'mkt_bolt_001',
    displayName: 'Bolt Driver — Emeka',
    resolutionType: 'qr',
    settlementCurrency: 'NGN',
    receivingMethod: 'bank_transfer',
    accountNumber: '0123456789',
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
    accountNumber: '9876543210',
    bankCode: '058',
    lenzTag: '@coffeeandco',
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
    accountNumber: '5544332211',
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
