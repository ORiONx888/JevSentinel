import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHelpMessage,
  buildLiveRiskAlert,
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


test("startup reports Telegram bot-to-bot readiness", async () => {
  const logs = [];
  const call = async (method) => {
    if (method === "getMe") return { id: 123, is_bot: true, username: "JevSentinelBot", can_read_all_group_messages: false, can_join_groups: true };
    if (method === "getWebhookInfo") return { url: "" };
    if (method === "getUpdates") return [];
    return { message_id: 99 };
  };
  let bot;
  bot = createTelegramBot({
    token: "test-token",
    pollIntervalMs: 0,
    call,
    logger: { log: (message) => { logs.push(message); if (message === "[jevsentinel-telegram] connected") bot.stop(); }, error: () => {} },
  });
  await bot.start();
  assert.ok(logs.includes("[jevsentinel-telegram] Telegram bot capabilities"));
  assert.ok(logs.includes("[jevsentinel-telegram] bot-to-bot prerequisite: enable Bot-to-Bot Communication Mode in @BotFather and ensure JevSentinel can receive group messages (admin or privacy mode disabled)"));
});


test("live risk alert is compact, token-first, and preserves token links", () => {
  const text = buildLiveRiskAlert({
    mint: "ABC123",
    symbol: "PUPPY",
    assessment: {
      answers: {
        urgency: { score: 1.84, choice: "immediate" },
        progression: { choice: "distribution" },
        deterioration: { value: "elevated" },
        coordinatedBehavior: { noul: true },
        retraceAlternative: { choice: "mixedEvidence" },
      },
    },
    state: {
      intelligence: [
        { fields: { sellerAcceleration: "increasing", liquidityVelocity: "deteriorating" } },
      ],
    },
    sourceMessageId: 42,
  });
  assert.match(text, /\$PUPPY: Urgency 1\.84 🔴/);
  assert.match(text, /Coordinated selling detected/);
  assert.match(text, /Distribution pattern developing/);
  assert.doesNotMatch(text, /Live CA-derived reassessment/);
  assert.match(text, /gmgn\.ai/);
  assert.match(text, /pump\.fun/);
});

test("live alert uses temporal acceleration for changing market context", () => {
  const text = buildLiveRiskAlert({
    mint: "ABC123",
    symbol: "PAIRPAD",
    assessment: {
      answers: {
        urgency: { score: 0.69, choice: "monitor" },
      },
    },
    state: {
      temporal: {
        acceleration: {
          selling: "increasing",
          liquidity: "deteriorating",
          price: "deteriorating",
          sellers: "increasing",
        },
      },
    },
  });
  assert.match(text, /Seller activity accelerating/);
  assert.match(text, /Liquidity deterioration increasing/);
  assert.match(text, /Price deterioration accelerating/);
  assert.doesNotMatch(text, /No material change detected/);
});

test("urgency dot follows the qualitative JEV urgency level", () => {
  const levels = [
    ["monitor", "🟢"],
    ["elevated", "🟡"],
    ["urgent", "🟠"],
    ["immediate", "🔴"],
  ];
  for (const [level, dot] of levels) {
    const text = buildLiveRiskAlert({
      mint: "ABC123",
      symbol: "TEST",
      assessment: { answers: { urgency: { score: 0.5, choice: level } } },
    });
    assert.match(text, new RegExp(dot));
  }
});

test("live alert falls back to a short monitoring line when evidence is unchanged", () => {
  const text = buildLiveRiskAlert({
    mint: "ABC123",
    symbol: "TEST",
    assessment: {
      answers: {
        urgency: { score: 0.75, choice: "monitor" },
        evidenceQuality: { choice: "strong" },
      },
    },
  });
  assert.match(text, /\$TEST: Urgency 0\.75 🟢/);
  assert.match(text, /Risk picture remains stable/);
  assert.ok(text.split("\\n").length <= 8);
});
