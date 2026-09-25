const SOLANA_ADDRESS = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

export const CW2_CARD_PATTERN = /CONVICTION\s+PULSE\s+CW2/i;

export function isCw2Card(text = "") {
  return CW2_CARD_PATTERN.test(String(text));
}

export function extractSolanaMint(text = "") {
  const value = String(text ?? "");
  const labelled = value.match(/(?:CA|CONTRACT|MINT)\s*[:=]\s*\`?([1-9A-HJ-NP-Za-km-z]{32,44})\`?/i);
  if (labelled) return labelled[1];

  const candidates = value.match(SOLANA_ADDRESS) ?? [];
  return candidates.find((candidate) => !/^[0-9]+$/.test(candidate)) ?? null;
}

export function extractSymbol(text = "") {
  const match = String(text ?? "").match(/\$([A-Z][A-Z0-9_]{1,14})\b/);
  return match?.[1] ?? "UNKNOWN";
}

export function buildCw2Observation({ text, messageId, chatId, observedAt = new Date().toISOString() }) {
  if (!isCw2Card(text)) return null;
  const mint = extractSolanaMint(text);
  if (!mint) return null;

  return {
    mint,
    symbol: extractSymbol(text),
    sourceCard: "CW",
    signalTime: observedAt,
    observedAt,
    metadata: {
      telegramChatId: String(chatId),
      telegramMessageId: Number(messageId),
      sourceLabel: "CONVICTION PULSE CW2"
    }
  };
}
