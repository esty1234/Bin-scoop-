import type {
  BinBankInfo,
  BinCountryInfo,
  FundingType,
  Iso7812Breakdown,
} from '../types/bin.ts';

export interface MiiDefinition {
  digit: string;
  category: string;
  description: string;
}

export const MII_DEFINITIONS: MiiDefinition[] = [
  {
    digit: '0',
    category: 'ISO/TC 68 & Other Assignments',
    description: 'Reserved for ISO/TC 68 banking assignments and national standards bodies.',
  },
  {
    digit: '1',
    category: 'Airlines',
    description: 'Assigned to airline ticketing and Universal Air Travel Plan (UATP) cards.',
  },
  {
    digit: '2',
    category: 'Airlines, Financial & Future Assignments',
    description: 'Includes Mastercard 2-series (2221–2720) and Mir (2200–2204).',
  },
  {
    digit: '3',
    category: 'Travel & Entertainment (T&E)',
    description: 'American Express (34, 37), JCB (3528–3589), Diners Club (30, 36, 38).',
  },
  {
    digit: '4',
    category: 'Banking & Financial',
    description: 'Primary prefix space for Visa and Visa-co-branded debit/credit products.',
  },
  {
    digit: '5',
    category: 'Banking & Financial',
    description: 'Mastercard 5-series (51–55), Maestro, and domestic financial schemes.',
  },
  {
    digit: '6',
    category: 'Merchandising & Banking/Financial',
    description: 'Discover (6011, 644–649, 65), China UnionPay (62), Maestro, and RuPay.',
  },
  {
    digit: '7',
    category: 'Petroleum & Other Future Industry Assignments',
    description: 'Fuel fleet networks and specialized energy-sector payment cards.',
  },
  {
    digit: '8',
    category: 'Healthcare, Telecommunications & Other Assignments',
    description: 'HSA/FSA healthcare networks and telecom billing identifiers.',
  },
  {
    digit: '9',
    category: 'National Assignment',
    description: 'Reserved for domestic national standards and country-specific schemes.',
  },
];

interface NetworkRule {
  scheme: string;
  expectedPanLengths: number[];
  luhnRequired: boolean;
  ruleLabel: string;
  matches: (iin: string) => boolean;
}

function prefixNum(iin: string, length: number): number {
  if (iin.length < length) return -1;
  return Number.parseInt(iin.slice(0, length), 10);
}

