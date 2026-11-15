import type { PlanTier } from '../types/bin.ts';

export const BTC_RECEIVING_ADDRESS = '16GoRWzah8RsNt3poZsmZGJt1eEFHbfTKB';

export interface PlanConfig {
  id: PlanTier;
  name: string;
  audience: string;
  monthlyPrice: number;
  annualPrice: number;
  lookupLimit: number | null;
  bulkEnabled: boolean;
  batchLimit: number;
  historyLimit: number;
  hasRoutingSignals: boolean;
  hasAuditCsv: boolean;
  summary: string;
  features: string[];
}

export const PLAN_ORDER: PlanTier[] = ['basic', 'medium', 'pro', 'business'];

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  basic: {
    id: 'basic',
    name: 'Basic',
    audience: 'For individual developers & testing',
    monthlyPrice: 50,
    annualPrice: 40,
    lookupLimit: 10,
    bulkEnabled: false,
    batchLimit: 0,
    historyLimit: 50,
    hasRoutingSignals: false,
    hasAuditCsv: false,
    summary:
      'Entry 6–8 digit IIN prefix inspection with ISO/IEC 7812 anatomy breakdown for up to 10 BIN lookups.',
    features: [
      'Up to 10 BIN lookups',
      'Single prefix lookup only (no bulk)',
      'ISO/IEC 7812 structural breakdown',
      'Standard JSON export',
    ],
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    audience: 'For growing merchant operations',
    monthlyPrice: 100,
    annualPrice: 80,
    lookupLimit: 40,
    bulkEnabled: false,
    batchLimit: 0,
    historyLimit: 200,
    hasRoutingSignals: true,
    hasAuditCsv: false,
    summary:
      'Expanded 40-BIN lookup allowance with deterministic issuer routing, commercial segmentation, and 8-digit readiness signals.',
    features: [
      'Up to 40 BIN lookups',
      'Single prefix lookup only (no bulk)',
      'Issuer routing & compliance signals',
      '200 session audit history entries',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    audience: 'For fraud & risk engineering teams',
    monthlyPrice: 200,
    annualPrice: 160,
    lookupLimit: null,
    bulkEnabled: false,
    batchLimit: 0,
    historyLimit: 500,
    hasRoutingSignals: true,
    hasAuditCsv: true,
    summary:
      'Unlimited single BIN lookups with issuer routing signals and 500-entry session audit log retention.',
    features: [
      'Unlimited single BIN lookups',
      'Single prefix lookup only (no bulk)',
      'Issuer routing & compliance signals',
      '500 session audit history entries',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    audience: 'For high-volume payment platforms',
    monthlyPrice: 300,
    annualPrice: 240,
    lookupLimit: null,
    bulkEnabled: true,
    batchLimit: 500,
    historyLimit: 2000,
    hasRoutingSignals: true,
    hasAuditCsv: true,
    summary:
      'Unlimited single lookups plus Bulk BIN Lookup screening, 2,000-entry history retention, and audit-enriched CSV exports.',
    features: [
      'Unlimited single BIN lookups',
      'Bulk BIN Lookup (up to 500 per run)',
      'Audit-enriched CSV & JSON exports',
      '2,000 session audit history entries',
    ],
  },
};

export function normalizePlanTier(value: unknown): PlanTier {
  if (value === 'medium' || value === 'pro' || value === 'business') {
    return value;
  }
  if (value === 'premium') return 'pro';
  return 'basic';
}
