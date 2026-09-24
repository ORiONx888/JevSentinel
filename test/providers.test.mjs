import test from "node:test";
import assert from "node:assert/strict";
import { createDrainBrainProvider, createTransferFlowProvider } from "../src/index.js";

test("behavior provider maps the documented scan response without exposing provider names to state", async () => {
  const calls = [];
  const provider = createDrainBrainProvider({
    apiKey: "test-key",
    baseUrl: "https://example.test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        mint: "mint1",
        score: 91,
        riskLevel: "CRITICAL",
        isRug: true,
        confidence: 0.97,
        breakdown: { authority: 15, behavior: 25 },
        riskFlags: ["LP_NOT_LOCKED"],
        temporalScore: 85
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const result = await provider.scan({ mint: "mint1" });
  assert.equal(result.score, 91);
  assert.equal(result.breakdown.behavior, 25);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/scan$/);
  assert.equal(JSON.parse(calls[0].options.body).mint, "mint1");
});

test("behavior provider caches the same mint for the configured window", async () => {
  let calls = 0;
  const provider = createDrainBrainProvider({
    apiKey: "test-key",
    baseUrl: "https://example.test",
    cacheMs: 60_000,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ mint: "mint1", score: 10 }), { status: 200 });
    }
  });
  await provider.scan({ mint: "mint1" });
  await provider.scan({ mint: "mint1" });
  assert.equal(calls, 1);
});

test("transfer-flow provider detects a short burst and watched-wallet direction", async () => {
  const now = "2026-09-24T12:00:05.000Z";
  const provider = createTransferFlowProvider({ windowMs: 5_000 });
  const result = await provider.scan({
    observedAt: now,
    wallets: { watched: ["w1"] },
    transfers: {
      events: [
        { observedAt: "2026-09-24T12:00:02.000Z", sender: "w1", receiver: "x", amount: 600 },
        { observedAt: "2026-09-24T12:00:04.000Z", sender: "w2", receiver: "x", amount: 500 }
      ]
    }
  });
  assert.equal(result.burst, true);
  assert.equal(result.transferCount, 2);
  assert.equal(result.totalAmount, 1100);
  assert.equal(result.watchedMatches, 1);
  assert.equal(result.direction, "outbound");
});

test("transfer-flow provider ignores events outside its bounded window", async () => {
  const provider = createTransferFlowProvider({ windowMs: 5_000 });
  const result = await provider.scan({
    observedAt: "2026-09-24T12:00:10.000Z",
    transfers: { events: [
      { observedAt: "2026-09-24T12:00:00.000Z", sender: "w1", receiver: "x", amount: 1000 }
    ]}
  });
  assert.equal(result.burst, false);
  assert.equal(result.transferCount, 0);
});
