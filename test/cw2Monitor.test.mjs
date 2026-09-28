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
  assert.equal(observation.market, undefined);
  assert.equal(observation.security, undefined);
  assert.equal(observation.wallets, undefined);
  assert.equal(observation.transfers, undefined);
});


test("CW2 parser extracts ticker from labelled and header formats", () => {
  assert.equal(buildCw2Observation({
    text: "CONVICTION PULSE CW2\nTICKER: $BONK\nCA: Fn9RhHqCxrG9hP67LPX8dyBb12Vy1MYL8Y7eYa4Cpump",
    messageId: 1, chatId: -100
  }).symbol, "BONK");
  assert.equal(buildCw2Observation({
    text: "CONVICTION PULSE CW2 — PEPE\nCA: Fn9RhHqCxrG9hP67LPX8dyBb12Vy1MYL8Y7eYa4Cpump",
    messageId: 2, chatId: -100
  }).symbol, "PEPE");
});
