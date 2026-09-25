const API_ROOT = "https://api.telegram.org";

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
  if (safeSignals.length) {
    lines.push("", "<b>Risk indicators</b>", ...safeSignals.map((s) => `• ${escapeHtml(s)}`));
  }
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

export function buildStartMessage() {
  return [
    "🛡️ <b>JevSentinel</b>",
    "",
    "Real-time token risk monitoring is ready.",
    "",
    "<b>Commands</b>",
    "/jevstatus — bot and JEV status",
    "/jevtest — send a safe test risk alert",
    "/jevhelp — show help",
    "",
    "Monitoring is inactive until a supported alert source is connected.",
  ].join("\n");
}

export function buildStatusMessage({ connected = false, mode = "LOG-ONLY", cards = [] } = {}) {
  return [
    "🛡️ <b>JevSentinel Status</b>",
    "",
    `Bot: <b>${connected ? "CONNECTED" : "DISCONNECTED"}</b>`,
    "JEV: <b>CONFIGURED VIA RUNTIME KEY</b>",
    `Mode: <b>${escapeHtml(mode)}</b>`,
    `Cards: <b>${cards.length ? cards.map(escapeHtml).join(" • ") : "NONE CONNECTED"}</b>`,
  ].join("\n");
}

export function buildHelpMessage() {
  return "🛡️ <b>JevSentinel Help</b>\n\nAdd the bot to a group, then use /jevstatus. Risk alerts are delivered only when a connected alert source sends JevSentinel an assessment.";
}

export function createTelegramBot({ token = process.env.TELEGRAM_BOT_TOKEN, call = telegramCall, pollIntervalMs = 1_000, logger = console } = {}) {
  if (!token?.trim()) throw new Error("TELEGRAM_BOT_TOKEN is required");
  let offset = 0;
  let running = false;

  async function sendMessage(chatId, text, extra = {}) {
    return call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    }, { token });
  }

  async function handleUpdate(update) {
    const message = update?.message;
    const textValue = message?.text?.trim();
    if (!message || !textValue) return;
    const chatId = message.chat.id;
    if (textValue === "/start" || textValue.startsWith("/start@")) return sendMessage(chatId, buildStartMessage());
    if (textValue === "/jevstatus" || textValue.startsWith("/jevstatus@")) return sendMessage(chatId, buildStatusMessage({ connected: true }));
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
    await call("getMe", {}, { token });
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
