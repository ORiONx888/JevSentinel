const SOLANA_ADDRESS = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

export const CW2_CARD_PATTERN = /CONVICTION\s+PULSE\s+CW2/i;

export function isCw2Card(text = "") {
  return CW2_CARD_PATTERN.test(String(text));
}

export function extractSolanaMint(text = "") {
  const value = String(text ?? "");
  const labelled = value.match(/(?:CA|CONTRACT|MINT)\s*[:=]\s*([1-9A-HJ-NP-Za-km-z]{32,44})/i);
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
  const value = String(text ?? "");
  const mint = extractSolanaMint(value);
  if (!mint) return null;
  const parsed = parseCw2Evidence(value);
  return {
    mint,
    symbol: extractSymbol(value),
    sourceCard: "CW",
    signalTime: observedAt,
    observedAt,
    market: parsed.market,
    wallets: parsed.wallets,
    security: parsed.security,
    metadata: {
      telegramChatId: String(chatId),
      telegramMessageId: Number(messageId),
      sourceLabel: "CONVICTION PULSE CW2",
      cardEvidence: parsed.metadata
    }
  };
}

export function parseCw2Evidence(text = "") {
  const value = String(text ?? "");
  const scoreMatch = value.match(/SCORE:\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+)/i);
  const ageText = value.match(/Age:\s*([^\n]+)/i)?.[1] ?? null;
  const marketCapUsd = parseMoney(value.match(/MC:\s*\$?([0-9.,]+)\s*([KMB])?/i));
  const buyMatch = value.match(/Buys:\s*([0-9.,]+)\s*SOL\s*\((\d+)\)/i);
  const volume5mUsd = parseMoney(value.match(/Vol\s*5m:\s*\$?([0-9.,]+)\s*([KMB])?/i));
  const safetyMatch = value.match(/Safety:\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*100(?:\s*\(([^)]*)\))?/i);
  const top10 = number(value.match(/Top-10\s+hold:\s*([0-9.]+)\s*%/i)?.[1]);
  const lpBurnText = value.match(/LP\s+burn:\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const mintRevoked = /Mint\s+auth:\s*[^\n]*?\bRevoked\b/i.test(value);
  const freezeRevoked = /Freeze\s+auth:\s*[^\n]*?\bRevoked\b/i.test(value);
  const metadataClean = /Metadata:\s*[^\n]*?\bClean\b/i.test(value);
  const devAth = parseMoney(value.match(/Dev(?:'s|’s)\s+last:\s*[^\n]*?ATH\s*\$?([0-9.,]+)\s*([KMB])?/i));
  const addonText = value.match(/Add-ons:\s*([^\n]+)/i)?.[1] ?? "";
  const addons = parseAddons(addonText);
  const riskCount = number(safetyMatch?.[2]?.match(/(\d+)\s+risk/i)?.[1]);

  return {
    market: {
      marketCapUsd,
      buySol: number(buyMatch?.[1]?.replaceAll(",", "")),
      buyCount: number(buyMatch?.[2]),
      volume5mUsd,
      ageMinutes: parseAgeMinutes(ageText)
    },
    wallets: {
      concentration: top10,
      devLastAthUsd: devAth,
      addonKols: addons.KOL ?? null,
      addonBuySell: addons["B/S"] ?? null,
      addonTurn: addons.Turn ?? null,
      addonSocial: addons.Social ?? null,
      addonSmart: addons.Smart ?? null
    },
    security: {
      safetyScore: number(safetyMatch?.[1]),
      rugCheckRiskCount: riskCount,
      authority: {
        mintAuthority: mintRevoked ? false : null,
        freezeAuthority: freezeRevoked ? false : null
      },
      liquidity: {
        lpBurn: lpBurnText,
        lpBurned: lpBurnText ? /\b(?:yes|burned|burn)\b/i.test(lpBurnText) : null
      },
      metadata: { clean: metadataClean },
      riskFlags: [
        ...(number(safetyMatch?.[1]) !== null && number(safetyMatch?.[1]) < 50 ? ["low-rugcheck-safety-score"] : []),
        ...(riskCount !== null && riskCount > 0 ? ["rugcheck-risk-present"] : []),
        ...(top10 !== null && top10 >= 40 ? ["high-top10-concentration"] : []),
        ...(lpBurnText && /\bnone\b/i.test(lpBurnText) ? ["lp-burn-absent"] : [])
      ]
    },
    metadata: {
      score: number(scoreMatch?.[1]),
      scoreMax: number(scoreMatch?.[2]),
      addons
    }
  };
}

function parseAddons(value) {
  const result = {};
  for (const match of String(value ?? "").matchAll(/([A-Za-z/]+)\s*\+\s*([0-9]+(?:\.[0-9]+)?)/g)) {
    result[match[1]] = Number(match[2]);
  }
  return result;
}

function parseAgeMinutes(value) {
  const match = String(value ?? "").match(/([0-9]+(?:\.[0-9]+)?)\s*(m|min|mins|h|hr|hrs)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return /h/i.test(match[2]) ? amount * 60 : amount;
}

function parseMoney(match) {
  if (!match) return null;
  const amount = Number(String(match[1]).replaceAll(",", ""));
  if (!Number.isFinite(amount)) return null;
  const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[String(match[2] ?? "").toUpperCase()] ?? 1;
  return amount * multiplier;
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
