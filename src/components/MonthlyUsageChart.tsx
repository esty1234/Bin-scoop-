import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BinLookupResult, PlanTier } from '../types/bin.ts';
import { PLAN_CONFIGS } from '../lib/plans.ts';

interface MonthlyUsageChartProps {
  history: BinLookupResult[];
  currentPlan: PlanTier | null;
  onNavigateToLookup: () => void;
}

interface MonthlyPoint {
  monthKey: string;
  label: string;
  lookups: number;
  uniqueBins: number;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: '2-digit',
});

function toMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function MonthlyUsageChart({
  history,
  currentPlan,
  onNavigateToLookup,
}: MonthlyUsageChartProps) {
  const [chartMode, setChartMode] = useState<'area' | 'bar'>('area');
  const activeConfig = currentPlan ? PLAN_CONFIGS[currentPlan] : null;

  const { series, currentMonthCount, uniqueTotal } = useMemo(() => {
    const byMonth = new Map<string, { count: number; bins: Set<string> }>();
    const allBins = new Set<string>();

    for (const entry of history) {
      const parsedDate = new Date(entry.checkedAt);
      if (Number.isNaN(parsedDate.getTime())) continue;
      const key = toMonthKey(parsedDate);
      const bucket = byMonth.get(key) ?? { count: 0, bins: new Set<string>() };
      bucket.count += 1;
      bucket.bins.add(entry.bin);
      byMonth.set(key, bucket);
      allBins.add(entry.bin);
    }

    // Build a 6-month window ending with the current calendar month,
    // plus any older months present in stored history.
    const now = new Date();
    const keys = new Set<string>();
    for (let offset = 5; offset >= 0; offset -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      keys.add(toMonthKey(d));
    }
    for (const k of byMonth.keys()) {
      keys.add(k);
    }

    const sortedKeys = Array.from(keys).sort();
    const points: MonthlyPoint[] = sortedKeys.map((key) => {
      const [yearStr, monthStr] = key.split('-');
      const d = new Date(Number(yearStr), Number(monthStr) - 1, 1);
      const bucket = byMonth.get(key);
      return {
        monthKey: key,
        label: MONTH_FORMATTER.format(d),
        lookups: bucket ? bucket.count : 0,
        uniqueBins: bucket ? bucket.bins.size : 0,
      };
    });

    const currentKey = toMonthKey(now);
    const currentBucket = byMonth.get(currentKey);

    return {
      series: points,
      currentMonthCount: currentBucket ? currentBucket.count : 0,
      uniqueTotal: allBins.size,
    };
  }, [history]);

  const maxObserved = useMemo(
    () => Math.max(1, ...series.map((p) => p.lookups)),
    [series],
  );

  const yDomainMax = useMemo(() => {
    if (activeConfig && activeConfig.lookupLimit !== null) {
      return Math.max(maxObserved + 2, activeConfig.lookupLimit + 2);
    }
    return Math.max(5, maxObserved + 2);
  }, [activeConfig, maxObserved]);

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Monthly BIN Lookup Usage Trends
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
            <span>Recorded: {history.length}</span>
            <span aria-hidden="true">·</span>
            <span>Unique prefixes: {uniqueTotal}</span>
            <span aria-hidden="true">·</span>
            <span>This month: {currentMonthCount}</span>
            {activeConfig && activeConfig.lookupLimit !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span>Plan cap: {activeConfig.lookupLimit}</span>
              </>
            )}
          </div>
        </div>

        <div
          role="group"
          aria-label="Chart visualization type"
          className="inline-flex items-center p-1 bg-slate-100 rounded-md self-start sm:self-auto shrink-0"
        >
          <button
            type="button"
            onClick={() => setChartMode('area')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              chartMode === 'area'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Trend
          </button>
          <button
            type="button"
            onClick={() => setChartMode('bar')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              chartMode === 'bar'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Monthly Bars
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="h-60 border border-dashed border-slate-200 rounded-md flex flex-col items-center justify-center text-center px-6">
          <p className="text-sm font-medium text-slate-900">No lookup history recorded yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            Monthly BIN lookup volume will populate here automatically as you run queries in
            Single Lookup or Bulk Lookup.
          </p>
          <button
            type="button"
            onClick={onNavigateToLookup}
            className="mt-4 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Run First Lookup
          </button>
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'area' ? (
              <AreaChart data={series} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="iinLookupFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#64748B' }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, yDomainMax]}
                  tick={{ fontSize: 12, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '6px',
                    fontSize: '12px',
                    boxShadow: 'none',
                  }}
                  formatter={(value, name) => [
                    value ?? 0,
                    name === 'lookups' ? 'Total Lookups' : 'Unique BINs',
                  ]}
                />
                {activeConfig && activeConfig.lookupLimit !== null && (
                  <ReferenceLine
                    y={activeConfig.lookupLimit}
                    stroke="#D97706"
                    strokeDasharray="4 4"
                    label={{
                      value: `${activeConfig.name} Cap (${activeConfig.lookupLimit})`,
                      position: 'insideTopRight',
                      fill: '#B45309',
                      fontSize: 11,
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="lookups"
                  stroke="#1D4ED8"
                  strokeWidth={2}
                  fill="url(#iinLookupFill)"
                  activeDot={{ r: 4, fill: '#1D4ED8' }}
                />
                <Area
                  type="monotone"
                  dataKey="uniqueBins"
                  stroke="#0F172A"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill="none"
                  activeDot={{ r: 3.5, fill: '#0F172A' }}
                />
              </AreaChart>
            ) : (
              <BarChart data={series} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#64748B' }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, yDomainMax]}
                  tick={{ fontSize: 12, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '6px',
                    fontSize: '12px',
                    boxShadow: 'none',
                  }}
                  formatter={(value, name) => [
                    value ?? 0,
                    name === 'lookups' ? 'Total Lookups' : 'Unique BINs',
                  ]}
                />
                {activeConfig && activeConfig.lookupLimit !== null && (
                  <ReferenceLine
                    y={activeConfig.lookupLimit}
                    stroke="#D97706"
                    strokeDasharray="4 4"
                    label={{
                      value: `${activeConfig.name} Cap (${activeConfig.lookupLimit})`,
                      position: 'insideTopRight',
                      fill: '#B45309',
                      fontSize: 11,
                    }}
                  />
                )}
                <Bar dataKey="lookups" fill="#1D4ED8" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="uniqueBins" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
