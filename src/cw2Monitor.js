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
  const value = String(text ?? "");
  const dollar = value.match(/\$([A-Za-z][A-Za-z0-9_]{0,14})\b/);
  if (dollar?.[1]) return dollar[1].toUpperCase();

  const labelled = value.match(/(?:TICKER|SYMBOL|TOKEN)\s*[:=]\s*\$?([A-Za-z][A-Za-z0-9_]{0,14})\b/i);
  if (labelled?.[1]) return labelled[1].toUpperCase();

  const header = value.match(/CONVICTION\s+PULSE\s+CW2\s*[—-]\s*\$?([A-Za-z][A-Za-z0-9_]{0,14})\b/i);
  return header?.[1]?.toUpperCase() ?? "UNKNOWN";
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
