// NIBSS bank code -> official domain, for fetching each institution's real
// logo live (via BankLogo) instead of bundling trademarked files we can't
// license or verify for every bank. Populated only where the institution's
// favicon was manually checked and confirmed to be their actual mark — banks
// without a verified-good result are omitted on purpose so BankLogo falls
// back to its tinted-initials design rather than show a wrong/generic icon.
// Codes match mock/banks.ts NIGERIAN_BANKS.
export const BANK_LOGO_DOMAIN: Record<string, string> = {
  '044': 'accessbankplc.com', // Access Bank
  '063': 'accessbankplc.com', // Access Bank (Diamond)
  '023': 'citibank.com', // Citibank Nigeria
  '050': 'ecobank.com', // Ecobank Nigeria
  '070': 'fidelitybank.ng', // Fidelity Bank
  '214': 'fcmb.com', // First City Monument Bank
  '301': 'jaizbankplc.com', // Jaiz Bank
  '082': 'keystonebankng.com', // Keystone Bank
  '068': 'sc.com', // Standard Chartered Bank
  '232': 'sterling.ng', // Sterling Bank
  '100': 'suntrustng.com', // Suntrust Bank
  '033': 'ubagroup.com', // United Bank for Africa
  '035': 'wemabank.com', // Wema Bank
  '057': 'zenithbank.com', // Zenith Bank
  '50211': 'kuda.com', // Kuda Microfinance Bank
  '999992': 'opayweb.com', // OPay (Paycom)
  '999991': 'palmpay.com', // PalmPay
  '50515': 'moniepoint.com', // Moniepoint MFB
  '090267': 'rubies.ng', // Rubies MFB
  '565': 'getcarbon.co', // Carbon
  '090180': 'fairmoney.io', // Fairmoney MFB
  '100022': 'vfdgroup.com', // VFD Microfinance Bank
};
