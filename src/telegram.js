import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { createJevEvaluator } from "./jev.js";
import { createJevSentinel } from "./engine.js";
import { createTransferFlowProvider } from "./providers/transferFlow.js";
import { createTokenResearchProvider } from "./providers/tokenResearch.js";
import { buildCw2Observation } from "./cw2Monitor.js";
import { createGroupStore } from "./groupStore.js";
import { createLiveMonitor } from "./liveMonitor.js";

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

function createGroupRuntime(apiKey, logger = null) {
  const client = new TypeSafeClient({ apiKey, logLevel: "error" });
  const telemetry = {
    records: [],
    append(record) { this.records.push(record); },
  };
  const evaluator = createJevEvaluator({ client });
  const sentinel = createJevSentinel({
    providers: [createTokenResearchProvider(), createTransferFlowProvider()],
    evaluator,
    telemetry,
  });
  return { client, sentinel, telemetry, history: new Map(), lastDecisions: new Map(), liveMonitor: createLiveMonitor({ intervalMs: 30_000, maxSnapshots: 12, logger }) };
}

function answerValue(answer) {
  if (!answer) return null;
  return answer.choice ?? answer.value ?? answer.noul ?? null;
}

function urgencyInfo(assessment) {
  const answer = assessment?.answers?.urgency ?? {};
  const numeric = typeof answer.score === "number"
    ? answer.score
    : typeof answer.value === "number"
      ? answer.value
      : null;
  const level = typeof answer.choice === "string"
    ? answer.choice
    : typeof answer.value === "string"
      ? answer.value
      : null;
  const dot = level === "immediate" ? "🔴"
    : level === "urgent" ? "🟠"
      : level === "elevated" ? "🟡"
        : level === "monitor" ? "🟢"
          : numeric != null ? "🔵"\n            : "⚪";
  return {
    numeric,
    level,
    label: numeric != null ? numeric.toFixed(2) : (level ?? "unknown"),
    dot,
  };
}

function answerSummary(assessment) {
  const answers = assessment?.answers ?? {};
  const escalation = answers.escalation?.noul;
  const urgency = urgencyInfo(assessment);
  const dominant = answerValue(answers.dominantRisk);
  if (escalation === true) {
    return {
      classification: "RISK ATTENTION ESCALATED",
      summary: "JEV escalated this CW2 token for active risk attention.",
      signals: [`Urgency: ${urgency.label}${urgency.level ? ` (${urgency.level})` : ""}`, ...(dominant ? [`Dominant risk: ${dominant}`] : [])],
    };
  }
  return {
    classification: "CW2 JEV ASSESSMENT — MONITORING",
    summary: "JEV is continuing to monitor this token.",
    signals: [`Urgency: ${urgency.label}${urgency.level ? ` (${urgency.level})` : ""}`],
  };
}

function liveContext(assessment, state) {
  const answers = assessment?.answers ?? {};
  const signals = [];
  const progression = answerValue(answers.progression);
  const retrace = answerValue(answers.retraceAlternative);
  const deterioration = answerValue(answers.deterioration);
  const dominant = answerValue(answers.dominantRisk);
  const coordinated = answers.coordinatedBehavior?.noul === true;
  const evidenceQuality = answerValue(answers.evidenceQuality);

  if (coordinated) signals.push("🔴 Coordinated selling detected");
  if (progression === "extraction") signals.push("🚨 Extraction pattern developing");
  else if (progression === "distribution") signals.push("⚠️ Distribution pattern developing");
  else if (progression === "preparation") signals.push("👁️ Positioning activity detected");

  if (deterioration === "severe") signals.push("📉 Price/market deterioration is severe");
  else if (deterioration === "elevated") signals.push("📉 Deterioration increasing");

  // Prefer the engine's temporal state for live changes. Provider fields are
  // point-in-time observations and may not expose the direction that changed
  // between snapshots.
  const acceleration = state?.temporal?.acceleration ?? {};
  const selling = String(acceleration.selling ?? "").toLowerCase();
  const liquidity = String(acceleration.liquidity ?? "").toLowerCase();
  const price = String(acceleration.price ?? "").toLowerCase();
  const sellers = String(acceleration.sellers ?? "").toLowerCase();

  if (selling === "increasing") signals.push("👛 Seller activity accelerating");
  if (liquidity === "deteriorating") signals.push("💧 Liquidity deterioration increasing");
  if (price === "deteriorating") signals.push("📉 Price deterioration accelerating");
  if (sellers === "increasing") signals.push("👥 Seller count increasing");

  if (retrace === "likelyNormalRetrace") signals.push("🔄 Retrace remains the leading explanation");
  else if (retrace === "mixedEvidence") signals.push("🟡 Evidence remains mixed");
  else if (retrace === "possibleSingleActorDump") signals.push("👤 Single-actor selling remains plausible");
  else if (retrace === "insufficientEvidence") signals.push("👁️ Evidence remains limited — monitoring continues");

  if (!signals.length && evidenceQuality === "strong") signals.push("🟢 Risk picture remains stable");
  if (!signals.length) signals.push("👁️ No material change detected");

  return [...new Set(signals)].slice(0, 3);
}

