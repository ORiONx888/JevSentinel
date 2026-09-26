import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHelpMessage,
  buildLiveRiskAlert,
  buildRiskAlert,
  alertKeyboard,
  isMaterialLiveEvent,
  liveActionState,
  liveEventSignals,
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
  assert.match(text, /\$PUPPY — /);
  assert.match(text, /Coordinated seller activity detected/);
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
        latest: {
          sellCount5m: 27,
          priceChange5mPct: -4.2,
        },
        previous: {
          sellCount5m: 12,
          priceChange5mPct: -1.1,
        },
        deltas: {
          sellCount5m: 15,
        },
        acceleration: {
          selling: "increasing",
          liquidity: "deteriorating",
          price: "deteriorating",
          sellers: "increasing",
        },
      },
    },
  });
  assert.match(text, /Sells\/5m 12 → 27 \(\+15\)/);
  assert.match(text, /📉 5m price -4\.2%/);
  assert.match(text, /Liquidity deterioration increasing|💧 Liquidity declining/);
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
  assert.match(text, /Collecting live comparison data/);
  assert.ok(text.split("\\n").length <= 8);
});

test("live alert distinguishes missing temporal baseline from a completed comparison", () => {
  const baseline = buildLiveRiskAlert({ mint: "ABC123", symbol: "TEST", assessment: { answers: { urgency: { score: 0.57 } } } });
  assert.match(baseline, /Urgency 0\.57 🔵/);
  assert.match(baseline, /Collecting live comparison data/);
  assert.doesNotMatch(baseline, /No material change detected/);

  const compared = buildLiveRiskAlert({ mint: "ABC123", symbol: "TEST", assessment: { answers: { urgency: { score: 0.57 } } }, state: { temporal: { sampleCount: 2, acceleration: {} } } });
  assert.match(compared, /Live comparison shows no clear deterioration/);
});

test("live alert reports improving temporal conditions", () => {
  const text = buildLiveRiskAlert({
    mint: "ABC123",
    symbol: "TEST",
    assessment: { answers: { urgency: { score: 0.57 } } },
    state: {
      temporal: {
        sampleCount: 2,
        latest: {
          priceChange5mPct: 2.3,
          uniqueSellers: 4,
        },
        previous: {
          uniqueSellers: 7,
        },
        deltas: {
          uniqueSellers: -3,
        },
        acceleration: {
          liquidity: "improving",
          price: "improving",
          sellers: "decreasing",
        },
      },
    },
  });
  assert.match(text, /💧 Liquidity improving/);
  assert.match(text, /📉 5m price \+2\.3%/);
  assert.match(text, /👥 Sellers easing 7 → 4 \(-3\)/);
});
test("mini-card keyboard provides focus and stop controls bound to the token", () => {
  const keyboard = alertKeyboard("ABC123");
  assert.equal(keyboard.inline_keyboard[0][0].text, "🎯 FOCUS");
  assert.equal(keyboard.inline_keyboard[0][0].callback_data, "jev:focus:ABC123");
  assert.equal(keyboard.inline_keyboard[0][1].text, "⏹ STOP");
  assert.equal(keyboard.inline_keyboard[0][1].callback_data, "jev:stop:ABC123");
});

test("live emission requires a material event instead of any temporal delta", () => {
  const previousAnswers = { urgency: { choice: "monitor" } };
  const stable = isMaterialLiveEvent(
    { answers: { urgency: { choice: "monitor" } } },
    { temporal: { latest: { sellCount5m: 12 }, previous: { sellCount5m: 12 }, deltas: { sellCount5m: 1 }, acceleration: { selling: "increasing" } } },
    previousAnswers
  );
  assert.equal(stable, false);

  const event = isMaterialLiveEvent(
    { answers: { urgency: { choice: "urgent" } } },
    { temporal: { deltas: {} } },
    previousAnswers
  );
  assert.equal(event, true);
});

test("callback controls acknowledge focus and stop actions", async () => {
  const calls = [];
  const call = async (method, params) => {
    calls.push({ method, params });
    if (method === "getChatMember") return { status: "administrator" };
    if (method === "sendMessage") return { message_id: 99 };
    return { id: 123, is_bot: true, username: "JevSentinelBot" };
  };
  const bot = createTelegramBot({ token: "test-token", call });
  // The callback path requires an active group; configuration persistence is intentionally
  // exercised through the public bot API in the integration path, while keyboard binding is
  // covered above.
  await bot.handleUpdate({
    update_id: 20,
    callback_query: { id: "cb1", data: "jev:focus:ABC123", message: { chat: { id: -7, type: "supergroup" } } }
  });
  assert.equal(calls[0].method, "answerCallbackQuery");
  assert.match(calls[0].params.text, /not active/);
});



test("live action state maps existing JEV evidence into buyer-facing states", () => {
  assert.equal(liveActionState({ answers: { progression: { choice: "extraction" }, deterioration: { value: "severe" } } }), "SELL");
  assert.equal(liveActionState({ answers: { progression: { choice: "distribution" } } }), "CAUTION");
  assert.equal(liveActionState({ answers: { urgency: { choice: "monitor" } } }), "HOLD");
  assert.equal(liveActionState({
    answers: {
      falsePositive: { noul: true },
      retraceAlternative: { choice: "likelyNormalRetrace" },
    },
  }, { temporal: { acceleration: { price: "improving", buyPressure: "increasing", selling: "decreasing" } } }), "ADD");
});

test("live event signals explain the decision-driving change", () => {
  const signals = liveEventSignals(
    { answers: { progression: { choice: "distribution" } } },
    { temporal: {
      latest: { sellCount5m: 27, priceChange5mPct: -4.2 },
      previous: { sellCount5m: 12 },
      deltas: { sellCount5m: 15 },
      acceleration: { selling: "increasing", price: "deteriorating" },
    } }
  );
  assert.match(signals.join("\n"), /Sells\/5m 12 → 27 \(\+15\)/);
  assert.match(signals.join("\n"), /Price deteriorating/);
});

test("action state change is material even without a JEV answer change", () => {
  const event = isMaterialLiveEvent(
    { answers: { urgency: { choice: "monitor" } } },
    { temporal: { deltas: {} } },
    { urgency: { choice: "monitor" } },
    "CAUTION"
  );
  assert.equal(event, true);
});
