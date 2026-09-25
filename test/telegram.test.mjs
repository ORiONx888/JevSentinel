import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHelpMessage,
  buildRiskAlert,
  buildStartMessage,
  buildStatusMessage,
  createTelegramBot,
  tokenLinks,
} from "../src/telegram.js";

test("token links use the supplied mint", () => {
  const links = tokenLinks("ABC123");
  assert.equal(links[0].url, "https://gmgn.ai/sol/token/ABC123");
  assert.equal(links[1].url, "https://pump.fun/coin/ABC123");
});

test("risk alert identifies token, source and links", () => {
  const text = buildRiskAlert({
    mint: "ABC123",
    symbol: "TEST",
    sourceCard: "CW",
    signals: ["seller acceleration", "liquidity deterioration"],
    sourceMessageId: 42,
  });
  assert.match(text, /\$TEST/);
  assert.match(text, /CW/);
  assert.match(text, /ABC123/);
  assert.match(text, /gmgn\.ai/);
  assert.match(text, /pump\.fun/);
  assert.match(text, /42/);
});

test("setup/status/help messages are available", () => {
  assert.match(buildStartMessage(), /JevSentinel/);
  assert.match(buildStatusMessage(), /JevSentinel Status/);
  assert.match(buildStatusMessage({ configured: false, mode: "OFF" }), /NOT CONFIGURED/);
  assert.match(buildStatusMessage({ configured: true, mode: "LOG-ONLY", cards: ["CONVICTION PULSE CW2"] }), /CONFIGURED/);
  assert.match(buildHelpMessage(), /JevSentinel Help/);
  const help = buildHelpMessage();
  assert.match(help, /\/jevon/);
  assert.match(help, /\/jevoff/);
  assert.match(help, /\/jevstatus/);
  assert.match(help, /\/jevhelp/);
  assert.match(help, /CONVICTION PULSE CW2/);
  assert.match(help, /LOG-ONLY/);
  assert.match(help, /No trading or auto-sell/);
});

test("bot handles start, status and test without a real Telegram call", async () => {
  const calls = [];
  const call = async (method, params) => {
    calls.push({ method, params });
    return method === "getUpdates" ? [] : method === "sendMessage" ? { message_id: 99 } : { id: 123, is_bot: true, username: "JevSentinelBot" };
  };
  const bot = createTelegramBot({ token: "test-token", call });
  await bot.handleUpdate({ update_id: 1, message: { message_id: 10, chat: { id: 7 }, text: "/start" } });
  await bot.handleUpdate({ update_id: 2, message: { message_id: 11, chat: { id: 7 }, text: "/jevstatus" } });
  await bot.handleUpdate({ update_id: 3, message: { message_id: 12, chat: { id: 7 }, text: "/jevtest" } });
  await bot.handleUpdate({ update_id: 4, message: { message_id: 13, chat: { id: -7, type: "supergroup" }, text: "/jevtest" } });
  assert.equal(calls.length, 4);
  assert.equal(calls[2].method, "sendMessage");
  assert.equal(calls[2].params.reply_to_message_id, 12);
  assert.equal(calls[3].params.reply_to_message_id, 13);
});
