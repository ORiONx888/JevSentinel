import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChronologicalHoldout,
  buildOutcomeValidation,
  normalizeOutcome,
  validateFeatureGroups,
  validateOutcomeForTelemetry
} from "../src/outcomeValidation.js";

const record = (createdAt, label, overrides = {}) => ({
  createdAt,
  assessment: { decision: overrides.decision ?? "WATCH" },
  state: {
    trajectory: {
      action: overrides.action ?? "HOLD",
      stage: overrides.stage ?? "STABLE"
    },
    evidence: { evidenceQuality: { status: overrides.quality ?? "strong" } },
    temporal: {
      acceleration: {
        selling: overrides.selling ?? "stable",
        price: overrides.price ?? "stable",
        liquidity: overrides.liquidity ?? "stable",
        coordination: overrides.coordination ?? "stable"
      }
    }
  },
  outcome: {
    label,
    terminalReturnPct: overrides.terminalReturnPct ?? -20,
    peakGainPct: overrides.peakGainPct ?? 10,
    maxDrawdownPct: overrides.maxDrawdownPct ?? -25
  }
});

test("normalizes a labelled outcome without inventing missing values", () => {
  const outcome = normalizeOutcome({
    label: "pump_then_collapse",
    peakGainPct: "145",
    terminalReturnPct: "-73"
  });
  assert.equal(outcome.peakGainPct, 145);
  assert.equal(outcome.terminalReturnPct, -73);
  assert.equal(outcome.maxDrawdownPct, null);
});

test("unresolved outcomes cannot enter predictive learning", () => {
  const result = validateOutcomeForTelemetry({ label: "unresolved" });
  assert.equal(result.resolved, false);
  assert.match(result.reason, /no predictive label should be learned/i);
});

test("validation compares matched and unmatched patterns offline only", () => {
  const result = buildOutcomeValidation([
    { patternShadow: { matches: [{ id: "P1" }] }, outcome: { label: "negative", terminalReturnPct: -80 } },
    { patternShadow: { matches: [{ id: "P1" }] }, outcome: { label: "positive", terminalReturnPct: 40 } },
    { patternShadow: { matches: [] }, outcome: { label: "negative", terminalReturnPct: -10 } },
    { patternShadow: { matches: [{ id: "P1" }] }, outcome: { label: "unresolved" } }
  ]);
  assert.equal(result.resolvedCount, 3);
  assert.equal(result.patterns[0].matchedCount, 2);
  assert.equal(result.patterns[0].unmatchedCount, 1);
  assert.equal(result.promotion, "disabled");
});

test("feature validation describes repeated deterministic states", () => {
  const records = [
    record("2026-09-01T00:00:00Z", "negative", { selling: "accelerating" }),
    record("2026-09-01T00:01:00Z", "positive", { selling: "accelerating", terminalReturnPct: 25 }),
    record("2026-09-01T00:02:00Z", "negative", { selling: "accelerating", terminalReturnPct: -40 }),
    record("2026-09-01T00:03:00Z", "pump_then_collapse", { selling: "accelerating", terminalReturnPct: -70 })
  ];

  const groups = validateFeatureGroups(records, { minSupport: 3 });
  const selling = groups.find((row) => row.feature === "temporalSelling" && row.value === "accelerating");

  assert.ok(selling);
  assert.equal(selling.count, 4);
  assert.equal(selling.pumpThenCollapseRatePct, 25);
  assert.equal(selling.meanTerminalReturnPct, -26.25);
});

test("chronological holdout never promotes the test partition", () => {
  const records = [
    record("2026-09-01T00:00:00Z", "negative", { action: "SELL", terminalReturnPct: -80 }),
    record("2026-09-02T00:00:00Z", "negative", { action: "SELL", terminalReturnPct: -70 }),
    record("2026-09-03T00:00:00Z", "positive", { action: "SELL", terminalReturnPct: 40 }),
    record("2026-09-04T00:00:00Z", "positive", { action: "SELL", terminalReturnPct: 60 }),
    record("2026-09-05T00:00:00Z", "negative", { action: "HOLD", terminalReturnPct: -20 })
  ];

  const result = buildChronologicalHoldout(records, { trainFraction: 0.6, minTrainSupport: 2 });
  assert.equal(result.status, "chronological-holdout");
  assert.equal(result.trainCount, 3);
  assert.equal(result.testCount, 2);
  assert.equal(result.promotion, "disabled");
  assert.equal(result.testMetrics.positive, 1);
  assert.equal(result.testMetrics.negative, 1);
});

test("insufficient data does not fabricate a holdout", () => {
  const result = buildChronologicalHoldout([
    record("2026-09-01T00:00:00Z", "negative")
  ]);
  assert.equal(result.status, "insufficient-data");
  assert.equal(result.testCount, 0);
});
