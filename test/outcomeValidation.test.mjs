import test from "node:test";
import assert from "node:assert/strict";
import { buildOutcomeValidation, normalizeOutcome, validateOutcomeForTelemetry } from "../src/outcomeValidation.js";

test("normalizes a labelled outcome without inventing missing values", () => {
  const outcome = normalizeOutcome({ label: "pump_then_collapse", peakGainPct: "145", terminalReturnPct: "-73" });
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
