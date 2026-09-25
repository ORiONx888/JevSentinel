import test from "node:test";
import assert from "node:assert/strict";
import { buildCw2Observation } from "../src/cw2Monitor.js";

const CARD = `🧪⚡🏆 CONVICTION PULSE CW2 🏆⚡🧪
🪙 $CTNT
🛡 Safety: 99/100
👥 Top-10 hold: 48.6%
📋 CA: Fn9RhHqCxrG9hP67LPX8dyBb12Vy1MYL8Y7eYa4Cpump`;

test("CW2 parser passes only trigger metadata and CA", () => {
  const observation = buildCw2Observation({ text: CARD, messageId: 8186, chatId: -100 });
  assert.equal(observation.symbol, "CTNT");
  assert.equal(observation.mint, "Fn9RhHqCxrG9hP67LPX8dyBb12Vy1MYL8Y7eYa4Cpump");
  assert.equal(observation.sourceCard, "CW");
  assert.equal(observation.metadata.sourceLabel, "CONVICTION PULSE CW2");
  assert.deepEqual(observation.market, {});
  assert.deepEqual(observation.security, {});
  assert.deepEqual(observation.wallets, {});
  assert.deepEqual(observation.transfers, {});
});
