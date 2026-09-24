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
  assert.equal(result.state.externalIntelligence[0].fields.behavior, 25);
  assert.equal(result.state.externalIntelligence[0].provider, undefined);
  assert.equal(telemetry.all().length, 1);
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

test("temporal engine measures change rather than fixed thresholds", () => {
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
