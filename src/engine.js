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

      logger?.log?.("[jevsentinel] temporal state", JSON.stringify({\n        priorSnapshotCount: priorSnapshots.length,\n        currentSnapshot,\n        sampleCount: temporal.sampleCount,\n        deltas: temporal.deltas,\n        acceleration: temporal.acceleration\n      }));\n      logger?.log?.("[jevsentinel] decision input", JSON.stringify(buildDecisionInputSummary(state, intelligence)));
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
    sellUsd: finite(fields.sellUsd ?? flow.sellUsd),
    buyUsd: finite(fields.buyUsd ?? flow.buyUsd),
    sellerCount: finite(fields.sellerCount ?? wallet.uniqueSellers)
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
