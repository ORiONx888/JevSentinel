import test from "node:test";
import assert from "node:assert/strict";
import { buildCw2Observation } from "../src/cw2Monitor.js";

const CARD = `🧪⚡🏆 CONVICTION PULSE CW2 🏆⚡🧪

🪙 $CTNT
🎯 SCORE: 95/125 (base 78)
🕐 Age: 10m
💰 MC: $47.6K
🧠 Buys: 26 SOL (16)
📊 Vol 5m: $44.4K
🧪 Add-ons: B/S+4 · Turn+5 · Social+3 · Smart+5
🛡 RUG CHECKS
🛡 Safety: 99/100 🟢 (RugCheck · 0 risks)
🔐 Mint auth: ✅ Revoked
🔒 Freeze auth: ✅ Revoked
👥 Top-10 hold: ⚠️ 48.6%
🔥 LP burn: ⚠️ none
🏷 Metadata: ✅ Clean
👤 Dev's last: Index · ATH $416.5K
📋 CA: Fn9RhHqCxrG9hP67LPX8dyBb12Vy1MYL8Y7eYa4Cpump`;

test("CW2 parser wires card evidence into observation", () => {
  const observation = buildCw2Observation({ text: CARD, messageId: 8186, chatId: -100 });
  assert.equal(observation.symbol, "CTNT");
  assert.equal(observation.market.marketCapUsd, 47600);
  assert.equal(observation.market.buySol, 26);
  assert.equal(observation.market.buyCount, 16);
  assert.equal(observation.market.volume5mUsd, 44400);
  assert.equal(observation.market.ageMinutes, 10);
  assert.equal(observation.wallets.concentration, 48.6);
  assert.equal(observation.wallets.devLastAthUsd, 416500);
  assert.equal(observation.security.safetyScore, 99);
  assert.equal(observation.security.rugCheckRiskCount, 0);
  assert.equal(observation.security.authority.mintAuthority, false);
  assert.equal(observation.security.authority.freezeAuthority, false);
  assert.ok(observation.security.riskFlags.includes("high-top10-concentration"));
  assert.ok(observation.security.riskFlags.includes("lp-burn-absent"));
});

