const PROVIDER_FIELDS = Object.freeze([
  "score", "riskLevel", "isRug", "confidence", "riskFlags",
  "temporalScore", "temporalStage", "estimatedPullHours",
  "authority", "liquidity", "holders", "behavior", "wallet",
  "transferBurst", "walletRotation", "honeypot"
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

export async function collectIntelligence(providers, observation) {
  const entries = await Promise.all(
    providers.map(async (provider) => {
      try {
        return normalizeIntelligence(provider.name, await provider.scan(observation));
      } catch (error) {
        return normalizeProviderFailure(provider.name, error);
      }
    })
  );
  return Object.fromEntries(entries.map((entry) => [entry.provider, entry]));
}

export class IntelligenceProvider {
  constructor(name, scan) {
    if (!name || typeof scan !== "function") throw new TypeError("provider name and scan function are required");
    this.name = name;
    this.scan = scan;
  }
}
