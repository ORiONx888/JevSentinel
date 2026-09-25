import { buildJevState } from "./state.js";
import { buildTemporalState } from "./temporal.js";
import { collectIntelligence } from "./intelligence.js";
import { buildEvidenceState } from "./evidence.js";
import { createTelemetryRecord } from "./telemetry.js";

export function createJevSentinel({ providers = [], evaluator, telemetry, logger = null } = {}) {
  if (!evaluator?.evaluate) throw new TypeError("evaluator.evaluate is required");
  if (!telemetry?.append) throw new TypeError("telemetry.append is required");

  return {
    async assess(observation, history = []) {
      const intelligence = await collectIntelligence(providers, observation);
      const priorSnapshots = history.map(stateToSnapshot).filter(Boolean);
      const currentSnapshot = intelligenceToSnapshot(intelligence);
      const temporal = buildTemporalState([...priorSnapshots, currentSnapshot]);
      const evidence = buildEvidenceState(intelligence, temporal, history);
      const state = buildJevState(observation, intelligence);
      state.temporal = temporal;
      state.evidence = evidence;

      logger?.log?.("[jevsentinel] temporal state", JSON.stringify({
        priorSnapshotCount: priorSnapshots.length,
        currentSnapshot,
        sampleCount: temporal.sampleCount,
        deltas: temporal.deltas,
        acceleration: temporal.acceleration
      }));
      logger?.log?.("[jevsentinel] decision input", JSON.stringify(buildDecisionInputSummary(state, intelligence)));
      const assessment = await evaluator.evaluate(state);
      state.verdict = assessment;
      const record = createTelemetryRecord({ observation, state, intelligence, assessment });
      telemetry.append(record);

      return { id: record.id, state, intelligence, assessment, outcome: null };
    }
  };
}

function intelligenceToSnapshot(intelligence) {
  const fields = Object.fromEntries(Object.values(intelligence).flatMap((item) => Object.entries(item.fields ?? {})));
  const market = fields.marketDynamics ?? {};
  const liquidity = fields.liquidityStructure ?? {};
  const flow = fields.flowDynamics ?? {};
  const wallet = fields.walletBehaviour ?? {};
  return {
    observedAt: new Date().toISOString(),
    price: finite(fields.priceUsd ?? market.priceUsd),
    liquidity: finite(fields.liquidityUsd ?? liquidity.usd),
    volume: finite(fields.volume5mUsd ?? market.volume5mUsd),
    priceChange5mPct: finite(fields.priceChange5mPct ?? market.priceChange5mPct),
    priceChange1hPct: finite(fields.priceChange1hPct ?? market.priceChange1hPct),
    buyCount5m: finite(fields.buyCount5m ?? market.buyCount5m),
    sellCount5m: finite(fields.sellCount5m ?? market.sellCount5m),
    buySellRatio5m: finite(fields.buySellRatio5m ?? market.buySellRatio5m),
    uniqueSellers: finite(fields.uniqueSellers ?? flow.uniqueSellers ?? wallet.uniqueSellers),
    uniqueBuyers: finite(fields.uniqueBuyers ?? flow.uniqueBuyers ?? wallet.uniqueBuyers),
    sellerAcceleration: finite(fields.sellerAcceleration ?? flow.sellerAcceleration),
    coordinatedSellers: finite(fields.coordinatedSellers ?? flow.coordinatedSellers),
    sellUsd: finite(fields.sellUsd ?? flow.sellUsd),
    buyUsd: finite(fields.buyUsd ?? flow.buyUsd),
    sellerCount: finite(fields.sellerCount ?? flow.uniqueSellers ?? wallet.uniqueSellers)
  };
}

function stateToSnapshot(state) {
  if (!state) return null;
  const evidence = state.evidence ?? {};
  const market = evidence.marketDynamics ?? {};
  const liquidity = evidence.liquidityStructure ?? {};
  const flow = evidence.flowDynamics ?? {};
  const wallet = evidence.walletBehaviour ?? {};
  return {
    observedAt: state.context?.observedAt ?? state.context?.signalTime,
    price: finite(market.priceUsd),
    liquidity: finite(market.liquidityUsd ?? liquidity.usd),
    volume: finite(market.volume5mUsd),
    priceChange5mPct: finite(market.priceChange5mPct),
    priceChange1hPct: finite(market.priceChange1hPct),
    buyCount5m: finite(market.buyCount5m),
    sellCount5m: finite(market.sellCount5m),
    buySellRatio5m: finite(market.buySellRatio5m),
    uniqueSellers: finite(flow.uniqueSellers ?? wallet.uniqueSellers),
    uniqueBuyers: finite(flow.uniqueBuyers ?? wallet.uniqueBuyers),
    sellerAcceleration: finite(flow.sellerAcceleration),
    coordinatedSellers: finite(flow.coordinatedSellers),
    volume: finite(market.volume5mUsd),
    sellUsd: finite(flow.sellUsd),
    buyUsd: finite(flow.buyUsd),
    sellerCount: finite(flow.uniqueSellers ?? wallet.uniqueSellers)
  };
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildDecisionInputSummary(state, intelligence) {
  return {
    mint: state.token.mint,
    sourceCard: state.context.sourceCard,
    evidenceGroups: Object.fromEntries(Object.entries(state.evidence ?? {})
      .filter(([key]) => key !== "evidenceQuality")
      .map(([key, value]) => [key, Boolean(value)])),
    evidenceQuality: state.evidence?.evidenceQuality?.status ?? "unknown",
    providers: Object.fromEntries(Object.entries(intelligence).map(([name, item]) => [name, {
      available: item.available,
      fieldCount: Object.keys(item.fields ?? {}).filter((key) => item.fields[key] !== null && item.fields[key] !== undefined).length
    }])),
    temporalSampleCount: state.temporal?.sampleCount ?? 0
  };
}
