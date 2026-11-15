import { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import type { BinLookupResult } from '../types/bin.ts';

interface HistoryViewProps {
  history: BinLookupResult[];
  onInspectBin: (result: BinLookupResult) => void;
  onClearHistory: () => void;
  onGoToLookup: () => void;
}

export default function HistoryView({
  history,
  onInspectBin,
  onClearHistory,
  onGoToLookup,
}: HistoryViewProps) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) =>
      [item.bin, item.scheme ?? '', item.bank.name ?? '', item.country.name ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [history, filter]);

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Session Audit History
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Recent 6–8 digit IIN lookups stored locally in your browser session. No full PANs are
            ever recorded.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {history.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white hover:bg-red-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear History</span>
            </button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm font-medium text-slate-900">No session lookups recorded</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Run a single BIN lookup or batch screen to populate your local audit log.
          </p>
          <button
            type="button"
            onClick={onGoToLookup}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Go to Single Lookup
          </button>
        </div>
      ) : (
        <>
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="relative max-w-xs w-full">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search history..."
                className="w-full h-8 pl-8 pr-3 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-700"
              />
            </div>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {filtered.length} entries
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-4">IIN Prefix</th>
                  <th className="py-2.5 px-4">Scheme</th>
                  <th className="py-2.5 px-4">Funding</th>
                  <th className="py-2.5 px-4">Issuing Bank</th>
                  <th className="py-2.5 px-4">Country</th>
                  <th className="py-2.5 px-4 text-right">Checked At</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item, idx) => (
                  <tr
                    key={`${item.bin}-${item.checkedAt}-${idx}`}
                    className="h-10 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-2 px-4 font-mono text-xs font-medium text-slate-900 tabular-nums">
                      {item.bin}
                    </td>
                    <td className="py-2 px-4 text-xs text-slate-800">
                      {item.scheme ?? item.iso7812.detectedScheme}
                    </td>
                    <td className="py-2 px-4 text-xs text-slate-700 capitalize">{item.type}</td>
                    <td className="py-2 px-4 text-xs text-slate-700 max-w-[220px] truncate">
                      {item.bank.name ?? '—'}
                    </td>
                    <td className="py-2 px-4 text-xs text-slate-700">
                      {item.country.alpha2 ?? item.country.name ?? '—'}
                    </td>
                    <td className="py-2 px-4 text-xs font-mono text-slate-500 text-right tabular-nums">
                      {new Date(item.checkedAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onInspectBin(item)}
                        className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
