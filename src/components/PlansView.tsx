import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Layers,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { BTC_RECEIVING_ADDRESS, PLAN_CONFIGS, PLAN_ORDER } from '../lib/plans.ts';
import type {
  BillingCycle,
  BinLookupResult,
  BtcQuoteResponse,
  PaidEntitlement,
  PlanTier,
} from '../types/bin.ts';
import MonthlyUsageChart from './MonthlyUsageChart.tsx';

interface PlansViewProps {
  entitlement: PaidEntitlement | null;
  lookupCount: number;
  history: BinLookupResult[];
  onEntitlementVerified: (entitlement: PaidEntitlement) => void;
  onNavigateToLookup: () => void;
  onNavigateToBatch: () => void;
}

const COMPARISON_ROWS: Array<{
  capability: string;
  values: Record<PlanTier, string>;
}> = [
  {
    capability: 'Monthly price',
    values: {
      basic: '$50 / mo',
      medium: '$100 / mo',
      pro: '$200 / mo',
      business: '$300 / mo',
    },
  },
  {
    capability: 'BIN lookup allowance',
    values: {
      basic: '10 BIN lookups',
      medium: '40 BIN lookups',
      pro: 'Unlimited lookups',
      business: 'Unlimited lookups',
    },
  },
  {
    capability: 'Bulk BIN lookup',
    values: {
      basic: 'Not included',
      medium: 'Not included',
      pro: 'Not included',
      business: 'Included (up to 500 / batch)',
    },
  },
  {
    capability: 'IIN / BIN prefix format',
    values: {
      basic: '6–8 digits (ISO 7812)',
      medium: '6–8 digits (ISO 7812)',
      pro: '6–8 digits (ISO 7812)',
      business: '6–8 digits (ISO 7812)',
    },
  },
  {
    capability: 'Session audit history retention',
    values: {
      basic: '50 entries',
      medium: '200 entries',
      pro: '500 entries',
      business: '2,000 entries',
    },
  },
  {
    capability: 'Issuer routing & risk signals',
    values: {
      basic: 'Not included',
      medium: 'Included',
      pro: 'Included',
      business: 'Included',
    },
  },
  {
    capability: 'Export formats',
    values: {
      basic: 'Standard JSON',
      medium: 'Standard JSON',
      pro: 'Standard JSON',
      business: 'Audit-enriched CSV & JSON',
    },
  },
];

