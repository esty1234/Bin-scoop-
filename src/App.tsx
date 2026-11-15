import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Clock,
  CreditCard,
  Download,
  Layers,
  Menu,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import BatchScreeningView from './components/BatchScreeningView.tsx';
import HistoryView from './components/HistoryView.tsx';
import IsoReferenceView from './components/IsoReferenceView.tsx';
import PlansView from './components/PlansView.tsx';
import SingleLookupView from './components/SingleLookupView.tsx';
import { PLAN_CONFIGS } from './lib/plans.ts';
import type { BinLookupResult, PaidEntitlement, PlanTier } from './types/bin.ts';

type ActiveTab = 'lookup' | 'batch' | 'history' | 'reference' | 'plans';

const HISTORY_STORAGE_KEY = 'iinscope_session_history_v1';
const ENTITLEMENT_STORAGE_KEY = 'iinscope_btc_entitlement_v1';
const USAGE_STORAGE_KEY = 'iinscope_lookup_usage_v1';

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  breadcrumb: string;
  icon: typeof Search;
}> = [
  { id: 'plans', label: 'Plans & Quotas', breadcrumb: 'Plans & Quotas', icon: CreditCard },
  { id: 'lookup', label: 'Single Lookup', breadcrumb: 'Single Lookup', icon: Search },
  { id: 'batch', label: 'Bulk Lookup', breadcrumb: 'Bulk Lookup', icon: Layers },
  { id: 'history', label: 'Session History', breadcrumb: 'Session History', icon: Clock },
  { id: 'reference', label: 'ISO 7812 Reference', breadcrumb: 'ISO 7812 Reference', icon: BookOpen },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('plans');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [query, setQuery] = useState('424242');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncationNotice, setTruncationNotice] = useState<string | null>(null);
  const [result, setResult] = useState<BinLookupResult | null>(null);

  const [history, setHistory] = useState<BinLookupResult[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved) as BinLookupResult[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [entitlement, setEntitlement] = useState<PaidEntitlement | null>(() => {
    try {
      const saved = localStorage.getItem(ENTITLEMENT_STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as PaidEntitlement;
      return parsed?.receiptToken && parsed?.plan ? parsed : null;
    } catch {
      return null;
    }
  });

  const [lookupCount, setLookupCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(USAGE_STORAGE_KEY);
      const parsed = saved ? Number.parseInt(saved, 10) : 0;
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch {
      return 0;
    }
  });

  const currentPlan: PlanTier | null = entitlement ? entitlement.plan : null;
  const planConfig = currentPlan ? PLAN_CONFIGS[currentPlan] : null;
  const historyLimit = planConfig ? planConfig.historyLimit : 50;

  useEffect(() => {
    try {
      if (entitlement) {
        localStorage.setItem(ENTITLEMENT_STORAGE_KEY, JSON.stringify(entitlement));
      } else {
        localStorage.removeItem(ENTITLEMENT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [entitlement]);

  useEffect(() => {
    try {
      localStorage.setItem(USAGE_STORAGE_KEY, String(lookupCount));
    } catch {
      // Ignore storage errors
    }
  }, [lookupCount]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, historyLimit)));
    } catch {
      // Ignore storage quota errors
    }
  }, [history, historyLimit]);

  const appendToHistory = useCallback(
    (items: BinLookupResult[]) => {
      setHistory((prev) => {
        const next = [...items.reverse(), ...prev];
        const seen = new Set<string>();
        const deduped: BinLookupResult[] = [];
        for (const entry of next) {
          const key = `${entry.bin}-${entry.checkedAt}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(entry);
          }
        }
        return deduped.slice(0, historyLimit);
      });
    },
    [historyLimit],
  );

  const handleQueryChange = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length > 8) {
      setQuery(digitsOnly.slice(0, 8));
      setTruncationNotice(
        'Input truncated to the first 8 digits (IIN/BIN prefix). Full card numbers are never submitted or stored.',
      );
    } else {
      setQuery(digitsOnly);
      setTruncationNotice(null);
    }
    setError(null);
  };

  const handleLookup = useCallback(
    async (binOverride?: string) => {
      if (!entitlement || !planConfig) {
        setError('Payment required. Complete BTC payment for a plan before looking up BINs.');
        return;
      }

      const target = (binOverride ?? query).replace(/\D/g, '').slice(0, 8);
      if (target.length < 6) {
        setError('Enter at least 6 digits (up to 8 digits) to perform an authorized IIN lookup.');
        return;
      }

      if (planConfig.lookupLimit !== null && lookupCount >= planConfig.lookupLimit) {
        setError(
          `${planConfig.name} plan limit reached (${planConfig.lookupLimit}/${planConfig.lookupLimit} BIN lookups used). Upgrade your plan to continue.`,
        );
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/bin/${encodeURIComponent(target)}`, {
          headers: {
            'x-iinscope-receipt': entitlement.receiptToken,
          },
        });
        const payload = (await res.json()) as BinLookupResult & { error?: string };
        if (res.status === 402) {
          setEntitlement(null);
          setError(payload.error ?? 'Payment verification required before looking up BINs.');
          return;
        }
        if (!res.ok) {
          setError(payload.error ?? 'Failed to retrieve BIN metadata.');
          return;
        }
        setResult(payload);
        appendToHistory([payload]);
        setLookupCount((prev) => prev + 1);
      } catch {
        setError('Unable to reach the metadata lookup service. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [appendToHistory, entitlement, lookupCount, planConfig, query],
  );

  const handleInspectBin = (entry: BinLookupResult) => {
    setQuery(entry.bin);
    setResult(entry);
    setError(null);
    setTruncationNotice(null);
    setActiveTab('lookup');
    setMobileMenuOpen(false);
  };

  const handleDownloadResultJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `iin-${result.bin}-metadata.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200 shrink-0">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('plans');
            setMobileMenuOpen(false);
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          IINScope
        </a>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Primary" className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-blue-50 text-blue-800'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 ${isActive ? 'text-blue-700' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </span>
              {item.id === 'history' && history.length > 0 && (
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  {history.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div className="flex items-center justify-between px-1 text-xs">
          <span className="text-slate-500">
            Workspace ·{' '}
            <strong className="font-semibold text-slate-900">
              {planConfig ? `${planConfig.name} ($${planConfig.monthlyPrice})` : 'Unpaid (Locked)'}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => {
              setActiveTab('plans');
              setMobileMenuOpen(false);
            }}
            className="font-medium text-blue-700 hover:text-blue-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            {planConfig ? 'Manage' : 'Pay Plan'}
          </button>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
            <span>PCI-DSS Safe Boundary</span>
          </div>
          <p className="leading-relaxed">
            Queries are strictly limited to 6–8 digit IIN prefixes. Full PANs, CVVs, and holder
            records are never accepted or returned.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-50 w-64 max-w-[80vw] h-full">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary action on right */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-1.5 -ml-1.5 text-slate-600 hover:text-slate-900 rounded-md cursor-pointer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-500 whitespace-nowrap">Registry</span>
              <span className="text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-medium text-slate-900 truncate">{currentNav.breadcrumb}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeTab === 'lookup' && result ? (
              <button
                type="button"
                onClick={handleDownloadResultJson}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Export JSON</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('lookup')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New Lookup</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-5xl w-full mx-auto">
          {activeTab === 'lookup' && (
            <SingleLookupView
              query={query}
              onQueryChange={handleQueryChange}
              onLookup={(binOverride) => handleLookup(binOverride)}
              loading={loading}
              error={error}
              truncationNotice={truncationNotice}
              result={result}
              currentPlan={currentPlan}
              lookupCount={lookupCount}
              onOpenPlans={() => setActiveTab('plans')}
            />
          )}

          {activeTab === 'batch' && (
            <BatchScreeningView
              currentPlan={currentPlan}
              receiptToken={entitlement?.receiptToken ?? null}
              onInspectBin={handleInspectBin}
              onBatchComplete={(results) => appendToHistory(results)}
              onOpenPlans={() => setActiveTab('plans')}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              history={history}
              onInspectBin={handleInspectBin}
              onClearHistory={() => setHistory([])}
              onGoToLookup={() => setActiveTab('lookup')}
            />
          )}

          {activeTab === 'reference' && <IsoReferenceView />}

          {activeTab === 'plans' && (
            <PlansView
              entitlement={entitlement}
              lookupCount={lookupCount}
              history={history}
              onEntitlementVerified={(verified) => {
                setEntitlement(verified);
                setLookupCount(0);
              }}
              onNavigateToLookup={() => setActiveTab('lookup')}
              onNavigateToBatch={() => setActiveTab('batch')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
