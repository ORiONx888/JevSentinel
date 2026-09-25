import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { createJevEvaluator } from "./jev.js";
import { createJevSentinel } from "./engine.js";
import { createNativeRiskProvider } from "./providers/nativeRisk.js";
import { createTransferFlowProvider } from "./providers/transferFlow.js";
import { buildCw2Observation } from "./cw2Monitor.js";

const API_ROOT = "https://api.telegram.org";
const GROUP_KEY_PATTERN = /^[A-Za-z0-9._-]{20,300}$/;

export function telegramConfig(token = process.env.TELEGRAM_BOT_TOKEN) {
  if (!token || !token.trim()) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return { token: token.trim(), baseUrl: `${API_ROOT}/bot${token.trim()}` };
}

export async function telegramCall(method, params = {}, { token, fetchImpl = fetch, timeoutMs = 35_000 } = {}) {
  const cfg = telegramConfig(token);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${cfg.baseUrl}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(`Telegram ${method} failed`);
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

export function tokenLinks(mint) {
  const value = String(mint ?? "").trim();
  if (!value) return [];
  return [
    { label: "GMGN", url: `https://gmgn.ai/sol/token/${encodeURIComponent(value)}` },
    { label: "Pump.fun", url: `https://pump.fun/coin/${encodeURIComponent(value)}` },
  ];
}

export function buildRiskAlert({
  mint,
  symbol = "UNKNOWN",
  sourceCard = "UNKNOWN",
  classification = "POSSIBLE RUG RISK APPROACHING",
  summary = "Risk conditions are developing. Monitoring closely.",
  signals = [],
  sourceMessageId = null,
}) {
  const safeSignals = Array.isArray(signals) ? signals.filter(Boolean).slice(0, 6) : [];
  const lines = [
    `🛡️ <b>JevSentinel — ${escapeHtml(classification)}</b>`,
    "",
    `<b>$${escapeHtml(symbol)}</b>`,
    `Source: <b>${escapeHtml(sourceCard)}</b>`,
    `Mint: <code>${escapeHtml(mint)}</code>`,
    "",
    escapeHtml(summary),
  ];
  if (safeSignals.length) lines.push("", "<b>Risk indicators</b>", ...safeSignals.map((s) => `• ${escapeHtml(s)}`));
  if (sourceMessageId != null) lines.push("", `Source message: <code>${escapeHtml(sourceMessageId)}</code>`);
  lines.push("", tokenLinks(mint).map((x) => `<a href="${x.url}">${x.label}</a>`).join("  "));
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildStartMessage({ group = false } = {}) {
  if (group) {
    return [
      "🛡️ <b>JevSentinel</b>",
      "",
      "Send your JEV API key as the next message in this group.",
      "It will be captured immediately and the key message will be deleted.",
      "",
      "Only <b>CONVICTION PULSE CW2</b> cards are monitored in this test.",
      "The key itself is never written to ordinary logs.",
    ].join("\n");
  }
  return [
    "🛡️ <b>JevSentinel</b>",
    "",
    "Real-time token risk monitoring is ready.",
    "",
    "<b>Commands</b>",
    "/jevstatus — bot and JEV status",
    "/jevon — turn CW2 monitoring on",
    "/jevoff — turn CW2 monitoring off",
    "/jevtest — send a safe test risk alert",
    "/jevhelp — show help",
    "",
    "For the current test, add JevSentinel to the target group and activate CW2 monitoring there.",
  ].join("\n");
}

export function buildStatusMessage({ connected = false, configured = false, mode = "OFF", cards = [] } = {}) {
  return [
    "🛡️ <b>JevSentinel Status</b>",
    "",
    `Bot: <b>${connected ? "CONNECTED" : "DISCONNECTED"}</b>`,
    `JEV: <b>${configured ? "CONFIGURED" : "NOT CONFIGURED"}</b>`,
    `Mode: <b>${escapeHtml(mode)}</b>`,
    `Cards: <b>${cards.length ? cards.map(escapeHtml).join(" • ") : "NONE CONNECTED"}</b>`,
  ].join("\n");
}

export function buildHelpMessage() {
  return [
    "🛡️ <b>JevSentinel Help</b>",
    "",
    "<b>Group setup</b>",
    "Send a valid JEV API key as a message in the group. The bot deletes the key message immediately, verifies the key, and activates monitoring.",
    "",
    "<b>Commands</b>",
    "/jevhelp — show this help and available commands",
    "/jevstatus — show whether JEV is configured and monitoring is ON/OFF",
    "/jevon — turn CW2 monitoring ON (group admins only)",
    "/jevoff — turn CW2 monitoring OFF (group admins only)",
    "/jevtest — send a delivery test (private chat)",
    "",
    "<b>What is monitored</b>",
    "CONVICTION PULSE CW2 cards only.",
    "Other VolSpike cards are ignored during this test.",
    "",
    "<b>Mode</b>",
    "LOG-ONLY — JEVSentinel analyzes risk and sends an alert. No trading or auto-sell actions are performed.",
  ].join("\n");
}

function looksLikeApiKey(text) {
  return GROUP_KEY_PATTERN.test(String(text ?? "").trim());
}

async function validateJevKey(apiKey) {
  const client = new TypeSafeClient({ apiKey, logLevel: "error" });
  await client.systemOne({
    state: { document: "JevSentinel key validation. No token assessment." },
    questions: { reachable: noul("Is the TypeSafe/Jev API request valid and reachable?") },
  });
  return client;
}

function createGroupRuntime(apiKey) {
  const client = new TypeSafeClient({ apiKey, logLevel: "error" });
  const telemetry = {
    records: [],
    append(record) { this.records.push(record); },
  };
  const evaluator = createJevEvaluator({ client });
  const sentinel = createJevSentinel({
    providers: [createNativeRiskProvider(), createTransferFlowProvider()],
    evaluator,
    telemetry,
  });
  return { client, sentinel, telemetry, history: new Map() };
}

function answerSummary(assessment) {
  const answers = assessment?.answers ?? {};
  const escalation = answers.escalation?.noul;
  const urgency = answers.urgency?.score ?? answers.urgency?.value ?? answers.urgency?.choice;
  const dominant = answers.dominantRisk?.choice;
  if (escalation === true) return { classification: "RISK ATTENTION ESCALATED", summary: `JEV escalated this CW2 token for active risk attention.${dominant ? ` Dominant risk: ${dominant}.` : ""}`, signals: [urgency ? `Urgency: ${urgency}` : "Escalation: true"] };
  return { classification: "CW2 JEV ASSESSMENT — MONITORING", summary: "JEV did not escalate this token based on the supplied evidence.", signals: [urgency ? `Urgency: ${urgency}` : "Escalation: false"] };
}

export function createTelegramBot({ token = process.env.TELEGRAM_BOT_TOKEN, call = telegramCall, pollIntervalMs = 1_000, logger = console } = {}) {
  if (!token?.trim()) throw new Error("TELEGRAM_BOT_TOKEN is required");
  let offset = 0;
  let running = false;
  let botId = null;
  const groups = new Map();
  const processed = new Set();

  async function sendMessage(chatId, text, extra = {}) {
    return call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    }, { token });
  }

  async function deleteMessage(chatId, messageId) {
    return call("deleteMessage", { chat_id: chatId, message_id: messageId }, { token });
  }

  async function activateGroup(chatId, apiKey, message) {
    let client;
    try {
      client = await validateJevKey(apiKey);
      groups.set(String(chatId), { apiKey, runtime: createGroupRuntime(apiKey), activatedAt: new Date().toISOString(), enabled: true });
    } catch {
      await sendMessage(chatId, "❌ <b>JEV key could not be verified.</b>\n\nThe key was not retained. Please send a valid key.");
      return false;
    }

    await sendMessage(chatId, "🛡️ <b>JEV verified — monitoring ACTIVE.</b>\n\nMonitoring: <b>CONVICTION PULSE CW2 only</b>\nMode: <b>LOG-ONLY</b>");
    return Boolean(client && message);
  }

  async function handleGroupMessage(message) {
    const chatId = String(message.chat.id);
    const textValue = message.text?.trim() ?? "";
    const existing = groups.get(chatId);

    if (!existing && looksLikeApiKey(textValue) && !isLikelyCard(textValue)) {
      // Delete before validation so the credential is not left visible in the group.
      try { await deleteMessage(message.chat.id, message.message_id); } catch (error) {
        logger.error?.("[jevsentinel-telegram] key message deletion failed");
        await sendMessage(message.chat.id, "⚠️ <b>Could not securely remove the key message.</b> Please delete it manually and do not resend it until the bot has delete-message permission.");
        return;
      }
      await activateGroup(message.chat.id, textValue, message);
      return;
    }

    if (!existing || !textValue || existing.enabled === false) return;

    const observation = buildCw2Observation({
      text: textValue,
      messageId: message.message_id,
      chatId: message.chat.id,
    });
    if (!observation) return;

    const runtime = existing.runtime;
    const key = `${chatId}:${message.message_id}`;
    if (processed.has(key)) return;
    processed.add(key);

    try {
      const history = runtime.history.get(observation.mint) ?? [];
      const result = await runtime.sentinel.assess(observation, history);
      runtime.history.set(observation.mint, [...history, result.state].slice(-5));
      const summary = answerSummary(result.assessment);
      await sendMessage(message.chat.id, buildRiskAlert({
        mint: observation.mint,
        symbol: observation.symbol,
        sourceCard: "CONVICTION PULSE CW2",
        classification: summary.classification,
        summary: summary.summary,
        signals: summary.signals,
        sourceMessageId: message.message_id,
      }), { reply_to_message_id: message.message_id });
      logger.log?.("[jevsentinel-telegram] CW2 assessment completed");
    } catch (error) {
      logger.error?.("[jevsentinel-telegram] CW2 assessment failed");
      await sendMessage(message.chat.id, "⚠️ <b>JevSentinel could not complete the CW2 assessment.</b> No trading action was taken.", { reply_to_message_id: message.message_id });
    }
  }

  async function isGroupAdmin(chatId, userId) {
    try {
      const member = await call("getChatMember", { chat_id: chatId, user_id: userId }, { token });
      return member?.status === "creator" || member?.status === "administrator";
    } catch (error) {
      logger.error?.("[jevsentinel-telegram] admin check failed");
      return false;
    }
  }

  async function setGroupMonitoring(chatId, enabled, userId) {
    const group = groups.get(String(chatId));
    if (!group) {
      await sendMessage(chatId, "⚪ <b>JEV is not configured.</b> Send a valid JEV API key first.");
      return false;
    }
    if (!(await isGroupAdmin(chatId, userId))) {
      await sendMessage(chatId, "⛔ <b>Only a group administrator can change JevSentinel monitoring.</b>");
      return false;
    }
    group.enabled = enabled;
    await sendMessage(chatId, enabled
      ? "🟢 <b>JevSentinel monitoring ON.</b>\n\nMonitoring: <b>CONVICTION PULSE CW2 only</b>"
      : "⚪ <b>JevSentinel monitoring OFF.</b>\n\nNo CW2 cards will be processed until /jevon is used.");
    return true;
  }

  async function handleUpdate(update) {
    const message = update?.message;
    const textValue = message?.text?.trim();
    if (!message) return;
    const chatId = message.chat.id;
    const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";

    if (message.new_chat_members?.some((member) => member.id === botId)) {
      if (isGroup) await sendMessage(chatId, buildStartMessage({ group: true }));
      return;
    }

    if (!textValue) return;

    if (isGroup) {
      if (textValue === "/start" || textValue.startsWith("/start@")) {
        await sendMessage(chatId, buildStartMessage({ group: true }));
        return;
      }
      if (textValue === "/jevstatus" || textValue.startsWith("/jevstatus@")) {
        const group = groups.get(String(chatId));
        await sendMessage(chatId, buildStatusMessage({
          connected: true,
          configured: Boolean(group),
          mode: group ? (group.enabled === false ? "OFF" : "LOG-ONLY") : "OFF",
          cards: group ? ["CONVICTION PULSE CW2"] : [],
        }));
        return;
      }
      if (textValue === "/jevon" || textValue.startsWith("/jevon@")) {
        await setGroupMonitoring(chatId, true, message.from?.id);
        return;
      }
      if (textValue === "/jevoff" || textValue.startsWith("/jevoff@")) {
        await setGroupMonitoring(chatId, false, message.from?.id);
        return;
      }
      if (textValue === "/jevhelp" || textValue.startsWith("/jevhelp@")) {
        await sendMessage(chatId, buildHelpMessage());
        return;
      }
      if (textValue === "/jevtest" || textValue.startsWith("/jevtest@")) {
        await sendMessage(chatId, buildRiskAlert({
          mint: "TEST_MINT_NOT_A_REAL_SIGNAL",
          symbol: "TEST",
          sourceCard: "TEST",
          classification: "TEST ALERT — JEVSENTINEL ACTIVE",
          summary: "This is a delivery test. No trading action is being requested.",
          signals: ["Test notification delivered", "No live token assessment"],
          sourceMessageId: message.message_id,
        }), { reply_to_message_id: message.message_id });
        return;
      }
      await handleGroupMessage(message);
      return;
    }

    if (textValue === "/start" || textValue.startsWith("/start@")) return sendMessage(chatId, buildStartMessage());
    if (textValue === "/jevstatus" || textValue.startsWith("/jevstatus@")) return sendMessage(chatId, buildStatusMessage({ connected: true, configured: false, mode: "OFF" }));
    if (textValue === "/jevhelp" || textValue.startsWith("/jevhelp@")) return sendMessage(chatId, buildHelpMessage());
    if (textValue === "/jevtest" || textValue.startsWith("/jevtest@")) {
      return sendMessage(chatId, buildRiskAlert({
        mint: "TEST_MINT_NOT_A_REAL_SIGNAL",
        symbol: "TEST",
        sourceCard: "TEST",
        classification: "TEST ALERT — JEVSENTINEL ACTIVE",
        summary: "This is a delivery test. No trading action is being requested.",
        signals: ["Test notification delivered", "No live token assessment"],
        sourceMessageId: message.message_id,
      }), { reply_to_message_id: message.message_id });
    }
  }

  async function pollOnce() {
    const updates = await call("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] }, { token, timeoutMs: 35_000 });
    for (const update of updates) {
      offset = Math.max(offset, Number(update.update_id) + 1);
      try { await handleUpdate(update); } catch (error) { logger.error?.("[jevsentinel-telegram]", error.message); }
    }
    return updates.length;
  }

  async function start() {
    if (running) return;
    running = true;
    const me = await call("getMe", {}, { token });
    botId = me?.id ?? null;
    const webhook = await call("getWebhookInfo", {}, { token });
    if (webhook?.url) {
      logger.error?.("[jevsentinel-telegram] Telegram webhook is configured; getUpdates polling cannot receive updates. Webhook was NOT modified.");
    } else {
      logger.log?.("[jevsentinel-telegram] Telegram webhook: none; long polling enabled");
    }
    logger.log?.("[jevsentinel-telegram] connected");
    while (running) {
      try { await pollOnce(); } catch (error) { logger.error?.("[jevsentinel-telegram]", error.message); }
      if (running) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  function stop() { running = false; }

  return { start, stop, pollOnce, handleUpdate, sendMessage };
}

function isLikelyCard(text) {
  return /CONVICTION\s+PULSE\s+CW2/i.test(String(text ?? ""));
}