export function buildLiveRiskAlert({
  mint,
  symbol = "UNKNOWN",
  assessment = {},
  state = null,
  sourceMessageId = null,
}) {
  const urgency = urgencyInfo(assessment);
  const context = liveContext(assessment, state);
  const lines = [
    "<b>$" + escapeHtml(symbol) + ": Urgency " + escapeHtml(urgency.label) + " " + urgency.dot + "</b>",
    "",
    ...context.map((line) => escapeHtml(line)),
    "",
    tokenLinks(mint).map((x) => `<a href="${x.url}">${x.label}</a>`).join("  "),
  ];
  return lines.join("\n");
}

export function createTelegramBot({ token = process.env.TELEGRAM_BOT_TOKEN, call = telegramCall, pollIntervalMs = 1_000, logger = console, persistGroups = true, storePath } = {}) {
  if (!token?.trim()) throw new Error("TELEGRAM_BOT_TOKEN is required");
  let offset = 0;
  let running = false;
  let botId = null;
  const groups = new Map();
  const processed = new Set();
  const groupStore = persistGroups ? createGroupStore({
    filePath: storePath,
    encryptionSecret: process.env.JEV_GROUP_STORE_KEY ?? token,
  }) : null;

  function persistGroupsNow() {
    if (!groupStore) return;
    groupStore.save([...groups.entries()].map(([chatId, group]) => ({
      chatId,
      apiKey: group.apiKey,
      activatedAt: group.activatedAt,
      enabled: group.enabled !== false,
    })));
  }

  function restoreGroups() {
    if (!groupStore) return;
    const saved = groupStore.load();
    for (const entry of saved) {
      if (!entry?.chatId || !entry?.apiKey) continue;
      groups.set(String(entry.chatId), {
        apiKey: entry.apiKey,
        runtime: createGroupRuntime(entry.apiKey, logger),
        activatedAt: entry.activatedAt ?? new Date().toISOString(),
        enabled: entry.enabled !== false,
      });
    }
    logger.log?.("[jevsentinel-telegram] persistent group configuration restored", JSON.stringify({ count: groups.size }));
  }

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
      groups.set(String(chatId), { apiKey, runtime: createGroupRuntime(apiKey, logger), activatedAt: new Date().toISOString(), enabled: true });
      persistGroupsNow();
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
    logger.log?.(
      "[jevsentinel-telegram] group message received",
      JSON.stringify({
        chatId,
        messageId: Number(message.message_id ?? 0),
        configured: Boolean(existing),
        enabled: existing ? existing.enabled !== false : false,
        hasText: Boolean(textValue),
        isCw2: isLikelyCard(textValue),
        textLength: textValue.length,
      }),
    );

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

    if (!existing || !textValue || existing.enabled === false) {
      logger.log?.(
        "[jevsentinel-telegram] group message ignored",
        JSON.stringify({
          chatId,
          messageId: Number(message.message_id ?? 0),
          reason: !existing ? "not_configured" : !textValue ? "no_text" : "monitoring_off",
        }),
      );
      return;
    }

    const observation = buildCw2Observation({
      text: textValue,
      messageId: message.message_id,
      chatId: message.chat.id,
    });
    if (!observation) {
      logger.log?.(
        "[jevsentinel-telegram] non-CW2 group message ignored",
        JSON.stringify({
          chatId,
          messageId: Number(message.message_id ?? 0),
          isCw2: isLikelyCard(textValue),
        }),
      );
      return;
    }

    logger.log?.(
      "[jevsentinel-telegram] CW2 detected",
      JSON.stringify({
        chatId,
        messageId: Number(message.message_id ?? 0),
        mintExtracted: Boolean(observation.mint),
        symbol: observation.symbol,
      }),
    );

    const runtime = existing.runtime;
    const key = `${chatId}:${message.message_id}`;
    if (processed.has(key)) return;
    processed.add(key);

    try {
      logger.log?.("[jevsentinel-telegram] CW2 JEV assessment starting", JSON.stringify({
        chatId,
        messageId: Number(message.message_id ?? 0),
      }));
      const history = runtime.history.get(observation.mint) ?? [];
      const result = await runtime.sentinel.assess(observation, history);
      runtime.history.set(observation.mint, [...history, result.state].slice(-5));
      const summary = answerSummary(result.assessment);
      logger.log?.("[jevsentinel-telegram] CW2 JEV assessment finished", JSON.stringify({
        chatId,
        messageId: Number(message.message_id ?? 0),
        escalation: result.assessment?.answers?.escalation?.noul === true,
      }));
      await sendMessage(message.chat.id, buildRiskAlert({
        mint: observation.mint,
        symbol: observation.symbol,
        sourceCard: "CONVICTION PULSE CW2",
        classification: summary.classification,
        summary: summary.summary,
        signals: summary.signals,
        sourceMessageId: message.message_id,
      }), { reply_to_message_id: message.message_id });

      runtime.lastDecisions.set(observation.mint, result.assessment?.answers ?? {});
      runtime.liveMonitor.start({
        mint: observation.mint,
        initialState: result.state,
        run: async (priorStates) => runtime.sentinel.assess({
          ...observation,
          observedAt: new Date().toISOString(),
          signalTime: observation.signalTime,
        }, priorStates),
        onAssessment: async (liveResult) => {
          const liveSummary = answerSummary(liveResult.assessment);
          const previousAnswers = runtime.lastDecisions.get(observation.mint) ?? null;
          const currentAnswers = liveResult.assessment?.answers ?? {};
          const changed = JSON.stringify(previousAnswers) !== JSON.stringify(currentAnswers);
          runtime.lastDecisions.set(observation.mint, currentAnswers);
          runtime.history.set(observation.mint, [
            ...(runtime.history.get(observation.mint) ?? []),
            liveResult.state
          ].slice(-12));
          if (!changed && liveResult.assessment?.answers?.escalation?.noul !== true) return;
          await sendMessage(message.chat.id, buildLiveRiskAlert({
            mint: observation.mint,
            symbol: observation.symbol,
            assessment: liveResult.assessment,
            state: liveResult.state,
            sourceMessageId: message.message_id,
          }), { reply_to_message_id: message.message_id });
        }
      });
      logger.log?.("[jevsentinel-telegram] CW2 assessment completed; live monitoring started");
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
    persistGroupsNow();
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
    if (updates.length) {
      logger.log?.("[jevsentinel-telegram] updates received", JSON.stringify({
        count: updates.length,
        firstUpdateId: Number(updates[0]?.update_id ?? 0),
        lastUpdateId: Number(updates[updates.length - 1]?.update_id ?? 0),
      }));
    }

    for (const update of updates) {
      offset = Math.max(offset, Number(update.update_id) + 1);
      try { await handleUpdate(update); } catch (error) { logger.error?.("[jevsentinel-telegram]", error.message); }
    }
    return updates.length;
  }

  async function start() {
    if (running) return;
    running = true;
    restoreGroups();
    const me = await call("getMe", {}, { token });
    botId = me?.id ?? null;
    logger.log?.("[jevsentinel-telegram] Telegram bot capabilities", JSON.stringify({
      botId: Number(me?.id ?? 0),
      username: me?.username ?? null,
      canReadAllGroupMessages: me?.can_read_all_group_messages === true,
      canJoinGroups: me?.can_join_groups === true,
    }));
    if (me?.can_read_all_group_messages !== true) {
      logger.log?.("[jevsentinel-telegram] bot-to-bot prerequisite: enable Bot-to-Bot Communication Mode in @BotFather and ensure JevSentinel can receive group messages (admin or privacy mode disabled)");
    }
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
