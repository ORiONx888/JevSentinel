import test from "node:test";
import assert from "node:assert/strict";
import { buildEarlyEntryObservation, isEarlyEntryCard } from "../src/earlyEntryMonitor.js";

const CARD = [
  "⚡🏆 EARLY ENTRY EXPERIMENT 🏆⚡ 🕵️ 0 KOLs.",
  "🚫 SG ONLY / NO AUTO-BUY / NOT PAID / NOT PUBLIC",
  "🪙 $JEANPHIL",
  "🤖 JEV: PASS (0.38)",
  "🕐 Age: 12m",
  "💰 MC: $2.1M",
  "🧠 Buys: 2 SOL",
  "📊 Vol 5m: $605",
  "💧 Liquidity: $131.3K",
  "🟢 Control: NOT_SEEN",
  "🧭 Alignment: PASS",
  "🛡️ Risk: UNCLASSIFIED",
  "📋 CA: DuMrD5MejgB6tCJE7Rfcpcfa1p7WJ1ZczZU7RMvpump",
].join("\n");

test("accepts the production EARLY ENTRY EXPERIMENT JEV card", () => {
  assert.equal(isEarlyEntryCard(CARD), true);
  const observation = buildEarlyEntryObservation({ text: CARD, messageId: 77, chatId: -1004483915430 });
  assert.equal(observation?.mint, "DuMrD5MejgB6tCJE7Rfcpcfa1p7WJ1ZczZU7RMvpump");
  assert.equal(observation?.symbol, "JEANPHIL");
  assert.equal(observation?.sourceCard, "EARLY ENTRY EXPERIMENT");
});

test("rejects unrelated cards", () => {
  assert.equal(isEarlyEntryCard("CONVICTION PULSE CW2 $TEST CA: So11111111111111111111111111111111111111112"), false);
});
