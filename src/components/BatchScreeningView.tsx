import { useMemo, useState } from 'react';
import { AlertCircle, Download, Lock, Play, Search } from 'lucide-react';
import { PLAN_CONFIGS } from '../lib/plans.ts';
import type { BatchLookupResponse, BinLookupResult, PlanTier } from '../types/bin.ts';

interface BatchScreeningViewProps {
  currentPlan: PlanTier | null;
  receiptToken: string | null;
  onInspectBin: (result: BinLookupResult) => void;
  onBatchComplete: (results: BinLookupResult[]) => void;
  onOpenPlans: () => void;
}

const SAMPLE_BATCH = ['424242', '400000', '555555', '222300', '378282', '601111', '353011'].join(
  '\n',
);

export default function BatchScreeningView({
  currentPlan,
  receiptToken,
  onInspectBin,
  onBatchComplete,
  onOpenPlans,
}: BatchScreeningViewProps) {
  const planConfig = currentPlan ? PLAN_CONFIGS[currentPlan] : null;
  const maxBatch = planConfig ? planConfig.batchLimit : 0;

  const [rawText, setRawText] = useState(SAMPLE_BATCH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchData, setBatchData] = useState<BatchLookupResponse | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'debit' | 'unknown'>('all');

  const parsedCandidates = useMemo(() => {
    return rawText
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }, [rawText]);

  const filteredItems = useMemo(() => {
    if (!batchData) return [];
    const term = searchFilter.trim().toLowerCase();
    return batchData.items.filter((item) => {
      if (typeFilter !== 'all') {
        if (!item.result) return false;
        if (item.result.type !== typeFilter) return false;
      }
      if (!term) return true;
      const haystack = [
        item.input,
        item.result?.scheme ?? '',
        item.result?.bank.name ?? '',
        item.result?.country.name ?? '',
        item.result?.country.alpha2 ?? '',
        item.error ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [batchData, searchFilter, typeFilter]);

  if (!planConfig || !planConfig.bulkEnabled) {
    return (
      <section className="bg-white border border-slate-200 rounded-lg p-8">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-2">
            <Lock className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Business Plan Feature</span>
            <span aria-hidden="true">·</span>
            <span>
              {planConfig
                ? `Current Plan: ${planConfig.name} ($${planConfig.monthlyPrice}/mo)`
                : 'No Active Paid Plan'}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            {planConfig
              ? 'Bulk BIN Lookup Requires the Business Plan'
              : 'Pay for the Business Plan Before Running Bulk Lookups'}
          </h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            {planConfig ? (
              <>
                Your workspace is currently on the <strong>{planConfig.name}</strong> plan, which
                supports single BIN prefix lookups (
                {planConfig.lookupLimit === null
                  ? 'unlimited'
                  : `up to ${planConfig.lookupLimit} lookups`}
                ). Upgrade to the <strong>Business ($300/mo)</strong> plan via BTC to screen up to
                500 BIN prefixes in a single batch with audit-enriched CSV export.
              </>
            ) : (
              <>
                An active paid plan is required before looking up BINs. Pay for the{' '}
                <strong>Business ($300/mo)</strong> plan with Bitcoin (BTC) to unlock Bulk BIN
                Lookup (up to 500 prefixes per batch) and unlimited single lookups.
              </>
            )}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenPlans}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Pay Business Plan ($300/mo) with BTC
            </button>
          </div>
        </div>
      </section>
    );
  }

  const handleRunBatch = async () => {
    setError(null);
    if (!receiptToken) {
      setError('Paid Business plan entitlement is required.');
      return;
    }
    if (parsedCandidates.length === 0) {
      setError('Enter at least one 6–8 digit IIN/BIN prefix to screen.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/bin/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-iinscope-receipt': receiptToken,
        },
        body: JSON.stringify({
          bins: parsedCandidates.slice(0, maxBatch),
          plan: currentPlan,
        }),
      });

      const payload = (await response.json()) as BatchLookupResponse & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? 'Bulk BIN lookup failed.');
        return;
      }

      setBatchData(payload);
      const validResults = payload.items
        .map((i) => i.result)
        .filter((r): r is BinLookupResult => r !== null);
      if (validResults.length > 0) {
        onBatchComplete(validResults);
      }
    } catch {
      setError('Network error while contacting BIN metadata service.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!batchData) return;
    const header = [
      'Input',
      'Status',
      'Scheme',
      'Brand',
      'FundingType',
      'Prepaid',
      'IssuingBank',
      'Country',
      'CountryCode',
      'Currency',
      'Source',
      'IINLength',
      'MIICategory',
      'ExpectedPANLengths',
      'LuhnRequired',
    ];
    const rows = batchData.items.map((item) => {
      const r = item.result;
      const cells = [
        item.input,
        item.valid ? 'Valid' : item.error ?? 'Invalid',
        r?.scheme ?? '',
        r?.brand ?? '',
        r?.type ?? '',
        r?.prepaid === null || r?.prepaid === undefined ? '' : r.prepaid ? 'Yes' : 'No',
        r?.bank.name ?? '',
        r?.country.name ?? '',
        r?.country.alpha2 ?? '',
        r?.country.currency ?? '',
        r?.source ?? '',
        r ? `${r.iso7812.iinLength}` : '',
        r?.iso7812.miiCategory ?? '',
        r ? r.iso7812.expectedPanLengths.join('/') : '',
        r ? (r.iso7812.luhnRequired ? 'Yes' : 'No') : '',
      ];
      return cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `iinscope-bulk-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              Bulk BIN Lookup
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Screen up to {maxBatch} IIN/BIN prefixes (6–8 digits each) separated by newlines or
              commas. Entries exceeding 8 digits are rejected for PCI-DSS compliance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRawText(SAMPLE_BATCH)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Load Sandbox Set
          </button>
        </div>

        <label htmlFor="batch-input" className="sr-only">
          Bulk IIN/BIN prefixes
        </label>
        <textarea
          id="batch-input"
          rows={5}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="424242&#10;555555&#10;378282"
          className="w-full p-3 bg-white border border-slate-300 rounded-md font-mono text-sm text-slate-900 focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15"
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {Math.min(parsedCandidates.length, maxBatch)} / {maxBatch} prefixes queued
            {parsedCandidates.length > maxBatch ? ` (capped at ${maxBatch} per bulk run)` : ''}
          </span>

          <div className="flex items-center gap-2">
            {batchData && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Export Audit CSV</span>
              </button>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleRunBatch()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{loading ? 'Screening...' : 'Run Bulk Lookup'}</span>
            </button>
          </div>
        </div>

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

      {/* Results Table */}
      {batchData && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-mono tabular-nums">
              <span className="font-semibold text-slate-900 font-sans">
                Bulk Lookup Results
              </span>
              <span aria-hidden="true">·</span>
              <span>{batchData.total} total</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700">{batchData.validCount} valid</span>
              {batchData.invalidCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-red-700">{batchData.invalidCount} rejected</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter scheme, bank, country..."
                  className="h-8 pl-8 pr-3 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-700"
                />
              </div>

              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                {(['all', 'credit', 'debit', 'unknown'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors capitalize whitespace-nowrap shrink-0 cursor-pointer ${
                      typeFilter === t
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t === 'unknown' ? 'Other' : t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-4">IIN Prefix</th>
                  <th className="py-2.5 px-4">Network / Scheme</th>
                  <th className="py-2.5 px-4">Funding</th>
                  <th className="py-2.5 px-4">Issuing Bank</th>
                  <th className="py-2.5 px-4">Country</th>
                  <th className="py-2.5 px-4 text-right">PAN Length</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item, idx) => {
                  const r = item.result;
                  return (
                    <tr
                      key={`${item.input}-${idx}`}
                      className="h-10 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2 px-4 font-mono text-xs font-medium text-slate-900 tabular-nums">
                        {item.input}
                      </td>
                      <td className="py-2 px-4 text-xs text-slate-800">
                        {item.valid && r ? (
                          r.scheme ?? r.iso7812.detectedScheme
                        ) : (
                          <span className="text-red-700 font-medium">
                            Rejected ({item.error})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-xs text-slate-700 capitalize">
                        {r ? r.type : '—'}
                      </td>
                      <td className="py-2 px-4 text-xs text-slate-700 max-w-[220px] truncate">
                        {r?.bank.name ?? '—'}
                      </td>
                      <td className="py-2 px-4 text-xs text-slate-700">
                        {r?.country.alpha2
                          ? `${r.country.alpha2}${r.country.currency ? ` · ${r.country.currency}` : ''}`
                          : r?.country.name ?? '—'}
                      </td>
                      <td className="py-2 px-4 text-xs font-mono text-slate-700 text-right tabular-nums">
                        {r ? `${r.numberLength ?? r.iso7812.expectedPanLengths[0]}` : '—'}
                      </td>
                      <td className="py-2 px-4 text-right">
                        {r ? (
                          <button
                            type="button"
                            onClick={() => onInspectBin(r)}
                            className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Inspect
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 px-4 text-center text-xs text-slate-500">
                      No screened prefixes match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