const NETWORK_RULES: NetworkRule[] = [
  {
    scheme: 'American Express',
    expectedPanLengths: [15],
    luhnRequired: true,
    ruleLabel: 'Prefix 34 or 37 (ISO/IEC 7812 T&E)',
    matches: (iin) => iin.startsWith('34') || iin.startsWith('37'),
  },
  {
    scheme: 'Visa',
    expectedPanLengths: [16, 13, 19],
    luhnRequired: true,
    ruleLabel: 'Prefix 4 (ISO/IEC 7812 Banking/Financial)',
    matches: (iin) => iin.startsWith('4'),
  },
  {
    scheme: 'Mastercard',
    expectedPanLengths: [16],
    luhnRequired: true,
    ruleLabel: 'Prefix 51–55 or 222100–272099',
    matches: (iin) => {
      const p2 = prefixNum(iin, 2);
      const p4 = prefixNum(iin, 4);
      return (p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720);
    },
  },
  {
    scheme: 'Maestro',
    expectedPanLengths: [12, 13, 14, 15, 16, 17, 18, 19],
    luhnRequired: true,
    ruleLabel: 'Prefix 5018, 5020, 5038, 5893, 6304, 6759, 6761–6763',
    matches: (iin) =>
      ['5018', '5020', '5038', '5893', '6304', '6759', '6761', '6762', '6763'].some((p) =>
        iin.startsWith(p),
      ),
  },
  {
    scheme: 'Discover',
    expectedPanLengths: [16, 19],
    luhnRequired: true,
    ruleLabel: 'Prefix 6011, 644–649, or 65',
    matches: (iin) => {
      const p3 = prefixNum(iin, 3);
      return iin.startsWith('6011') || iin.startsWith('65') || (p3 >= 644 && p3 <= 649);
    },
  },
  {
    scheme: 'JCB',
    expectedPanLengths: [16, 17, 18, 19],
    luhnRequired: true,
    ruleLabel: 'Prefix 3528–3589',
    matches: (iin) => {
      const p4 = prefixNum(iin, 4);
      return p4 >= 3528 && p4 <= 3589;
    },
  },
  {
    scheme: 'UnionPay',
    expectedPanLengths: [16, 17, 18, 19],
    luhnRequired: false,
    ruleLabel: 'Prefix 62 or 81',
    matches: (iin) => iin.startsWith('62') || iin.startsWith('81'),
  },
  {
    scheme: 'Diners Club International',
    expectedPanLengths: [14, 16, 19],
    luhnRequired: true,
    ruleLabel: 'Prefix 300–305, 3095, 36, 38–39',
    matches: (iin) => {
      const p3 = prefixNum(iin, 3);
      return (
        (p3 >= 300 && p3 <= 305) ||
        iin.startsWith('3095') ||
        iin.startsWith('36') ||
        iin.startsWith('38') ||
        iin.startsWith('39')
      );
    },
  },
  {
    scheme: 'Mir',
    expectedPanLengths: [16],
    luhnRequired: true,
    ruleLabel: 'Prefix 2200–2204',
    matches: (iin) => {
      const p4 = prefixNum(iin, 4);
      return p4 >= 2200 && p4 <= 2204;
    },
  },
  {
    scheme: 'RuPay',
    expectedPanLengths: [16],
    luhnRequired: true,
    ruleLabel: 'Prefix 60, 6521–6522, 81, 82, 508',
    matches: (iin) =>
      iin.startsWith('60') ||
      iin.startsWith('6521') ||
      iin.startsWith('6522') ||
      iin.startsWith('508'),
  },
  {
    scheme: 'Troy',
    expectedPanLengths: [16],
    luhnRequired: true,
    ruleLabel: 'Prefix 9792',
    matches: (iin) => iin.startsWith('9792'),
  },
];

export function analyzeIso7812(rawBin: string): Iso7812Breakdown {
  const iin = rawBin.replace(/\D/g, '').slice(0, 8);
  const miiDigit = iin.charAt(0) || '0';
  const miiDef = MII_DEFINITIONS.find((m) => m.digit === miiDigit) ?? MII_DEFINITIONS[0];
  const matched = NETWORK_RULES.find((rule) => rule.matches(iin));
  const iinLength: 6 | 7 | 8 = iin.length >= 8 ? 8 : iin.length === 7 ? 7 : 6;

  return {
    iin,
    iinLength,
    miiDigit,
    miiCategory: miiDef.category,
    issuerIdentifier: iin.slice(1),
    detectedScheme: matched ? matched.scheme : 'Unassigned / Regional Scheme',
    expectedPanLengths: matched ? matched.expectedPanLengths : [16],
    luhnRequired: matched ? matched.luhnRequired : true,
    prefixRule: matched ? matched.ruleLabel : `MII ${miiDigit} (${miiDef.category})`,
  };
}

export interface SandboxBinRecord {
  bin: string;
  scheme: string;
  brand: string;
  type: FundingType;
  prepaid: boolean;
  numberLength: number;
  luhn: boolean;
  bank: BinBankInfo;
  country: BinCountryInfo;
  description: string;
}

