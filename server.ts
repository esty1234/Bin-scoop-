import crypto from 'node:crypto';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeIso7812, PUBLIC_SANDBOX_BINS } from './src/lib/iso7812.ts';
import {
  BTC_RECEIVING_ADDRESS,
  normalizePlanTier,
  PLAN_CONFIGS,
} from './src/lib/plans.ts';
import type {
  BatchItemResult,
  BatchLookupResponse,
  BillingCycle,
  BinLookupResult,
  BtcQuoteResponse,
  FundingType,
  PaidEntitlement,
  PlanTier,
} from './src/types/bin.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const CACHE_TTL_MS = 15 * 60 * 1000;
const RECEIPT_SECRET =
  process.env.RECEIPT_SIGNING_SECRET ?? crypto.randomBytes(32).toString('hex');

interface CacheEntry {
  expiresAt: number;
  data: BinLookupResult;
}

const lookupCache = new Map<string, CacheEntry>();
const usageByTxid = new Map<string, number>();

interface ReceiptPayload {
  plan: PlanTier;
  billingCycle: BillingCycle;
  txid: string;
  paidSats: number;
  verifiedAt: string;
}

function signReceipt(payload: ReceiptPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', RECEIPT_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyReceipt(token: unknown): ReceiptPayload | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', RECEIPT_SECRET)
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as ReceiptPayload;
    if (!parsed?.plan || !parsed?.txid) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchLiveBtcUsdRate(): Promise<{ rate: number; source: string }> {
  // 1. Coinbase spot
  try {
    const res = await fetchWithTimeout(
      'https://api.coinbase.com/v2/prices/BTC-USD/spot',
      { Accept: 'application/json' },
      4000,
    );
    if (res.ok) {
      const json = (await res.json()) as { data?: { amount?: string } };
      const rate = Number.parseFloat(json.data?.amount ?? '');
      if (Number.isFinite(rate) && rate > 1000) {
        return { rate, source: 'Coinbase Spot' };
      }
    }
  } catch {
    // try next source
  }

  // 2. CoinGecko simple price
  try {
    const res = await fetchWithTimeout(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { Accept: 'application/json' },
      4000,
    );
    if (res.ok) {
      const json = (await res.json()) as { bitcoin?: { usd?: number } };
      const rate = json.bitcoin?.usd ?? 0;
      if (Number.isFinite(rate) && rate > 1000) {
        return { rate, source: 'CoinGecko Spot' };
      }
    }
  } catch {
    // try next source
  }

  // 3. Mempool.space prices
  try {
    const res = await fetchWithTimeout(
      'https://mempool.space/api/v1/prices',
      { Accept: 'application/json' },
      4000,
    );
    if (res.ok) {
      const json = (await res.json()) as { USD?: number };
      const rate = json.USD ?? 0;
      if (Number.isFinite(rate) && rate > 1000) {
        return { rate, source: 'Mempool.space' };
      }
    }
  } catch {
    // exhausted
  }

  throw new Error('Unable to fetch live BTC/USD exchange rate.');
}

interface EsploraTxOutput {
  scriptpubkey_address?: string;
  value?: number;
}

interface EsploraTx {
  txid?: string;
  vout?: EsploraTxOutput[];
  status?: {
    confirmed?: boolean;
    block_time?: number;
  };
}

function sumPaidSatsToAddress(tx: EsploraTx, address: string): number {
  if (!Array.isArray(tx.vout)) return 0;
  let total = 0;
  for (const out of tx.vout) {
    if (out.scriptpubkey_address === address && typeof out.value === 'number') {
      total += out.value;
    }
  }
  return total;
}

async function fetchTxFromExplorer(txid: string): Promise<EsploraTx | null> {
  const explorers = [
    `https://mempool.space/api/tx/${txid}`,
    `https://blockstream.info/api/tx/${txid}`,
  ];
  for (const url of explorers) {
    try {
      const res = await fetchWithTimeout(url, { Accept: 'application/json' }, 5000);
      if (res.ok) {
        return (await res.json()) as EsploraTx;
      }
    } catch {
      // try next explorer
    }
  }
  return null;
}

async function fetchAddressTxsFromExplorer(address: string): Promise<EsploraTx[]> {
  const explorers = [
    `https://mempool.space/api/address/${address}/txs`,
    `https://blockstream.info/api/address/${address}/txs`,
  ];
  for (const url of explorers) {
    try {
      const res = await fetchWithTimeout(url, { Accept: 'application/json' }, 5000);
      if (res.ok) {
        const list = (await res.json()) as EsploraTx[];
        if (Array.isArray(list)) return list;
      }
    } catch {
      // try next explorer
    }
  }
  return [];
}

