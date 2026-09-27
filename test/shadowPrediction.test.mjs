import test from "node:test";
import assert from "node:assert/strict";
import { buildShadowPrediction } from "../src/shadowPrediction.js";

function state(overrides = {}) {
  return {
    evidence: { evidenceQuality: { status: "strong" } },
    temporal: {
      sampleCount: 3,
      latest: { price: 1, liquidity: 50_000 },
      acceleration: { buyPressure: "increasing", price: "improving", selling: "stable", liquidity: "stable" },
    },
    ...overrides,
  };
}

test("BUY requires positive structure and live confirmation", () => {
  const result = buildShadowPrediction({
    state: state(),
    trajectory: { action: "HOLD", riskScore: 0 },
    assessment: { answers: {
      progression: { choice: "noProgression" },
      deterioration: { choice: "stable" },
      retraceAlternative: { choice: "likelyNormalRetrace" },
      urgency: { choice: "monitor" },
      falsePositive: { noul: true },
      evidenceQuality: { choice: "strong" },
    }},
  });
  assert.equal(result.action, "BUY");
  assert.equal(result.shadow, true);
  assert.ok(result.confidence >= 0.7);
});

test("promising but unconfirmed structure stays HOLD", () => {
  const result = buildShadowPrediction({
    state: state({ temporal: { sampleCount: 1, latest: {}, acceleration: {} } }),
    trajectory: { action: "HOLD", riskScore: 0 },
    assessment: { answers: {
      progression: { choice: "noProgression" },
      deterioration: { choice: "stable" },
      urgency: { choice: "monitor" },
      evidenceQuality: { choice: "usable" },
    }},
  });
  assert.equal(result.action, "HOLD");
});

test("deterioration after a positive prediction becomes SELL", () => {
  const result = buildShadowPrediction({
    state: state({ temporal: { sampleCount: 4, latest: {}, acceleration: { liquidity: "deteriorating", selling: "increasing" } } }),
    trajectory: { action: "SELL", riskScore: 10 },
    priorPrediction: { action: "BUY" },
    assessment: { answers: {
      progression: { choice: "extraction" },
      deterioration: { choice: "severe" },
      urgency: { choice: "immediate" },
      evidenceQuality: { choice: "strong" },
    }},
  });
  assert.equal(result.action, "SELL");
  assert.match(result.reasons[0], /prior positive prediction/i);
});

test("unreliable or conflicting evidence becomes CAUTION", () => {
  const result = buildShadowPrediction({
    state: state({ temporal: { sampleCount: 3, latest: {}, acceleration: { buyPressure: "increasing", selling: "increasing" } } }),
    trajectory: { action: "HOLD", riskScore: 0 },
    assessment: { answers: {
      progression: { choice: "unclear" },
      deterioration: { choice: "watch" },
      retraceAlternative: { choice: "mixedEvidence" },
      evidenceQuality: { choice: "limited" },
    }},
  });
  assert.equal(result.action, "CAUTION");
});
