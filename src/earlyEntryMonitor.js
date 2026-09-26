const SOLANA_ADDRESS = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

export const EARLY_ENTRY_CARD_PATTERN = /JEV\s+EARLIER\s+ENTRY/i;

export function isEarlyEntryCard(text = "") {
  return EARLY_ENTRY_CARD_PATTERN.test(String(text));
}

export function extractSolanaMint(text = "") {
  const value = String(text ?? "");
  const labelled = value.match(/(?:CA|CONTRACT|MINT)\s*[:=]\s*([1-9A-HJ-NP-Za-km-z]{32,44})/i);
  if (labelled) return labelled[1];
  const candidates = value.match(SOLANA_ADDRESS) ?? [];
  return candidates.find((candidate) => !/^[0-9]+$/.test(candidate)) ?? null;
}

export function extractSymbol(text = "") {
  const value = String(text ?? "");
  const match = value.match(/\$([A-Z][A-Z0-9_]{1,14})\b/);
  if (match?.[1]) return match[1];

  // Production Telegram cards may wrap the header and symbol in HTML tags.
  const normalized = value.replace(/<[^>]*>/g, " ");
  const header = normalized.match(/JEV\s+EARLIER\s+ENTRY\s*[—-]\s*\$?([A-Za-z0-9_.$-]{1,24})/i);
  return header?.[1]?.replace(/^\$/, "") ?? "UNKNOWN";
}

export function buildEarlyEntryObservation({ text, messageId, chatId, observedAt = new Date().toISOString() }) {
  if (!isEarlyEntryCard(text)) return null;
  const mint = extractSolanaMint(text);
  if (!mint) return null;
  return {
    mint,
    symbol: extractSymbol(text),
    sourceCard: "EARLY ENTRY EXPERIMENT",
    signalTime: observedAt,
    observedAt,
    metadata: {
      telegramChatId: String(chatId),
      telegramMessageId: Number(messageId),
      sourceLabel: "JEV EARLIER ENTRY",
    },
  };
}