function normalizeFundingType(value: unknown): FundingType {
  if (typeof value !== 'string') return 'unknown';
  const v = value.trim().toLowerCase();
  if (v === 'debit') return 'debit';
  if (v === 'credit') return 'credit';
  if (v === 'charge') return 'charge';
  return 'unknown';
}

function titleCaseScheme(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const clean = value.trim().toLowerCase();
  if (clean === 'visa') return 'Visa';
  if (clean === 'mastercard') return 'Mastercard';
  if (clean === 'amex' || clean === 'american express') return 'American Express';
  if (clean === 'discover') return 'Discover';
  if (clean === 'jcb') return 'JCB';
  if (clean === 'unionpay') return 'UnionPay';
  if (clean === 'diners' || clean === 'diners club') return 'Diners Club International';
  if (clean === 'maestro') return 'Maestro';
  if (clean === 'mir') return 'Mir';
  if (clean === 'rupay') return 'RuPay';
  return value.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

interface BinlistApiResponse {
  number?: {
    length?: number;
    luhn?: boolean;
  };
  scheme?: string;
  type?: string;
  brand?: string;
  prepaid?: boolean;
  country?: {
    numeric?: string;
    alpha2?: string;
    name?: string;
    emoji?: string;
    currency?: string;
    latitude?: number;
    longitude?: number;
  };
  bank?: {
    name?: string;
    url?: string;
    phone?: string;
    city?: string;
  };
}

interface HandyApiResponse {
  Status?: string;
  Scheme?: string;
  Type?: string;
  Issuer?: string;
  CardTier?: string;
  Country?: {
    A2?: string;
    A3?: string;
    N3?: string;
    Name?: string;
    Cont?: string;
  };
  Luhn?: boolean;
}

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 4500,
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function resolveBinMetadata(bin: string): Promise<BinLookupResult> {
  const cached = lookupCache.get(bin);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.data,
      cached: true,
    };
  }

  const iso = analyzeIso7812(bin);
  const nowIso = new Date().toISOString();
  const sandboxMatch = PUBLIC_SANDBOX_BINS[bin.slice(0, 6)];

  let rateLimited = false;
  let upstreamError = false;

  // 1. Try binlist.net (supports 6-8 digit IIN prefixes)
  try {
    const res = await fetchWithTimeout(`https://lookup.binlist.net/${bin}`, {
      'Accept-Version': '3',
      Accept: 'application/json',
      'User-Agent': 'IINScope-Metadata-Tool/1.0',
    });

    if (res.ok) {
      const payload = (await res.json()) as BinlistApiResponse;
      const hasUsefulData =
        Boolean(payload.scheme) ||
        Boolean(payload.bank?.name) ||
        Boolean(payload.country?.name);

      if (hasUsefulData) {
        const result: BinLookupResult = {
          bin,
          normalizedBin: bin.slice(0, 8),
          scheme: titleCaseScheme(payload.scheme) ?? iso.detectedScheme,
          brand: payload.brand ?? null,
          type: normalizeFundingType(payload.type),
          prepaid: typeof payload.prepaid === 'boolean' ? payload.prepaid : null,
          numberLength:
            typeof payload.number?.length === 'number'
              ? payload.number.length
              : iso.expectedPanLengths[0] ?? null,
          luhn:
            typeof payload.number?.luhn === 'boolean'
              ? payload.number.luhn
              : iso.luhnRequired,
          bank: {
            name: payload.bank?.name ?? null,
            url: payload.bank?.url ?? null,
            phone: payload.bank?.phone ?? null,
            city: payload.bank?.city ?? null,
          },
          country: {
            numeric: payload.country?.numeric ?? null,
            alpha2: payload.country?.alpha2 ?? null,
            name: payload.country?.name ?? null,
            currency: payload.country?.currency ?? null,
            latitude:
              typeof payload.country?.latitude === 'number'
                ? payload.country.latitude
                : null,
            longitude:
              typeof payload.country?.longitude === 'number'
                ? payload.country.longitude
                : null,
          },
          iso7812: iso,
          source: 'binlist-registry',
          registryNote: sandboxMatch
            ? `Matches documented gateway sandbox prefix (${sandboxMatch.description}).`
            : null,
          cached: false,
          checkedAt: nowIso,
        };
        lookupCache.set(bin, { expiresAt: Date.now() + CACHE_TTL_MS, data: result });
        return result;
      }
    } else if (res.status === 429) {
      rateLimited = true;
    }
  } catch {
    upstreamError = true;
  }

  // 2. Try HandyAPI public BIN metadata endpoint (6-digit prefix)
  try {
    const prefix6 = bin.slice(0, 6);
    const res = await fetchWithTimeout(`https://data.handyapi.com/bin/${prefix6}`, {
      Accept: 'application/json',
      'User-Agent': 'IINScope-Metadata-Tool/1.0',
    });

    if (res.ok) {
      const payload = (await res.json()) as HandyApiResponse;
      if (payload.Status === 'SUCCESS') {
        const result: BinLookupResult = {
          bin,
          normalizedBin: bin.slice(0, 8),
          scheme: titleCaseScheme(payload.Scheme) ?? iso.detectedScheme,
          brand: payload.CardTier ?? null,
          type: normalizeFundingType(payload.Type),
          prepaid: null,
          numberLength: iso.expectedPanLengths[0] ?? null,
          luhn: typeof payload.Luhn === 'boolean' ? payload.Luhn : iso.luhnRequired,
          bank: {
            name: payload.Issuer && payload.Issuer.trim() ? payload.Issuer.trim() : null,
            url: null,
            phone: null,
            city: null,
          },
          country: {
            numeric: payload.Country?.N3 ?? null,
            alpha2: payload.Country?.A2 ?? null,
            name: payload.Country?.Name ?? null,
            currency: null,
            latitude: null,
            longitude: null,
          },
          iso7812: iso,
          source: 'handyapi-registry',
          registryNote:
            bin.length > 6
              ? 'Registry matched on 6-digit primary IIN prefix; full 8-digit expansion shown in ISO breakdown.'
              : null,
          cached: false,
          checkedAt: nowIso,
        };
        lookupCache.set(bin, { expiresAt: Date.now() + CACHE_TTL_MS, data: result });
        return result;
      }
    } else if (res.status === 429) {
      rateLimited = true;
    }
  } catch {
    upstreamError = true;
  }

  // 3. Documented payment gateway sandbox IIN fallback
  if (sandboxMatch) {
    const result: BinLookupResult = {
      bin,
      normalizedBin: bin.slice(0, 8),
      scheme: sandboxMatch.scheme,
      brand: sandboxMatch.brand,
      type: sandboxMatch.type,
      prepaid: sandboxMatch.prepaid,
      numberLength: sandboxMatch.numberLength,
      luhn: sandboxMatch.luhn,
      bank: sandboxMatch.bank,
      country: sandboxMatch.country,
      iso7812: iso,
      source: 'sandbox-reference',
      registryNote: `${sandboxMatch.description}. Public registry ${
        rateLimited ? 'rate-limited' : 'unavailable'
      }; served from documented sandbox specification.`,
      cached: false,
      checkedAt: nowIso,
    };
    lookupCache.set(bin, { expiresAt: Date.now() + CACHE_TTL_MS, data: result });
    return result;
  }

  // 4. Deterministic ISO/IEC 7812 structural analysis fallback
  const fallbackNote = rateLimited
    ? 'Public BIN registry rate limit reached; showing deterministic ISO/IEC 7812 prefix and MII metadata.'
    : upstreamError
      ? 'Public BIN registry unreachable; showing deterministic ISO/IEC 7812 prefix and MII metadata.'
      : 'No issuer bank record found in public registry; showing deterministic ISO/IEC 7812 prefix metadata.';

  const result: BinLookupResult = {
    bin,
    normalizedBin: bin.slice(0, 8),
    scheme: iso.detectedScheme,
    brand: null,
    type: 'unknown',
    prepaid: null,
    numberLength: iso.expectedPanLengths[0] ?? 16,
    luhn: iso.luhnRequired,
    bank: {
      name: null,
      url: null,
      phone: null,
      city: null,
    },
    country: {
      numeric: null,
      alpha2: null,
      name: null,
      currency: null,
      latitude: null,
      longitude: null,
    },
    iso7812: iso,
    source: 'iso7812-structural',
    registryNote: fallbackNote,
    cached: false,
    checkedAt: nowIso,
  };

  return result;
}