export default function PlansView({
  entitlement,
  lookupCount,
  history,
  onEntitlementVerified,
  onNavigateToLookup,
  onNavigateToBatch,
}: PlansViewProps) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [checkoutPlan, setCheckoutPlan] = useState<PlanTier | null>(null);
  const [quote, setQuote] = useState<BtcQuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [txidInput, setTxidInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'address' | 'amount' | null>(null);

  const currentPlan = entitlement ? entitlement.plan : null;
  const activeConfig = currentPlan ? PLAN_CONFIGS[currentPlan] : null;

  const fetchBtcQuote = async (plan: PlanTier, cycle: BillingCycle) => {
    setCheckoutPlan(plan);
    setQuoteLoading(true);
    setQuoteError(null);
    setVerifyError(null);

    try {
      const res = await fetch(
        `/api/billing/quote?plan=${encodeURIComponent(plan)}&cycle=${encodeURIComponent(cycle)}`,
      );
      const payload = (await res.json()) as BtcQuoteResponse & { error?: string };
      if (!res.ok) {
        setQuoteError(payload.error ?? 'Unable to generate live BTC invoice quote.');
        setQuote(null);
        return;
      }
      setQuote(payload);
    } catch {
      setQuoteError('Network error while fetching live BTC/USD exchange rate.');
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleCycleChange = (nextCycle: BillingCycle) => {
    setBillingCycle(nextCycle);
    if (checkoutPlan) {
      void fetchBtcQuote(checkoutPlan, nextCycle);
    }
  };

  const handleCopy = async (text: string, field: 'address' | 'amount') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleVerifyPayment = async (useTxid: boolean) => {
    if (!quote) return;
    setVerifyError(null);
    if (useTxid && !txidInput.trim()) {
      setVerifyError('Paste your 64-character Bitcoin transaction ID (TXID) to verify.');
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch('/api/billing/verify-btc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: quote.plan,
          billingCycle: quote.billingCycle,
          expectedSats: quote.satoshis,
          txid: useTxid ? txidInput.trim() : undefined,
        }),
      });
      const payload = (await res.json()) as PaidEntitlement & { error?: string };
      if (!res.ok) {
        setVerifyError(payload.error ?? 'BTC payment verification did not match.');
        return;
      }

      onEntitlementVerified(payload);
      setCheckoutPlan(null);
      setQuote(null);
      setTxidInput('');
    } catch {
      setVerifyError('Network error while checking Bitcoin blockchain status.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Billing Cadence Selector */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
              {activeConfig && entitlement ? (
                <>
                  <span>
                    Active Plan · <strong className="text-slate-900">{activeConfig.name}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {activeConfig.lookupLimit === null
                      ? `${lookupCount} lookups used (Unlimited)`
                      : `${lookupCount} / ${activeConfig.lookupLimit} BIN lookups used`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">
                    TXID {entitlement.txid.slice(0, 10)}...
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 text-amber-800 font-medium">
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Payment Required Before Lookup</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Direct BTC settlement to Binance wallet</span>
                </>
              )}
            </div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight text-balance">
              Workspace Plans &amp; Bitcoin Checkout
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Select and pay for a plan in Bitcoin (BTC) before performing BIN lookups. Payments
              settle directly to the configured Binance BTC wallet address and unlock lookups
              automatically upon on-chain verification.
            </p>
          </div>

          <div
            role="group"
            aria-label="Billing cadence"
            className="inline-flex items-center p-1 bg-slate-100 rounded-md self-start md:self-auto shrink-0"
          >
            <button
              type="button"
              onClick={() => handleCycleChange('monthly')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => handleCycleChange('annual')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                billingCycle === 'annual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Annual · Save 20%
            </button>
          </div>
        </div>

        {entitlement && activeConfig && (
          <div
            role="status"
            className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-emerald-950"
          >
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <strong>{activeConfig.name} Plan</strong> verified via BTC (
                {(entitlement.paidSats / 100_000_000).toFixed(8)} BTC to{' '}
                <span className="font-mono">{entitlement.address}</span>). BIN lookups are unlocked.
              </span>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <button
                type="button"
                onClick={onNavigateToLookup}
                className="inline-flex items-center gap-1.5 font-medium text-emerald-900 hover:text-emerald-950 underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Open Single Lookup</span>
              </button>
              {activeConfig.bulkEnabled && (
                <button
                  type="button"
                  onClick={onNavigateToBatch}
                  className="inline-flex items-center gap-1.5 font-medium text-emerald-900 hover:text-emerald-950 underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open Bulk Lookup</span>
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Active BTC Checkout Invoice Panel */}
      {checkoutPlan && (
        <section className="bg-white border border-blue-700 rounded-lg p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <span className="text-xs font-medium text-blue-700">
                Bitcoin (BTC) Network Invoice · Direct Binance Wallet Settlement
              </span>
              <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
                Pay for {PLAN_CONFIGS[checkoutPlan].name} Plan (
                {billingCycle === 'annual'
                  ? `$${PLAN_CONFIGS[checkoutPlan].annualPrice * 12}/yr`
                  : `$${PLAN_CONFIGS[checkoutPlan].monthlyPrice}/mo`}
                )
              </h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void fetchBtcQuote(checkoutPlan, billingCycle)}
                disabled={quoteLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${quoteLoading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>Refresh Rate</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCheckoutPlan(null);
                  setQuote(null);
                  setQuoteError(null);
                  setVerifyError(null);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>

          {quoteLoading && (
            <div className="py-10 text-center text-xs text-slate-500">
              Fetching live BTC/USD spot rate...
            </div>
          )}

          {quoteError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-900"
            >
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{quoteError}</span>
            </div>
          )}

          {!quoteLoading && quote && (
            <div className="mt-5 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 items-start">
              {/* QR Code */}
              <div className="flex flex-col items-center p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <QRCodeSVG
                  value={quote.bip21Uri}
                  size={164}
                  bgColor="#F8FAFC"
                  fgColor="#0F172A"
                  level="M"
                />
                <span className="mt-2.5 text-[11px] font-mono text-slate-500 text-center">
                  Bitcoin Mainnet (BTC)
                </span>
              </div>

              {/* Payment Details & On-Chain Verification */}
              <div className="space-y-4 min-w-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
                    <div className="text-xs text-slate-500">Exact BTC Amount</div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-base font-semibold text-slate-900 tabular-nums">
                        {quote.btcAmount} BTC
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopy(quote.btcAmount, 'amount')}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedField === 'amount' ? (
                          <Check className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3 h-3" aria-hidden="true" />
                        )}
                        <span>{copiedField === 'amount' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
                      ${quote.usdAmount} USD · 1 BTC = ${quote.btcUsdRate.toLocaleString()} (
                      {quote.rateSource})
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
                    <div className="text-xs text-slate-500">Binance BTC Receiving Address</div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900 break-all">
                        {BTC_RECEIVING_ADDRESS}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopy(BTC_RECEIVING_ADDRESS, 'address')}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedField === 'address' ? (
                          <Check className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3 h-3" aria-hidden="true" />
                        )}
                        <span>{copiedField === 'address' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Send over Bitcoin (BTC) network only
                    </div>
                  </div>
                </div>

                {/* On-Chain Verification Form */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div>
                    <label
                      htmlFor="btc-txid-input"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Verify On-Chain Payment (Bitcoin Transaction ID / TXID)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        id="btc-txid-input"
                        type="text"
                        value={txidInput}
                        onChange={(e) => setTxidInput(e.target.value)}
                        placeholder="Paste 64-character BTC TXID after broadcasting..."
                        className="flex-1 h-10 px-3 bg-white border border-slate-300 rounded-md font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15"
                      />
                      <button
                        type="button"
                        disabled={verifying}
                        onClick={() => void handleVerifyPayment(true)}
                        className="h-10 px-4 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {verifying ? 'Checking Blockchain...' : 'Verify TXID'}
                      </button>
                      <button
                        type="button"
                        disabled={verifying}
                        onClick={() => void handleVerifyPayment(false)}
                        className="h-10 px-4 text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Scan Address
                      </button>
                    </div>
                  </div>

                  {verifyError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-900"
                    >
                      <AlertCircle
                        className="w-4 h-4 text-red-700 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>{verifyError}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 4-Tier Plan Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch">
        {PLAN_ORDER.map((planId) => {
          const plan = PLAN_CONFIGS[planId];
          const isActive = currentPlan === planId;
          const isSelectedForCheckout = checkoutPlan === planId;
          const displayPrice =
            billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;

          return (
            <div
              key={planId}
              className={`bg-white rounded-lg p-5 flex flex-col justify-between border ${
                isActive
                  ? 'border-emerald-700'
                  : isSelectedForCheckout
                    ? 'border-blue-700'
                    : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                  <span className="truncate">{plan.audience}</span>
                  {isActive && (
                    <span className="font-semibold text-emerald-700 whitespace-nowrap shrink-0">
                      Paid · Active
                    </span>
                  )}
                </div>

                <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                    ${displayPrice}
                  </span>
                  <span className="text-xs text-slate-500">
                    / month{billingCycle === 'annual' ? ' · billed yearly' : ''}
                  </span>
                </div>

                <p className="mt-3 text-xs text-slate-600 leading-relaxed">{plan.summary}</p>

                <ul className="mt-5 pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-700">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check
                        className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                          isActive ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                        aria-hidden="true"
                      />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100">
                {isActive ? (
                  <button
                    type="button"
                    disabled
                    className="w-full h-9 px-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md cursor-default whitespace-nowrap"
                  >
                    Active Paid Plan
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void fetchBtcQuote(planId, billingCycle)}
                    className={`w-full h-9 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      planId === 'pro' || planId === 'business'
                        ? 'text-white bg-blue-700 hover:bg-blue-800'
                        : 'text-slate-800 bg-white hover:bg-slate-50 border border-slate-300'
                    }`}
                  >
                    Pay ${billingCycle === 'annual' ? plan.annualPrice * 12 : plan.monthlyPrice} with
                    BTC
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Monthly BIN Lookup Usage Trends Chart */}
      <MonthlyUsageChart
        history={history}
        currentPlan={currentPlan}
        onNavigateToLookup={onNavigateToLookup}
      />

      {/* Comparison Matrix */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Plan Limits &amp; Capabilities</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-6">Capability</th>
                {PLAN_ORDER.map((id) => (
                  <th key={id} className="py-2.5 px-4">
                    {PLAN_CONFIGS[id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.capability} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-6 text-xs font-medium text-slate-900">
                    {row.capability}
                  </td>
                  {PLAN_ORDER.map((id) => (
                    <td
                      key={id}
                      className={`py-3 px-4 text-xs font-mono tabular-nums ${
                        currentPlan === id ? 'font-semibold text-emerald-800' : 'text-slate-600'
                      }`}
                    >
                      {row.values[id]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
