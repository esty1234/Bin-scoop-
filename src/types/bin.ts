export type FundingType = 'debit' | 'credit' | 'charge' | 'unknown';

export type RegistrySource =
  | 'binlist-registry'
  | 'handyapi-registry'
  | 'sandbox-reference'
  | 'iso7812-structural';

export interface Iso7812Breakdown {
  iin: string;
  iinLength: 6 | 7 | 8;
  miiDigit: string;
  miiCategory: string;
  issuerIdentifier: string;
  detectedScheme: string;
  expectedPanLengths: number[];
  luhnRequired: boolean;
  prefixRule: string;
}

export interface BinBankInfo {
  name: string | null;
  url: string | null;
  phone: string | null;
  city: string | null;
}

export interface BinCountryInfo {
  numeric: string | null;
  alpha2: string | null;
  name: string | null;
  currency: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface BinLookupResult {
  bin: string;
  normalizedBin: string;
  scheme: string | null;
  brand: string | null;
  type: FundingType;
  prepaid: boolean | null;
  numberLength: number | null;
  luhn: boolean | null;
  bank: BinBankInfo;
  country: BinCountryInfo;
  iso7812: Iso7812Breakdown;
  source: RegistrySource;
  registryNote: string | null;
  cached: boolean;
  checkedAt: string;
}

export interface BatchItemResult {
  input: string;
  valid: boolean;
  error: string | null;
  result: BinLookupResult | null;
}

export interface BatchLookupResponse {
  total: number;
  validCount: number;
  invalidCount: number;
  items: BatchItemResult[];
  processedAt: string;
}

export type PlanTier = 'basic' | 'medium' | 'pro' | 'business';
export type BillingCycle = 'monthly' | 'annual';

export interface BtcQuoteResponse {
  plan: PlanTier;
  billingCycle: BillingCycle;
  usdAmount: number;
  btcUsdRate: number;
  btcAmount: string;
  satoshis: number;
  address: string;
  bip21Uri: string;
  rateSource: string;
  quotedAt: string;
}

export interface PaidEntitlement {
  plan: PlanTier;
  billingCycle: BillingCycle;
  txid: string;
  paidSats: number;
  address: string;
  confirmed: boolean;
  verifiedAt: string;
  receiptToken: string;
}

