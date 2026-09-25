import { IntelligenceProvider } from "../intelligence.js";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const DEFAULT_DEX = "https://api.dexscreener.com/latest/dex/tokens";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxu";

const cache = new Map();
let activeScans = 0;

export function createTokenResearchProvider({
  fetchImpl = globalThis.fetch,
  rpcUrl = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC,
  dexUrl = DEFAULT_DEX,
  timeoutMs = 2500,
  cacheMs = 15_000,
  maxConcurrent = 2
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is required");

  return new IntelligenceProvider("token-research", async (observation) => {
    const mint = observation.mint;
    const cached = cache.get(mint);
    if (cached && Date.now() - cached.at < cacheMs) return cached.value;

    while (activeScans >= maxConcurrent) await sleep(50);
    activeScans += 1;
    try {
      const [chain, market] = await Promise.all([
        fetchChainState(mint, fetchImpl, rpcUrl, timeoutMs),
        fetchDexState(mint, fetchImpl, dexUrl, timeoutMs)
      ]);
      const riskFlags = deriveRiskFlags(chain, market);
      const result = {
        tokenIntegrity: chain.tokenIntegrity,
        authority: chain.authority,
        tokenProgram: chain.tokenProgram,
        token2022: chain.token2022,
        holders: chain.holders,
        holderStructure: chain.holders,
        creatorIntelligence: chain.creatorIntelligence,
        wallet: chain.wallet,
        walletBehaviour: chain.walletBehaviour,
        flowDynamics: chain.flowDynamics,
        liquidity: market.liquidity,
        liquidityStructure: market.liquidityStructure,
        behavior: market.behavior,
        marketDynamics: market.marketDynamics,
        honeypot: null,
        sellability: { status: "not-tested", reason: "No transaction was signed or submitted by JevSentinel." },
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
      cache.set(mint, { at: Date.now(), value: result });
      return result;
    } finally {
      activeScans -= 1;
    }
  });
}

async function fetchChainState(mint, fetchImpl, rpcUrl, timeoutMs) {
  const [supply, largest, account] = await Promise.all([
    rpc(fetchImpl, rpcUrl, "getTokenSupply", [mint], timeoutMs),
    rpc(fetchImpl, rpcUrl, "getTokenLargestAccounts", [mint], timeoutMs),
    rpc(fetchImpl, rpcUrl, "getAccountInfo", [mint, { encoding: "jsonParsed" }], timeoutMs)
  ]);

  const supplyValue = supply?.value;
  const supplyAmount = Number(supplyValue?.amount);
  const decimals = Number(supplyValue?.decimals ?? 0);
  const totalSupply = Number.isFinite(supplyAmount) ? supplyAmount / 10 ** decimals : null;
  const accounts = Array.isArray(largest?.value) ? largest.value : [];
  const amounts = accounts.map((a) => Number(a.amount) / 10 ** decimals).filter(Number.isFinite);
  const top10 = totalSupply > 0 ? amounts.slice(0, 10).reduce((a, b) => a + b, 0) / totalSupply * 100 : null;
  const topHolder = totalSupply > 0 && amounts[0] !== undefined ? amounts[0] / totalSupply * 100 : null;
  const programOwner = account?.value?.owner ?? null;
  const parsedInfo = account?.value?.data?.parsed?.info ?? {};
  const mintAuthority = supplyValue?.mintAuthority ?? parsedInfo.mintAuthority ?? null;
  const freezeAuthority = supplyValue?.freezeAuthority ?? parsedInfo.freezeAuthority ?? null;

  const creator = await resolveCreator(mint, fetchImpl, rpcUrl, timeoutMs);
  const owners = await resolveLargestOwners(accounts, fetchImpl, rpcUrl, timeoutMs);

  const holderStructure = {
    top10ConcentrationPct: top10,
    topHolderConcentrationPct: topHolder,
    largestAccountCount: accounts.length,
    resolvedLargestOwners: owners.length,
    ownerResolutionCoveragePct: accounts.length ? owners.length / accounts.length * 100 : null,
    totalSupply
  };

  const walletBehaviour = {
    uniqueLargestHolders: accounts.length,
    topHolderOwners: owners.slice(0, 10),
    concentrationPct: top10
  };

  const creatorIntelligence = creator ? {
    creatorAddress: creator.address,
    firstObservedSignature: creator.signature,
    firstObservedAt: creator.blockTime ? new Date(creator.blockTime * 1000).toISOString() : null,
    signerCount: creator.signers.length,
    signers: creator.signers.slice(0, 8),
    recentTransactionCount: creator.recentTransactionCount,
    failedRecentTransactions: creator.failedRecentTransactions
  } : null;

  const tokenIntegrity = {
    tokenProgram: programOwner,
    token2022: programOwner === TOKEN_2022_PROGRAM,
    authority: {
      mintAuthority,
      freezeAuthority,
      mintAuthorityActive: Boolean(mintAuthority),
      freezeAuthorityActive: Boolean(freezeAuthority)
    },
    upgradeability: "not-applicable-to-mint-account",
    sellability: { status: "not-tested" }
  };

  return {
    tokenIntegrity,
    tokenProgram: programOwner,
    token2022: programOwner === TOKEN_2022_PROGRAM,
    authority: tokenIntegrity.authority,
    holders: holderStructure,
    wallet: walletBehaviour,
    walletBehaviour,
    creatorIntelligence,
    flowDynamics: { source: "chain-research", status: "limited" }
  };
}

async function resolveLargestOwners(accounts, fetchImpl, rpcUrl, timeoutMs) {
  const addresses = accounts.map((a) => a.address).filter(Boolean).slice(0, 10);
  if (!addresses.length) return [];
  const result = await rpc(fetchImpl, rpcUrl, "getMultipleAccountsInfo", [addresses, { encoding: "jsonParsed" }], timeoutMs);
  const values = Array.isArray(result?.value) ? result.value : [];
  return values.map((item, index) => ({
    tokenAccount: addresses[index],
    owner: item?.data?.parsed?.info?.owner ?? null
  })).filter((item) => item.owner);
}

async function resolveCreator(mint, fetchImpl, rpcUrl, timeoutMs) {
  let before = null;
  let oldest = [];
  for (let page = 0; page < 3; page += 1) {
    const params = { limit: 1000 };
    if (before) params.before = before;
    const batch = await rpc(fetchImpl, rpcUrl, "getSignaturesForAddress", [mint, params], timeoutMs);
    if (!Array.isArray(batch) || !batch.length) break;
    oldest = batch;
    before = batch.at(-1)?.signature ?? null;
    if (batch.length < 1000) break;
  }
  const oldestEntry = oldest.at(-1);
  const signature = oldestEntry?.signature;
  if (!signature) return null;
  const tx = await rpc(fetchImpl, rpcUrl, "getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
  ], timeoutMs);
  const keys = tx?.transaction?.message?.accountKeys ?? [];
  const signers = keys.filter((key) => key?.signer).map((key) => key.pubkey).filter(Boolean);
  const creatorAddress = signers[0] ?? null;
  const creatorRecent = creatorAddress
    ? await rpc(fetchImpl, rpcUrl, "getSignaturesForAddress", [creatorAddress, { limit: 20 }], timeoutMs)
    : [];
  return {
    address: creatorAddress,
    signature,
    blockTime: tx?.blockTime ?? oldestEntry?.blockTime ?? null,
    signers,
    recentTransactionCount: Array.isArray(creatorRecent) ? creatorRecent.length : 0,
    failedRecentTransactions: Array.isArray(creatorRecent) ? creatorRecent.filter((item) => item?.err).length : 0
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
  const liquidityUsd = finite(pair.liquidity?.usd);
  const marketDynamics = {
    priceUsd: finite(pair.priceUsd),
    priceChange5mPct: finite(pair.priceChange?.m5),
    priceChange1hPct: finite(pair.priceChange?.h1),
    volume5mUsd: finite(pair.volume?.m5),
    volume1hUsd: finite(pair.volume?.h1),
    marketCapUsd: finite(pair.marketCap ?? pair.fdv),
    buyCount5m: finite(buys),
    sellCount5m: finite(sells),
    buySellRatio5m: buys + sells > 0 ? buys / (buys + sells) : null
  };
  return {
    ...marketDynamics,
    liquidityUsd,
    marketCapUsd: marketDynamics.marketCapUsd,
    priceUsd: marketDynamics.priceUsd,
    priceChange5mPct: marketDynamics.priceChange5mPct,
    priceChange1hPct: marketDynamics.priceChange1hPct,
    volume5mUsd: marketDynamics.volume5mUsd,
    volume1hUsd: marketDynamics.volume1hUsd,
    buyCount5m: marketDynamics.buyCount5m,
    sellCount5m: marketDynamics.sellCount5m,
    buySellRatio5m: marketDynamics.buySellRatio5m,
    pairAgeHours: Number.isFinite(pairCreated) ? (Date.now() - pairCreated) / 3600000 : null,
    pairAddress: pair.pairAddress ?? null,
    dex: pair.dexId ?? null,
    liquidity: { usd: liquidityUsd, base: finite(pair.liquidity?.base), quote: finite(pair.liquidity?.quote) },
    liquidityStructure: {
      usd: liquidityUsd,
      pairAddress: pair.pairAddress ?? null,
      dex: pair.dexId ?? null,
      baseSymbol: pair.baseToken?.symbol ?? null,
      quoteSymbol: pair.quoteToken?.symbol ?? null,
      lpOwnership: "not-resolved",
      lpLockState: "not-resolved"
    },
    behavior: marketDynamics,
    marketDynamics
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
  if (chain.token2022) flags.push("token-2022");
  return flags;
}

function emptyMarket() {
  return {
    marketCapUsd: null, priceUsd: null, priceChange5mPct: null, priceChange1hPct: null,
    volume5mUsd: null, volume1hUsd: null, buyCount5m: null, sellCount5m: null,
    buySellRatio5m: null, liquidityUsd: null, pairAgeHours: null, pairAddress: null, dex: null,
    liquidity: {}, liquidityStructure: {}, behavior: {}, marketDynamics: {}
  };
}

async function rpc(fetchImpl, url, method, params, timeoutMs) {
  try {
    return await getJson(fetchImpl, url, timeoutMs, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    }).then((body) => {
      if (body?.error) throw new Error(body.error.message ?? `RPC ${method} failed`);
      return body.result;
    });
  } catch {
    return null;
  }
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
