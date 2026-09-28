import test from "node:test";
import assert from "node:assert/strict";
import {
  IntelligenceProvider,
  MemoryTelemetry,
  buildTemporalState,
  createJevSentinel,
  createObservation
} from "../src/index.js";

test("normalizes an observation without inventing gates", () => {
  const o = createObservation({ mint: "mint1", symbol: "TEST", sourceCard: "CW" });
  assert.equal(o.mint, "mint1");
  assert.equal(o.sourceCard, "CW");
  assert.equal(o.entryPrice, null);
});

test("records each shadow prediction with a stable telemetry linkage", async () => {
  const provider = new IntelligenceProvider("external-market", async () => ({
    priceUsd: 1,
    liquidityUsd: 1000,
    volume5mUsd: 5000,
    buySellRatio5m: 1.2,
  }));
  const telemetry = new MemoryTelemetry();
  const evaluator = {
    evaluate: async () => ({
      answers: {
        progression: { choice: "noProgression" },
        deterioration: { choice: "stable" },
        retraceAlternative: { choice: "likelyNormalRetrace" },
        urgency: { choice: "monitor" },
        falsePositive: { noul: true },
        evidenceQuality: { choice: "strong" },
      }
    })
  };
  const engine = createJevSentinel({ providers: [provider], evaluator, telemetry });
  const result = await engine.assess(createObservation({ mint: "mint-prediction", sourceCard: "EARLY ENTRY EXPERIMENT" }));
  const record = telemetry.get(result.id);
  assert.equal(record.predictionId, record.id);
  assert.equal(record.prediction.action, result.state.shadowPrediction.action);
  assert.equal(record.prediction.shadow, true);
});

test("normalizes external intelligence into provider-neutral fields", async () => {
  const provider = new IntelligenceProvider("external-behavior", async () => ({
    score: 91,
    riskLevel: "CRITICAL",
    isRug: true,
    confidence: 0.97,
    breakdown: { behavior: 25, wallet: 10 },
    riskFlags: ["FLAG_A"]
  }));
  const telemetry = new MemoryTelemetry();
  const evaluator = { evaluate: async (state) => ({ model: "test", answers: { ok: true }, state }) };
  const engine = createJevSentinel({ providers: [provider], evaluator, telemetry });
  const result = await engine.assess(createObservation({ mint: "mint1", sourceCard: "HOT" }));
  assert.equal(result.intelligence["external-behavior"].fields.score, 91);
  assert.equal(result.intelligence["external-behavior"].fields.behavior, 25);
  assert.equal(result.state.intelligence[0].fields.behavior, 25);
  assert.equal(result.state.intelligence[0].provider, "external-behavior");
  assert.equal(telemetry.all().length, 1);
});

test("preserves market telemetry when a later provider has null normalized fields", async () => {
  const marketProvider = new IntelligenceProvider("token-research", async () => ({
    priceUsd: 1.25,
    liquidityUsd: 18000,
    volume5mUsd: 42000,
    priceChange5mPct: -48,
    buyCount5m: 6,
    sellCount5m: 41,
    buySellRatio5m: 0.127,
  }));
  const flowProvider = new IntelligenceProvider("transfer-flow", async () => ({
    uniqueSellers: 4,
    uniqueBuyers: 2,
    sellerAcceleration: 3,
    coordinatedSellers: 2,
  }));
  const telemetry = new MemoryTelemetry();
  const evaluator = { evaluate: async () => ({ answers: {} }) };
  const engine = createJevSentinel({ providers: [marketProvider, flowProvider], evaluator, telemetry });
  const result = await engine.assess(createObservation({ mint: "mint-provider-null-overwrite", sourceCard: "CW" }));

  assert.equal(result.state.temporal.latest.price, 1.25);
  assert.equal(result.state.temporal.latest.liquidity, 18000);
  assert.equal(result.state.temporal.latest.volume, 42000);
  assert.equal(result.state.temporal.latest.priceChange5mPct, -48);
  assert.equal(result.state.temporal.latest.sellCount5m, 41);
  assert.equal(result.state.temporal.latest.buySellRatio5m, 0.127);
  assert.equal(result.state.temporal.latest.uniqueSellers, 4);
  assert.equal(result.state.temporal.latest.coordinatedSellers, 2);
});

test("provider failure does not stop JEV evaluation", async () => {
  const provider = new IntelligenceProvider("external-flow", async () => { throw new Error("timeout"); });
  const telemetry = new MemoryTelemetry();
  const evaluator = { evaluate: async () => ({ answers: { escalation: "unknown" } }) };
  const engine = createJevSentinel({ providers: [provider], evaluator, telemetry });
  const result = await engine.assess(createObservation({ mint: "mint2" }));
  assert.equal(result.intelligence["external-flow"].available, false);
  assert.equal(result.assessment.answers.escalation, "unknown");
});

