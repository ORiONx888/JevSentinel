import test from "node:test";
import assert from "node:assert/strict";
import { createLiveEventGate } from "../src/liveEventGate.js";

function state({ action = "HOLD", price = 1, liquidity = 20_000, volume = 10_000, priceChange5mPct = 0, sellCount5m = 10, buySellRatio5m = 0.6, uniqueSellers = 2, acceleration = {} } = {}) {
  return {
    trajectory: { action },
    temporal: {
      latest: { observedAt: new Date().toISOString(), price, liquidity, volume, priceChange5mPct, sellCount5m, buySellRatio5m, uniqueSellers },
      acceleration,
    },
  };
}

const assessment = (answers = {}) => ({ answers: { urgency: { choice: "monitor" }, evidenceQuality: { choice: "strong" }, ...answers } });

test("primes without emitting a duplicate live card", () => {
  const gate = createLiveEventGate({ heartbeatMs: 0 });
  assert.equal(gate.prime(assessment(), state()).emit, false);
  assert.equal(gate.evaluate({ assessment: assessment(), state: state() }).emit, false);
});

test("emits immediately on action transition", () => {
  const gate = createLiveEventGate({ heartbeatMs: 0 });
  gate.prime(assessment(), state({ action: "HOLD" }));
  const result = gate.evaluate({ assessment: assessment(), state: state({ action: "CAUTION" }) });
  assert.equal(result.emit, true);
  assert.equal(result.reason, "action-transition");
});

test("does not repeat the same deterioration every tick", () => {
  const gate = createLiveEventGate({ heartbeatMs: 0 });
  gate.prime(assessment(), state({ acceleration: { price: "stable" } }));
  const first = gate.evaluate({ assessment: assessment(), state: state({ acceleration: { price: "deteriorating" } }) });
  const second = gate.evaluate({ assessment: assessment(), state: state({ acceleration: { price: "deteriorating" }, price: 0.99 }) });
  assert.equal(first.emit, true);
  assert.equal(second.emit, false);
});

test("emits again when deterioration materially changes after the prior event", () => {
  const gate = createLiveEventGate({ heartbeatMs: 0 });
  gate.prime(assessment(), state({ price: 1 }));
  const first = gate.evaluate({ assessment: assessment(), state: state({ price: 1, acceleration: { price: "deteriorating" } }) });
  const second = gate.evaluate({ assessment: assessment(), state: state({ price: 0.94, acceleration: { price: "deteriorating" } }) });
  assert.equal(first.emit, true);
  assert.equal(second.emit, true);
  assert.equal(second.reason, "material-telemetry-change");
});

test("emits meaningful improvement immediately", () => {
  const gate = createLiveEventGate({ heartbeatMs: 0 });
  gate.prime(assessment(), state({ acceleration: { price: "deteriorating" } }));
  const result = gate.evaluate({ assessment: assessment(), state: state({ acceleration: { price: "improving" } }) });
  assert.equal(result.emit, true);
  assert.equal(result.kind, "improvement");
});

test("suppresses insignificant telemetry changes", () => {
  const gate = createLiveEventGate({ heartbeatMs: 0 });
  gate.prime(assessment(), state({ price: 1, volume: 10_000 }));
  const result = gate.evaluate({ assessment: assessment(), state: state({ price: 0.999, volume: 10_100 }) });
  assert.equal(result.emit, false);
});

test("heartbeat is low frequency and distinct", () => {
  let now = 0;
  const gate = createLiveEventGate({ heartbeatMs: 120_000, now: () => now });
  gate.prime(assessment(), state());
  now = 119_999;
  assert.equal(gate.evaluate({ assessment: assessment(), state: state() }).emit, false);
  now = 120_000;
  const result = gate.evaluate({ assessment: assessment(), state: state() });
  assert.equal(result.emit, true);
  assert.equal(result.kind, "heartbeat");
  assert.match(result.events[0], /heartbeat/i);
});

test("provider failure does not create false deterioration", () => {
  const gate = createLiveEventGate({ heartbeatMs: 0 });
  gate.prime(assessment(), state({ price: 1 }));
  const failed = gate.evaluate({
    assessment: assessment(),
    state: { trajectory: { action: "HOLD" }, temporal: { latest: {}, acceleration: { price: "stable" } } },
    intelligence: { "token-research": { available: false } },
  });
  assert.equal(failed.emit, false);
});

test("recovery from a provider failure can emit fresh telemetry", () => {
  const gate = createLiveEventGate({ heartbeatMs: 0 });
  gate.prime(assessment(), state({ price: 1 }));
  gate.evaluate({
    assessment: assessment(),
    state: { trajectory: { action: "HOLD" }, temporal: { latest: {}, acceleration: {} } },
    intelligence: { "token-research": { available: false } },
  });
  const recovered = gate.evaluate({
    assessment: assessment(),
    state: state({ price: 0.94, acceleration: { price: "deteriorating" } }),
    intelligence: { "token-research": { available: true } },
  });
  assert.equal(recovered.emit, true);
});
