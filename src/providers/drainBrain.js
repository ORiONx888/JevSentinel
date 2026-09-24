import { IntelligenceProvider } from "../intelligence.js";

const DEFAULT_BASE_URL = "https://rugslayer.com/api/drainbrain/v1";
const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_CACHE_MS = 5 * 60_000;

export function createDrainBrainProvider({
  apiKey = process.env.DRAINBRAIN_API_KEY,
  baseUrl = process.env.DRAINBRAIN_BASE_URL || DEFAULT_BASE_URL,
  timeoutMs = Number(process.env.DRAINBRAIN_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  cacheMs = DEFAULT_CACHE_MS,
  fetchImpl = fetch
} = {}) {
  const cache = new Map();

  return new IntelligenceProvider("behavior-intelligence", async (observation) => {
    if (!apiKey) throw new Error("DRAINBRAIN_API_KEY is not configured");

    const cached = cache.get(observation.mint);
    if (cached && Date.now() - cached.at < cacheMs) return { ...cached.data, cached: true };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/scan`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ mint: observation.mint }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`behavior intelligence HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
      }

      const data = await response.json();
      cache.set(observation.mint, { at: Date.now(), data });
      return data;
    } finally {
      clearTimeout(timer);
    }
  });
}
