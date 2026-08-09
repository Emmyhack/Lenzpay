export interface NigerianBank {
  code: string;
  name: string;
}

// A representative set of Nigerian banks + fintech-issued accounts for the
// bank picker. Not exhaustive — swap for a live NIBSS/Paystack bank list
// once services/sources.ts talks to a real backend.
export const NIGERIAN_BANKS: NigerianBank[] = [
  { code: '044', name: 'Access Bank' },
  { code: '063', name: 'Access Bank (Diamond)' },
  { code: '023', name: 'Citibank Nigeria' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '030', name: 'Heritage Bank' },
  { code: '301', name: 'Jaiz Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '526', name: 'Parallex Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '101', name: 'Providus Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '068', name: 'Standard Chartered Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '100', name: 'Suntrust Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '215', name: 'Unity Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '50211', name: 'Kuda Microfinance Bank' },
  { code: '999992', name: 'OPay (Paycom)' },
  { code: '999991', name: 'PalmPay' },
  { code: '50515', name: 'Moniepoint MFB' },
  { code: '090267', name: 'Rubies MFB' },
  { code: '090405', name: 'Sparkle Microfinance Bank' },
  { code: '565', name: 'Carbon' },
  { code: '090175', name: 'Rolez MFB' },
  { code: '090180', name: 'Fairmoney MFB' },
  { code: '100022', name: 'VFD Microfinance Bank' },
  { code: '090198', name: 'Palmcredit / NewEdge MFB' },
];
