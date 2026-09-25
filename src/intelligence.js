const PROVIDER_FIELDS = Object.freeze([
  "score", "riskLevel", "isRug", "confidence", "riskFlags",
  "rugStage", "rugStageName", "temporalScore", "temporalStage", "estimatedPullHours",
  "authority", "liquidity", "holders", "behavior", "wallet",
  "honeypot", "burst", "transferCount", "totalAmount",
  "uniqueSenders", "uniqueReceivers", "watchedMatches", "windowMs", "direction",
  "priceVelocity", "liquidityVelocity", "volumeVelocity", "sellUsd", "buyUsd", "sellerCount",
  "signalCount",\n  "marketCapUsd", "priceUsd", "priceChange5mPct", "priceChange1hPct", "volume5mUsd", "volume1hUsd",\n  "buyCount5m", "sellCount5m", "buySellRatio5m", "liquidityUsd", "pairAgeHours", "pairAddress", "dex", "source"
]);

export function normalizeIntelligence(provider, raw = {}) {
  const breakdown = raw.breakdown ?? {};
  return {
    provider,
    observedAt: new Date().toISOString(),
    available: true,
    fields: Object.fromEntries(
      PROVIDER_FIELDS.map((key) => [key, raw[key] ?? breakdown[key] ?? null])
    ),
    raw
  };
}

export function normalizeProviderFailure(provider, error) {
  return {
    provider,
    observedAt: new Date().toISOString(),
    available: false,
    fields: {},
    error: error instanceof Error ? error.message : String(error)
  };
}

export async function collectIntelligence(providers, observation, { timeoutMs = 1500 } = {}) {
  const entries = await Promise.all(
    providers.map(async (provider) => {
      try {
        const result = await withTimeout(provider.scan(observation), timeoutMs);
        return normalizeIntelligence(provider.name, result);
      } catch (error) {
        return normalizeProviderFailure(provider.name, error);
      }
    })
  );
  return Object.fromEntries(entries.map((entry) => [entry.provider, entry]));
}

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`provider timeout after ${timeoutMs}ms`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

export class IntelligenceProvider {
  constructor(name, scan) {
    if (!name || typeof scan !== "function") {
      throw new TypeError("provider name and scan function are required");
    }
    this.name = name;
    this.scan = scan;
  }
}
