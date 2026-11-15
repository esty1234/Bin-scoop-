import { useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  Code2,
  Copy,
  Globe,
  Info,
  Lock,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { PLAN_CONFIGS } from '../lib/plans.ts';
import type { BinLookupResult, PlanTier } from '../types/bin.ts';

interface SingleLookupViewProps {
  query: string;
  onQueryChange: (next: string) => void;
  onLookup: (binOverride?: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  truncationNotice: string | null;
  result: BinLookupResult | null;
  currentPlan: PlanTier | null;
  lookupCount: number;
  onOpenPlans: () => void;
}

const SAMPLE_PREFIXES: Array<{ bin: string; label: string }> = [
  { bin: '424242', label: 'Visa Sandbox' },
  { bin: '400000', label: 'Visa Debit' },
  { bin: '555555', label: 'Mastercard 5-Series' },
  { bin: '222300', label: 'Mastercard 2-Series' },
  { bin: '378282', label: 'Amex 15-Digit' },
  { bin: '601111', label: 'Discover' },
  { bin: '353011', label: 'JCB' },
];

function formatSourceLabel(source: BinLookupResult['source']): string {
  switch (source) {
    case 'binlist-registry':
      return 'Binlist Public Registry';
    case 'handyapi-registry':
      return 'HandyAPI BIN Registry';
    case 'sandbox-reference':
      return 'Gateway Sandbox Specification';
    case 'iso7812-structural':
      return 'ISO/IEC 7812 Structural Analyzer';
  }
}

function formatFundingLabel(type: BinLookupResult['type']): string {
  switch (type) {
    case 'credit':
      return 'Credit';
    case 'debit':
      return 'Debit';
    case 'charge':
      return 'Charge';
    case 'unknown':
      return 'Unspecified';
  }
}

export default function SingleLookupView({
  query,
  onQueryChange,
  onLookup,
  loading,
  error,
  truncationNotice,
  result,
  currentPlan,
  lookupCount,
  onOpenPlans,
}: SingleLookupViewProps) {
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const planConfig = currentPlan ? PLAN_CONFIGS[currentPlan] : null;
  const lookupLimit = planConfig ? planConfig.lookupLimit : 0;
  const quotaExceeded = lookupLimit !== null && lookupCount >= lookupLimit;
  const remainingLookups =
    lookupLimit === null ? null : Math.max(0, lookupLimit - lookupCount);

  if (!planConfig) {
    return (
      <section className="bg-white border border-slate-200 rounded-lg p-8">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-800 mb-2">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Payment Required</span>
            <span aria-hidden="true">·</span>
            <span>No Active Plan</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Pay for a Workspace Plan Before Looking Up BINs
          </h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            An active paid plan is required before performing IIN/BIN lookups. Choose Basic ($50),
            Medium ($100), Pro ($200), or Business ($300) and complete payment in Bitcoin (BTC) to
            unlock lookups immediately.
          </p>
          <div className="mt-5">
            <button
              type="button"
              onClick={onOpenPlans}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Select &amp; Pay Plan with BTC
            </button>
          </div>
        </div>
      </section>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onLookup();
  };

  const handleCopyJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const iinDigits = result ? result.iso7812.iin.split('') : [];
  const totalPreviewLength = result?.numberLength ?? 16;
  const maskedTailCount = Math.max(0, totalPreviewLength - iinDigits.length);

  return (
    <div className="space-y-6">
      {/* Query Panel */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight text-balance">
              IIN / BIN Issuer Metadata Lookup
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Enter a 6 to 8 digit Issuer Identification Number (IIN/BIN) to retrieve card network,
              funding classification, issuing institution, country, and ISO/IEC 7812 structural rules.
            </p>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap shrink-0 pt-1">
            {lookupLimit === null ? (
              <span>
                {planConfig.name} · Unlimited lookups ({lookupCount} used)
              </span>
            ) : (
              <span className={quotaExceeded ? 'text-red-700 font-semibold' : ''}>
                {planConfig.name} · {lookupCount}/{lookupLimit} used · {remainingLookups} left
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <label htmlFor="bin-input" className="sr-only">
              6 to 8 digit BIN or IIN prefix
            </label>
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="bin-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Enter 6–8 digit prefix (e.g. 424242 or 45717360)"
              className="w-full h-11 pl-10 pr-24 bg-white border border-slate-300 rounded-md font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 transition-colors"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-500 tabular-nums pointer-events-none">
              {query.length}/8 digits
            </span>
          </div>

          <button
            type="submit"
            disabled={loading || quotaExceeded}
            className="h-11 px-5 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-600 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
          >
            {loading ? 'Resolving...' : quotaExceeded ? 'Limit Reached' : 'Lookup Metadata'}
          </button>
        </form>

        {quotaExceeded && (
          <div
            role="alert"
            className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-amber-950"
          >
            <span>
              You have used all {lookupLimit} BIN lookups included in your {planConfig.name} plan.
              Upgrade to continue resolving prefixes.
            </span>
            <button
              type="button"
              onClick={onOpenPlans}
              className="font-semibold text-blue-800 hover:text-blue-950 underline whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
            >
              Upgrade Plan
            </button>
          </div>
        )}

        {/* Quick-fill standard prefixes */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 mr-1">Standard test prefixes:</span>
          {SAMPLE_PREFIXES.map((sample) => (
            <button
              key={sample.bin}
              type="button"
              disabled={quotaExceeded}
              onClick={() => {
                onQueryChange(sample.bin);
                void onLookup(sample.bin);
              }}
              className={`px-2.5 py-1.5 text-xs rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                query === sample.bin
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <span className="font-mono font-medium">{sample.bin}</span>
              <span className="mx-1.5 opacity-50">·</span>
              <span>{sample.label}</span>
            </button>
          ))}
        </div>

        {/* Notices */}
        {truncationNotice && (
          <div
            role="status"
            className="mt-4 flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900"
          >
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{truncationNotice}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-900"
          >
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Loading Skeleton */}
      {loading && (
        <section
          aria-label="Loading metadata"
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-6"
        >
          <div className="h-6 w-48 bg-slate-100 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-4/6 bg-slate-100 rounded animate-pulse" />
            </div>
            <div className="space-y-3">
              <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-4/6 bg-slate-100 rounded animate-pulse" />
            </div>
          </div>
        </section>
      )}

      {/* Empty State */}
      {!loading && !result && !error && (
        <section className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <p className="text-sm font-medium text-slate-900">No IIN prefix queried yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Enter a 6 to 8 digit BIN above or select one of the standard payment gateway test
            prefixes to inspect network, bank, and ISO/IEC 7812 metadata.
          </p>
        </section>
      )}

      {/* Result State */}
      {!loading && result && (
        <div className="space-y-6">
          {/* Primary Summary & ISO 7812 Structure */}
          <section className="bg-white border border-slate-200 rounded-lg">
            <div className="p-6 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
                  <span>{formatSourceLabel(result.source)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{result.cached ? 'Cached response' : 'Live resolution'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {new Date(result.checkedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-2xl font-semibold text-slate-900 font-mono tabular-nums tracking-tight">
                    {result.bin}
                  </h2>
                  <span className="text-base font-medium text-slate-700">
                    {result.scheme ?? result.iso7812.detectedScheme}
                    {result.brand ? ` · ${result.brand}` : ''}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowRawJson((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{showRawJson ? 'Hide JSON' : 'Inspect JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyJson()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedJson ? (
                    <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
            </div>

            {result.registryNote && (
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-start gap-2.5 text-xs text-slate-700">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{result.registryNote}</span>
              </div>
            )}

            {/* ISO/IEC 7812 Digit Slot Diagram */}
            <div className="p-6 border-b border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <h3 className="text-xs font-semibold text-slate-700 tracking-wide">
                  ISO/IEC 7812 Prefix Anatomy ({result.iso7812.iinLength}-Digit IIN)
                </h3>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  Expected PAN length: {result.iso7812.expectedPanLengths.join(' / ')} digits
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
                {iinDigits.map((digit, index) => (
                  <div
                    key={`${digit}-${index}`}
                    className={`w-9 h-10 flex flex-col items-center justify-center rounded border text-sm font-semibold ${
                      index === 0
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                    title={
                      index === 0
                        ? `MII Digit ${digit}: ${result.iso7812.miiCategory}`
                        : `Issuer Identifier Digit ${index + 1}`
                    }
                  >
                    <span>{digit}</span>
                  </div>
                ))}

                {Array.from({ length: Math.min(maskedTailCount, 11) }).map((_, idx) => (
                  <div
                    key={`mask-${idx}`}
                    aria-hidden="true"
                    className="w-7 h-10 flex items-center justify-center rounded border border-dashed border-slate-200 bg-white text-slate-300 text-xs"
                    title="Unassigned account / check digit position (not queried)"
                  >
                    •
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
                <span>
                  <strong className="font-medium text-slate-900">Digit 1 (MII):</strong>{' '}
                  {result.iso7812.miiDigit} — {result.iso7812.miiCategory}
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  |
                </span>
                <span>
                  <strong className="font-medium text-slate-900">Digits 2–{result.iso7812.iinLength}:</strong>{' '}
                  Issuer Identifier (<span className="font-mono">{result.iso7812.issuerIdentifier}</span>)
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  |
                </span>
                <span>
                  <strong className="font-medium text-slate-900">Rule:</strong>{' '}
                  {result.iso7812.prefixRule}
                </span>
              </div>
            </div>

            {/* Structured Metadata Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              {/* Left Column: Scheme & Card Classification */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  <span>Scheme &amp; Product Classification</span>
                </h3>
                <dl className="divide-y divide-slate-100 text-sm">
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Card Network / Scheme</dt>
                    <dd className="font-medium text-slate-900 text-right">
                      {result.scheme ?? 'Unknown'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Product Tier / Brand</dt>
                    <dd className="font-medium text-slate-900 text-right">
                      {result.brand ?? 'Not specified'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Funding Type</dt>
                    <dd className="font-medium text-slate-900 text-right">
                      {formatFundingLabel(result.type)}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Prepaid Indicator</dt>
                    <dd className="font-medium text-slate-900 text-right">
                      {result.prepaid === null
                        ? 'Unspecified'
                        : result.prepaid
                          ? 'Yes (Prepaid)'
                          : 'No'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">PAN Length &amp; Luhn</dt>
                    <dd className="font-mono text-slate-900 text-right tabular-nums">
                      {result.numberLength ?? result.iso7812.expectedPanLengths[0]} digits ·{' '}
                      {result.luhn ?? result.iso7812.luhnRequired ? 'Luhn valid' : 'No Luhn'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Right Column: Issuing Institution & Jurisdiction */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  <span>Issuing Institution &amp; Jurisdiction</span>
                </h3>
                <dl className="divide-y divide-slate-100 text-sm">
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Issuing Bank</dt>
                    <dd className="font-medium text-slate-900 text-right">
                      {result.bank.name ?? 'Not listed in public registry'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Country</dt>
                    <dd className="font-medium text-slate-900 text-right flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      <span>
                        {result.country.name
                          ? `${result.country.name}${
                              result.country.alpha2 ? ` (${result.country.alpha2})` : ''
                            }`
                          : 'Not listed'}
                      </span>
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Settlement Currency</dt>
                    <dd className="font-mono text-slate-900 text-right">
                      {result.country.currency ?? '—'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Issuer City</dt>
                    <dd className="text-slate-900 text-right">{result.bank.city ?? '—'}</dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Issuer Contact / Domain</dt>
                    <dd className="text-slate-900 text-right truncate max-w-[240px]">
                      {result.bank.url || result.bank.phone
                        ? [result.bank.url, result.bank.phone].filter(Boolean).join(' · ')
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          {/* Issuer Routing & Risk Signals (Medium / Pro / Business) */}
          {planConfig.hasRoutingSignals ? (
            <section className="bg-white border border-slate-200 rounded-lg p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Issuer Routing &amp; Compliance Signals
                </h3>
                <span className="text-xs text-blue-700 font-medium">
                  {planConfig.name} Plan Signal Set
                </span>
              </div>
              <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-100 text-sm">
                <div className="pt-2">
                  <dt className="text-xs text-slate-500">Product Segment</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {result.brand &&
                    /corporate|business|commercial|fleet|purchasing/i.test(result.brand)
                      ? 'Commercial / Corporate'
                      : result.brand
                        ? 'Consumer Retail'
                        : 'Standard Unclassified'}
                  </dd>
                </div>
                <div className="pt-2">
                  <dt className="text-xs text-slate-500">8-Digit IIN Readiness</dt>
                  <dd className="mt-1 font-medium text-slate-900 font-mono tabular-nums">
                    {result.iso7812.iinLength === 8
                      ? '8-Digit Extended IIN'
                      : `${result.iso7812.iinLength}-Digit Legacy Prefix`}
                  </dd>
                </div>
                <div className="pt-2">
                  <dt className="text-xs text-slate-500">Checksum Enforcement</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {result.luhn ?? result.iso7812.luhnRequired
                      ? 'ISO Mod-10 (Luhn) Required'
                      : 'Network Exempt / Custom'}
                  </dd>
                </div>
                <div className="pt-2">
                  <dt className="text-xs text-slate-500">Jurisdiction &amp; Settlement</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {result.country.alpha2
                      ? `${result.country.alpha2}${
                          result.country.currency ? ` · ${result.country.currency} Settlement` : ''
                        }`
                      : 'Jurisdiction Unresolved'}
                  </dd>
                </div>
              </dl>
            </section>
          ) : (
            <section className="bg-white border border-slate-200 rounded-lg px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-900">
                  Issuer Routing &amp; Commercial Signals
                </span>
                <span className="mx-2 text-slate-300" aria-hidden="true">
                  ·
                </span>
                <span>
                  Unlock commercial vs. consumer segmentation and 8-digit readiness signals starting
                  on the Medium plan ($100/mo).
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenPlans}
                className="text-xs font-medium text-blue-700 hover:text-blue-900 underline whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
              >
                View Plans
              </button>
            </section>
          )}

          {/* Raw JSON Drawer */}
          {showRawJson && (
            <section className="bg-slate-900 text-slate-100 rounded-lg border border-slate-800 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>Normalized JSON Payload</span>
                <span className="font-mono">GET /api/bin/{result.bin}</span>
              </div>
              <pre className="p-4 text-xs font-mono overflow-x-auto leading-relaxed">
                {JSON.stringify(result, null, 2)}
              </pre>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
