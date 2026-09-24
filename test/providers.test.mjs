import test from "node:test";
import assert from "node:assert/strict";
import { createNativeRiskProvider, createTransferFlowProvider } from "../src/index.js";

test("native risk provider derives security, market, and wallet risk signals locally", async () => {
  const provider = createNativeRiskProvider();
  const result = await provider.scan({
    security: {
      honeypot: true,
      authority: { mintAuthority: true },
      liquidity: { changePct: -18 },
      riskFlags: ["lp-risk"]
    },
    market: { priceVelocity: -0.2, sellUsd: 800, buyUsd: 200 },
    wallets: { sellerAcceleration: 3, concentration: 42 }
  });

  assert.equal(result.honeypot, true);
  assert.equal(result.authority.mintAuthority, true);
  assert.ok(result.riskFlags.includes("honeypot"));
  assert.ok(result.riskFlags.includes("liquidity-declining"));
  assert.ok(result.riskFlags.includes("seller-acceleration"));
  assert.equal(result.wallet.concentration, 42);
  assert.equal(result.behavior.buySellRatio, null);
});

test("transfer-flow provider detects a short transfer burst and watched-wallet direction", async () => {
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
