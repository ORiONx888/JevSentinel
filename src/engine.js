import { buildJevState } from "./state.js";
import { buildTemporalState } from "./temporal.js";
import { collectIntelligence } from "./intelligence.js";
import { buildEvidenceState } from "./evidence.js";
import { buildRiskTrajectory } from "./riskTrajectory.js";
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

      // Give the JEV model the deterministic trajectory context as part of its
      // decision input. The post-model pass below then folds JEV's answers back
      // into the same trajectory engine for the final live action state.
      state.trajectory = buildRiskTrajectory({ state, history });

      logger?.log?.("[jevsentinel] temporal state", JSON.stringify({
        priorSnapshotCount: priorSnapshots.length,
        currentSnapshot,
        sampleCount: temporal.sampleCount,
        deltas: temporal.deltas,
        acceleration: temporal.acceleration
      }));
      logger?.log?.("[jevsentinel] trajectory state", JSON.stringify({
        action: state.trajectory.action,
        stage: state.trajectory.stage,
        riskScore: state.trajectory.riskScore,
        confidence: state.trajectory.confidence,
        reasons: state.trajectory.reasons
      }));
      logger?.log?.("[jevsentinel] decision input", JSON.stringify(buildDecisionInputSummary(state, intelligence)));

      const assessment = await evaluator.evaluate(state);
      state.verdict = assessment;
      state.trajectory = buildRiskTrajectory({ state, assessment, history });

      logger?.log?.("[jevsentinel] live action state", JSON.stringify({
        action: state.trajectory.action,
        stage: state.trajectory.stage,
        riskScore: state.trajectory.riskScore,
        confidence: state.trajectory.confidence,
        reasons: state.trajectory.reasons
      }));

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
  if (state.temporal?.latest?.observedAt) return { ...state.temporal.latest };
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