function validateBinParam(raw: string): { valid: boolean; cleaned: string; error?: string } {
  const digitsOnly = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digitsOnly)) {
    return {
      valid: false,
      cleaned: digitsOnly,
      error: 'IIN/BIN prefix must contain numeric digits only (6 to 8 digits).',
    };
  }
  if (digitsOnly.length < 6) {
    return {
      valid: false,
      cleaned: digitsOnly,
      error: 'Enter at least 6 digits for a valid ISO/IEC 7812 IIN/BIN prefix.',
    };
  }
  if (digitsOnly.length > 8) {
    return {
      valid: false,
      cleaned: digitsOnly.slice(0, 8),
      error:
        'Input exceeds 8 digits. For PCI-DSS safety, full card numbers are rejected; submit only the 6–8 digit IIN/BIN prefix.',
    };
  }
  return { valid: true, cleaned: digitsOnly };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', cacheEntries: lookupCache.size });
  });

  app.get('/api/billing/quote', async (req: Request, res: Response) => {
    const plan = normalizePlanTier(req.query.plan);
    const billingCycle: BillingCycle = req.query.cycle === 'annual' ? 'annual' : 'monthly';
    const config = PLAN_CONFIGS[plan];
    const usdAmount =
      billingCycle === 'annual' ? config.annualPrice * 12 : config.monthlyPrice;

    try {
      const { rate, source } = await fetchLiveBtcUsdRate();
      const satoshis = Math.ceil((usdAmount / rate) * 100_000_000);
      const btcAmount = (satoshis / 100_000_000).toFixed(8);
      const bip21Uri = `bitcoin:${BTC_RECEIVING_ADDRESS}?amount=${btcAmount}&label=${encodeURIComponent(
        `IINScope ${config.name} Plan`,
      )}`;

      const quote: BtcQuoteResponse = {
        plan,
        billingCycle,
        usdAmount,
        btcUsdRate: rate,
        btcAmount,
        satoshis,
        address: BTC_RECEIVING_ADDRESS,
        bip21Uri,
        rateSource: source,
        quotedAt: new Date().toISOString(),
      };
      res.json(quote);
    } catch {
      res.status(503).json({
        error: 'Unable to fetch live BTC/USD exchange rate. Please retry in a moment.',
      });
    }
  });

  app.post('/api/billing/verify-btc', async (req: Request, res: Response) => {
    const body = req.body as {
      plan?: unknown;
      billingCycle?: unknown;
      txid?: unknown;
      expectedSats?: unknown;
    };

    const plan = normalizePlanTier(body?.plan);
    const billingCycle: BillingCycle = body?.billingCycle === 'annual' ? 'annual' : 'monthly';
    const expectedSats =
      typeof body?.expectedSats === 'number' && body.expectedSats > 0
        ? Math.floor(body.expectedSats)
        : 0;

    if (expectedSats <= 0) {
      res.status(400).json({ error: 'Valid BTC invoice quote is required before verification.' });
      return;
    }

    const minAcceptableSats = Math.floor(expectedSats * 0.98);
    const rawTxid = typeof body?.txid === 'string' ? body.txid.trim() : '';

    if (rawTxid) {
      if (!/^[a-fA-F0-9]{64}$/.test(rawTxid)) {
        res.status(400).json({
          error: 'Invalid Bitcoin TXID format. Enter a 64-character hexadecimal transaction ID.',
        });
        return;
      }

      const tx = await fetchTxFromExplorer(rawTxid);
      if (!tx) {
        res.status(404).json({
          error:
            'Transaction not found on Bitcoin mainnet mempool or confirmed blocks yet. Wait a few seconds after broadcasting and retry.',
        });
        return;
      }

      const paidSats = sumPaidSatsToAddress(tx, BTC_RECEIVING_ADDRESS);
      if (paidSats <= 0) {
        res.status(402).json({
          error: `Transaction ${rawTxid.slice(0, 12)}... does not include an output paying ${BTC_RECEIVING_ADDRESS}.`,
        });
        return;
      }

      if (paidSats < minAcceptableSats) {
        res.status(402).json({
          error: `Insufficient payment: received ${(paidSats / 100_000_000).toFixed(
            8,
          )} BTC, expected at least ${(minAcceptableSats / 100_000_000).toFixed(8)} BTC.`,
        });
        return;
      }

      const verifiedAt = new Date().toISOString();
      const receiptPayload: ReceiptPayload = {
        plan,
        billingCycle,
        txid: rawTxid.toLowerCase(),
        paidSats,
        verifiedAt,
      };
      const entitlement: PaidEntitlement = {
        ...receiptPayload,
        address: BTC_RECEIVING_ADDRESS,
        confirmed: Boolean(tx.status?.confirmed),
        receiptToken: signReceipt(receiptPayload),
      };
      res.json(entitlement);
      return;
    }

    // Scan recent incoming transactions to BTC_RECEIVING_ADDRESS
    const txs = await fetchAddressTxsFromExplorer(BTC_RECEIVING_ADDRESS);
    const matched = txs.find((tx) => sumPaidSatsToAddress(tx, BTC_RECEIVING_ADDRESS) >= minAcceptableSats);

    if (!matched || !matched.txid) {
      res.status(402).json({
        error: `No incoming BTC payment of at least ${(minAcceptableSats / 100_000_000).toFixed(
          8,
        )} BTC detected yet on ${BTC_RECEIVING_ADDRESS}. Broadcast your payment and paste the TXID or retry scanning.`,
      });
      return;
    }

    const paidSats = sumPaidSatsToAddress(matched, BTC_RECEIVING_ADDRESS);
    const verifiedAt = new Date().toISOString();
    const receiptPayload: ReceiptPayload = {
      plan,
      billingCycle,
      txid: matched.txid.toLowerCase(),
      paidSats,
      verifiedAt,
    };
    const entitlement: PaidEntitlement = {
      ...receiptPayload,
      address: BTC_RECEIVING_ADDRESS,
      confirmed: Boolean(matched.status?.confirmed),
      receiptToken: signReceipt(receiptPayload),
    };
    res.json(entitlement);
  });

  app.get('/api/bin/:bin', async (req: Request, res: Response) => {
    const receiptToken = req.header('x-iinscope-receipt');
    const receipt = verifyReceipt(receiptToken);
    if (!receipt) {
      res.status(402).json({
        error: 'Payment required. Complete BTC payment for a workspace plan before looking up BINs.',
      });
      return;
    }

    const planConfig = PLAN_CONFIGS[normalizePlanTier(receipt.plan)];
    const currentUsed = usageByTxid.get(receipt.txid) ?? 0;
    if (planConfig.lookupLimit !== null && currentUsed >= planConfig.lookupLimit) {
      res.status(403).json({
        error: `${planConfig.name} plan lookup quota reached (${planConfig.lookupLimit}/${planConfig.lookupLimit}). Upgrade your plan to continue.`,
      });
      return;
    }

    const rawParam = typeof req.params.bin === 'string' ? req.params.bin : '';
    const check = validateBinParam(rawParam);
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }

    try {
      const result = await resolveBinMetadata(check.cleaned);
      usageByTxid.set(receipt.txid, currentUsed + 1);
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Failed to resolve IIN metadata.' });
    }
  });

  app.post('/api/bin/batch', async (req: Request, res: Response) => {
    const receiptToken = req.header('x-iinscope-receipt');
    const receipt = verifyReceipt(receiptToken);
    if (!receipt) {
      res.status(402).json({
        error: 'Payment required. Complete BTC payment for the Business plan before running Bulk BIN lookups.',
      });
      return;
    }

    const body = req.body as { bins?: unknown; plan?: unknown };
    if (!Array.isArray(body?.bins)) {
      res.status(400).json({ error: 'Request body must include a bins string array.' });
      return;
    }

    const resolvedPlan = normalizePlanTier(receipt.plan);
    const planConfig = PLAN_CONFIGS[resolvedPlan];
    if (!planConfig.bulkEnabled) {
      res.status(403).json({
        error: 'Bulk BIN lookup is exclusively available on the Business plan ($300/mo).',
      });
      return;
    }

    const maxBatch = planConfig.batchLimit;
    const inputs = body.bins
      .filter((item): item is string => typeof item === 'string')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, maxBatch);

    if (inputs.length === 0) {
      res.status(400).json({ error: 'Provide at least one 6–8 digit IIN/BIN prefix.' });
      return;
    }

    const items: BatchItemResult[] = [];
    for (const raw of inputs) {
      const check = validateBinParam(raw);
      if (!check.valid) {
        items.push({
          input: raw.slice(0, 8),
          valid: false,
          error: check.error ?? 'Invalid prefix',
          result: null,
        });
        continue;
      }

      try {
        const result = await resolveBinMetadata(check.cleaned);
        items.push({
          input: check.cleaned,
          valid: true,
          error: null,
          result,
        });
      } catch {
        items.push({
          input: check.cleaned,
          valid: false,
          error: 'Lookup failed',
          result: null,
        });
      }
    }

    const validCount = items.filter((i) => i.valid).length;
    const responsePayload: BatchLookupResponse = {
      total: items.length,
      validCount,
      invalidCount: items.length - validCount,
      items,
      processedAt: new Date().toISOString(),
    };

    res.json(responsePayload);
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IINScope server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