test("temporal engine measures nested state change from real history", () => {
  const state = buildTemporalState([
    { observedAt: "2026-01-01T00:00:00Z", price: 10, liquidity: 100, sellUsd: 10, sellerCount: 1 },
    { observedAt: "2026-01-01T00:01:00Z", price: 8, liquidity: 80, sellUsd: 30, sellerCount: 4 }
  ]);
  assert.equal(state.deltas.price, -2);
  assert.equal(state.deltas.liquidity, -20);
  assert.equal(state.acceleration.selling, "increasing");
  assert.equal(state.acceleration.liquidity, "deteriorating");
});

test("outcome telemetry can be updated after the original assessment", () => {
  const telemetry = new MemoryTelemetry();
  const id = telemetry.append({ id: "abc", outcome: null });
  const updated = telemetry.updateOutcome(id, { priceAt5m: 0.5, rugObserved: true });
  assert.equal(updated.outcome.rugObserved, true);
});


test("live history preserves changing market and flow telemetry for prediction", async () => {
  let tick = 0;
  const provider = new IntelligenceProvider("external-market", async () => {
    tick += 1;
    return {
      priceUsd: tick === 1 ? 1 : 1.2,
      liquidityUsd: tick === 1 ? 1000 : 900,
      volume5mUsd: tick === 1 ? 5000 : 7000,
      priceChange5mPct: tick === 1 ? -2.5 : 1.5,
      buyCount5m: tick === 1 ? 20 : 30,
      sellCount5m: tick === 1 ? 12 : 22,
      buySellRatio5m: tick === 1 ? 0.77 : 1.36,
      uniqueSellers: tick === 1 ? 6 : 9,
      uniqueBuyers: tick === 1 ? 11 : 15
    };
  });
  const telemetry = new MemoryTelemetry();
  const evaluator = { evaluate: async (state) => ({ answers: { ok: true }, state }) };
  const engine = createJevSentinel({ providers: [provider], evaluator, telemetry });
  const first = await engine.assess(createObservation({ mint: "mint-live", sourceCard: "CW2" }));
  assert.equal(first.state.temporal.latest.sellCount5m, 12);

  const second = await engine.assess(
    createObservation({ mint: "mint-live", sourceCard: "CW2" }),
    [first.state]
  );
  assert.equal(second.state.temporal.sampleCount, 2);
  assert.equal(second.state.temporal.previous.sellCount5m, 12);
  assert.equal(second.state.temporal.latest.sellCount5m, 22);
  assert.equal(second.state.temporal.latest.uniqueSellers, 9);
  assert.ok(Math.abs(second.state.temporal.deltas.price - 0.2) < 1e-9);
  assert.equal(second.state.temporal.deltas.liquidity, -100);
  assert.equal(second.state.temporal.deltas.volume, 2000);
  assert.equal(second.state.temporal.acceleration.liquidity, "deteriorating");
  assert.equal(second.state.temporal.acceleration.buyPressure, "increasing");
  assert.equal(second.state.temporal.acceleration.price, "improving");
  assert.equal(second.state.shadowPrediction.shadow, true);
});

test("passes social narrative evidence into the JEV state without turning it into a risk gate", async () => {
  const provider = new IntelligenceProvider("social-narrative", async () => ({
    socialNarrative: {
      status: "available",
      postCount: 12,
      uniqueAuthors: 8,
      sentimentDirection: "bullish",
      sourceDiversity: 0.7,
      credibilityScore: 0.6,
      persistenceScore: 0.5,
      contradictionRatio: 0.1,
      durabilityScore: 0.54,
      velocity: "accelerating",
      narrativeTier: "emerging"
    }
  }));
  const telemetry = new MemoryTelemetry();
  const evaluator = { evaluate: async (state) => ({ answers: {}, state }) };
  const engine = createJevSentinel({ providers: [provider], evaluator, telemetry });
  const result = await engine.assess(createObservation({ mint: "mint-social", symbol: "SOCIAL", sourceCard: "CW2" }));
  assert.equal(result.state.evidence.socialNarrative.postCount, 12);
  assert.equal(result.state.evidence.socialNarrative.uniqueAuthors, 8);
  assert.equal(result.state.evidence.socialNarrative.sentimentDirection, "bullish");
  assert.equal(result.state.trajectory.action, "HOLD");
});
