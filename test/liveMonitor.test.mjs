import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceState } from "../src/evidence.js";
import { createLiveMonitor } from "../src/liveMonitor.js";

test("historical JEV verdicts are exposed as context", () => {
  const evidence = buildEvidenceState({}, { sampleCount: 3 }, [
    { verdict: { answers: { escalation: { noul: true }, dominantRisk: { choice: "flow" }, urgency: { score: "urgent" } } } },
    { verdict: { answers: { escalation: { noul: false }, dominantRisk: { choice: "market" }, urgency: { score: "monitor" } } } }
  ]);
  assert.equal(evidence.historicalIntelligence.priorAssessments, 2);
  assert.equal(evidence.historicalIntelligence.priorEscalations, 1);
  assert.deepEqual(evidence.historicalIntelligence.priorDominantRisks, ["flow", "market"]);
});

test("live monitor is bounded and seeds its first snapshot", async () => {
  let calls = 0;
  let received = 0;
  const monitor = createLiveMonitor({ intervalMs: 5, maxSnapshots: 2 });
  await new Promise((resolve, reject) => {
    monitor.start({
      mint: "MINT",
      initialState: { context: { observedAt: new Date().toISOString() } },
      run: async (history) => {
        calls += 1;
        assert.ok(history.length >= 1);
        return { state: { context: { observedAt: new Date().toISOString() } }, assessment: { answers: {} } };
      },
      onAssessment: async () => {
        received += 1;
        if (received === 1) setTimeout(resolve, 30);
      }
    });
  });
  assert.equal(calls, 1);
  assert.equal(monitor.size(), 0);
});