export const PUBLIC_SANDBOX_BINS: Record<string, SandboxBinRecord> = {
  '424242': {
    bin: '424242',
    scheme: 'Visa',
    brand: 'Visa Classic (Gateway Sandbox)',
    type: 'credit',
    prepaid: false,
    numberLength: 16,
    luhn: true,
    bank: {
      name: 'Payment Gateway Test Issuer',
      url: null,
      phone: null,
      city: null,
    },
    country: {
      numeric: '840',
      alpha2: 'US',
      name: 'United States of America',
      currency: 'USD',
      latitude: 38,
      longitude: -97,
    },
    description: 'Standard Visa credit integration testing IIN',
  },
  '400000': {
    bin: '400000',
    scheme: 'Visa',
    brand: 'Visa Debit (Gateway Sandbox)',
    type: 'debit',
    prepaid: false,
    numberLength: 16,
    luhn: true,
    bank: {
      name: 'Payment Gateway Test Issuer',
      url: null,
      phone: null,
      city: null,
    },
    country: {
      numeric: '840',
      alpha2: 'US',
      name: 'United States of America',
      currency: 'USD',
      latitude: 38,
      longitude: -97,
    },
    description: 'Standard Visa debit integration testing IIN',
  },
  '555555': {
    bin: '555555',
    scheme: 'Mastercard',
    brand: 'Mastercard Standard (Gateway Sandbox)',
    type: 'credit',
    prepaid: false,
    numberLength: 16,
    luhn: true,
    bank: {
      name: 'Payment Gateway Test Issuer',
      url: null,
      phone: null,
      city: null,
    },
    country: {
      numeric: '840',
      alpha2: 'US',
      name: 'United States of America',
      currency: 'USD',
      latitude: 38,
      longitude: -97,
    },
    description: 'Standard Mastercard 5-series integration testing IIN',
  },
  '222300': {
    bin: '222300',
    scheme: 'Mastercard',
    brand: 'Mastercard 2-Series (Gateway Sandbox)',
    type: 'credit',
    prepaid: false,
    numberLength: 16,
    luhn: true,
    bank: {
      name: 'Payment Gateway Test Issuer',
      url: null,
      phone: null,
      city: null,
    },
    country: {
      numeric: '840',
      alpha2: 'US',
      name: 'United States of America',
      currency: 'USD',
      latitude: 38,
      longitude: -97,
    },
    description: 'Mastercard 2-series (2221–2720) integration testing IIN',
  },
  '378282': {
    bin: '378282',
    scheme: 'American Express',
    brand: 'American Express (Gateway Sandbox)',
    type: 'credit',
    prepaid: false,
    numberLength: 15,
    luhn: true,
    bank: {
      name: 'American Express Test Issuer',
      url: null,
      phone: null,
      city: null,
    },
    country: {
      numeric: '840',
      alpha2: 'US',
      name: 'United States of America',
      currency: 'USD',
      latitude: 38,
      longitude: -97,
    },
    description: '15-digit American Express integration testing IIN',
  },
  '601111': {
    bin: '601111',
    scheme: 'Discover',
    brand: 'Discover Network (Gateway Sandbox)',
    type: 'credit',
    prepaid: false,
    numberLength: 16,
    luhn: true,
    bank: {
      name: 'Discover Test Issuer',
      url: null,
      phone: null,
      city: null,
    },
    country: {
      numeric: '840',
      alpha2: 'US',
      name: 'United States of America',
      currency: 'USD',
      latitude: 38,
      longitude: -97,
    },
    description: 'Standard Discover integration testing IIN',
  },
  '353011': {
    bin: '353011',
    scheme: 'JCB',
    brand: 'JCB Standard (Gateway Sandbox)',
    type: 'credit',
    prepaid: false,
    numberLength: 16,
    luhn: true,
    bank: {
      name: 'JCB Test Issuer',
      url: null,
      phone: null,
      city: null,
    },
    country: {
      numeric: '392',
      alpha2: 'JP',
      name: 'Japan',
      currency: 'JPY',
      latitude: 36,
      longitude: 138,
    },
    description: 'Standard JCB integration testing IIN',
  },
};
