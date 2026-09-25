import test from "node:test";
import assert from "node:assert/strict";
import { buildCw2Observation, extractSolanaMint, isCw2Card } from "../src/cw2Monitor.js";

const MINT = "So11111111111111111111111111111111111111112";

test("CW2 detector only accepts CONVICTION PULSE CW2", () => {
  assert.equal(isCw2Card("CONVICTION PULSE CW2\n$TEST"), true);
  assert.equal(isCw2Card("VOLUME SPIKE\n$TEST"), false);
  assert.equal(isCw2Card("CONVICTION PULSE CW"), false);
});

test("CW2 parser extracts labelled CA and source metadata", () => {
  const observation = buildCw2Observation({
    text: `CONVICTION PULSE CW2\n$TEST\nCA: ${MINT}`,
    messageId: 77,
    chatId: -100123,
  });
  assert.equal(observation.mint, MINT);
  assert.equal(observation.symbol, "TEST");
  assert.equal(observation.sourceCard, "CW");
  assert.equal(observation.metadata.telegramMessageId, 77);
  assert.equal(observation.metadata.telegramChatId, "-100123");
});

test("mint extractor returns null when no Solana address is present", () => {
  assert.equal(extractSolanaMint("CONVICTION PULSE CW2\n$TEST\nno CA here"), null);
});
