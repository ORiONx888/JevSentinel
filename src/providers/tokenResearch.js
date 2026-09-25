import { IntelligenceProvider } from "../intelligence.js";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const DEFAULT_DEX = "https://api.dexscreener.com/latest/dex/tokens";

export function createTokenResearchProvider({
  fetchImpl = globalThis.fetch,
  rpcUrl = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC,
  dexUrl = DEFAULT_DEX,
  timeoutMs = 2500
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is required");

  return new IntelligenceProvider("token-research", async (observation) => {
    const mint = observation.mint;
    const [chain, market] = await Promise.all([
      fetchChainState(mint, fetchImpl, rpcUrl, timeoutMs),
      fetchDexState(mint, fetchImpl, dexUrl, timeoutMs)
    ]);

    const riskFlags = deriveRiskFlags(chain, market);
    return {
      authority: chain.authority,
      holders: chain.holders,
      liquidity: market.liquidity,
      behavior: market.behavior,
      wallet: chain.wallet,
      honeypot: null,
      riskFlags,
      marketCapUsd: market.marketCapUsd,
      priceUsd: market.priceUsd,
      priceChange5mPct: market.priceChange5mPct,
      priceChange1hPct: market.priceChange1hPct,
      volume5mUsd: market.volume5mUsd,
      volume1hUsd: market.volume1hUsd,
      buyCount5m: market.buyCount5m,
      sellCount5m: market.sellCount5m,
      buySellRatio5m: market.buySellRatio5m,
      liquidityUsd: market.liquidityUsd,
      pairAgeHours: market.pairAgeHours,
      pairAddress: market.pairAddress,
      dex: market.dex,
      observedAt: new Date().toISOString(),
      source: { chain: rpcUrl, market: dexUrl }
    };
  });
}

async function fetchChainState(mint, fetchImpl, rpcUrl, timeoutMs) {
  const [supply, largest] = await Promise.all([
    rpc(fetchImpl, rpcUrl, "getTokenSupply", [mint], timeoutMs),
    rpc(fetchImpl, rpcUrl, "getTokenLargestAccounts", [mint], timeoutMs)
  ]);

  const supplyAmount = Number(supply?.value?.amount);
  const decimals = Number(supply?.value?.decimals);
  const totalSupply = Number.isFinite(supplyAmount) ? supplyAmount / 10 ** decimals : null;
  const accounts = Array.isArray(largest?.value) ? largest.value : [];
  const amounts = accounts.map((a) => Number(a.amount) / 10 ** decimals).filter(Number.isFinite);
  const top10 = totalSupply > 0 ? amounts.slice(0, 10).reduce((a, b) => a + b, 0) / totalSupply * 100 : null;
  const topHolder = totalSupply > 0 && amounts[0] !== undefined ? amounts[0] / totalSupply * 100 : null;

  return {
    authority: {
      mintAuthority: supply?.value?.mintAuthority ?? null,
      freezeAuthority: supply?.value?.freezeAuthority ?? null,
      mintAuthorityActive: Boolean(supply?.value?.mintAuthority),
      freezeAuthorityActive: Boolean(supply?.value?.freezeAuthority)
    },
    holders: {
      top10ConcentrationPct: top10,
      topHolderConcentrationPct: topHolder,
      largestAccountCount: accounts.length,
      totalSupply
    },
    wallet: {
      uniqueLargestHolders: accounts.length
    }
  };
}

async function fetchDexState(mint, fetchImpl, dexUrl, timeoutMs) {
  const data = await getJson(fetchImpl, `${dexUrl}/${mint}`, timeoutMs);
  const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
  if (!pairs.length) return emptyMarket();

  const pair = [...pairs].sort((a, b) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))[0];
  const txns = pair.txns?.m5 ?? {};
  const buys = Number(txns.buys);
  const sells = Number(txns.sells);
  const pairCreated = Number(pair.pairCreatedAt);
  return {
    marketCapUsd: finite(pair.marketCap ?? pair.fdv),
    priceUsd: finite(pair.priceUsd),
    priceChange5mPct: finite(pair.priceChange?.m5),
    priceChange1hPct: finite(pair.priceChange?.h1),
    volume5mUsd: finite(pair.volume?.m5),
    volume1hUsd: finite(pair.volume?.h1),
    buyCount5m: finite(buys),
    sellCount5m: finite(sells),
    buySellRatio5m: buys + sells > 0 ? buys / (buys + sells) : null,
    liquidityUsd: finite(pair.liquidity?.usd),
    pairAgeHours: Number.isFinite(pairCreated) ? (Date.now() - pairCreated) / 3600000 : null,
    pairAddress: pair.pairAddress ?? null,
    dex: pair.dexId ?? null,
    liquidity: {
      usd: finite(pair.liquidity?.usd),
      base: finite(pair.liquidity?.base),
      quote: finite(pair.liquidity?.quote)
    },
    behavior: {
      buyCount5m: finite(buys),
      sellCount5m: finite(sells),
      buySellRatio5m: buys + sells > 0 ? buys / (buys + sells) : null
    }
  };
}

function deriveRiskFlags(chain, market) {
  const flags = [];
  if (chain.authority?.mintAuthorityActive) flags.push("mint-authority-active");
  if (chain.authority?.freezeAuthorityActive) flags.push("freeze-authority-active");
  if (Number(chain.holders?.top10ConcentrationPct) >= 40) flags.push("high-top10-concentration");
  if (Number(market.liquidityUsd) > 0 && Number(market.liquidityUsd) < 10000) flags.push("low-liquidity");
  if (Number(market.sellCount5m) > Number(market.buyCount5m) * 2 && Number(market.sellCount5m) >= 10) flags.push("sell-pressure");
  if (Number(market.priceChange5mPct) <= -20) flags.push("rapid-price-deterioration");
  return flags;
}

function emptyMarket() {
  return {
    marketCapUsd: null, priceUsd: null, priceChange5mPct: null, priceChange1hPct: null,
    volume5mUsd: null, volume1hUsd: null, buyCount5m: null, sellCount5m: null,
    buySellRatio5m: null, liquidityUsd: null, pairAgeHours: null, pairAddress: null, dex: null,
    liquidity: {}, behavior: {}
  };
}

async function rpc(fetchImpl, url, method, params, timeoutMs) {
  const body = await getJson(fetchImpl, url, timeoutMs, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (body?.error) throw new Error(body.error.message ?? `RPC ${method} failed`);
  return body.result;
}

async function getJson(fetchImpl, url, timeoutMs, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
