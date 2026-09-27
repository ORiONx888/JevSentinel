import test from "node:test";
import assert from "node:assert/strict";
import { buildObservedOutcome } from "../src/outcomeCollector.js";

test("builds objective window metrics without inventing an outcome label", () => {
  const states = [
    { temporal: { latest: { price: 100, liquidity: 10000, observedAt: "2026-09-27T00:00:00Z" } } },
    { temporal: { latest: { price: 140, liquidity: 9000, observedAt: "2026-09-27T00:01:00Z" } } },
    { temporal: { latest: { price: 70, liquidity: 5000, observedAt: "2026-09-27T00:02:00Z" } } },
  ];
  const outcome = buildObservedOutcome({ snapshots: states });
  assert.equal(outcome.label, "unresolved");
  assert.equal(outcome.sampleCount, 3);
  assert.equal(outcome.entryPrice, 100);
  assert.equal(outcome.terminalPrice, 70);
  assert.equal(outcome.peakGainPct, 40);
  assert.equal(outcome.terminalReturnPct, -30);
  assert.equal(outcome.maxDrawdownPct, -50);
  assert.equal(outcome.entryLiquidityUsd, 10000);
  assert.equal(outcome.terminalLiquidityUsd, 5000);
  assert.equal(outcome.liquidityChangeUsd, -5000);
  assert.equal(outcome.liquidityChangePct, -50);
  assert.equal(outcome.completedAt !== undefined, true);
  assert.equal(outcome.resolvedAt, undefined);
  assert.equal(outcome.source, "live-monitor-window");
});
