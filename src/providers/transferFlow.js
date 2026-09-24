import { IntelligenceProvider } from "../intelligence.js";

export function createTransferFlowProvider({ windowMs = 5_000 } = {}) {
  return new IntelligenceProvider("transfer-flow", async (observation) => {
    const now = Date.parse(observation.observedAt || new Date().toISOString());
    const events = Array.isArray(observation.transfers?.events)
      ? observation.transfers.events
      : [];

    const recent = events.filter((event) => {
      const at = Date.parse(event.observedAt ?? event.timestamp ?? "");
      return Number.isFinite(at) && now - at >= 0 && now - at <= windowMs;
    });

    const tokenAmount = recent.reduce((sum, e) => sum + finite(e.amount), 0);
    const uniqueSenders = new Set(recent.map((e) => e.sender).filter(Boolean));
    const uniqueReceivers = new Set(recent.map((e) => e.receiver).filter(Boolean));
    const watched = new Set(observation.wallets?.watched ?? []);
    const watchedMatches = recent.filter(
      (e) => watched.has(e.sender) || watched.has(e.receiver)
    ).length;

    return {
      burst: recent.length >= 2,
      transferCount: recent.length,
      totalAmount: tokenAmount,
      uniqueSenders: uniqueSenders.size,
      uniqueReceivers: uniqueReceivers.size,
      watchedMatches,
      windowMs,
      direction: recent.length ? classifyDirection(recent, watched) : "none"
    };
  });
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function classifyDirection(events, watched) {
  const outbound = events.filter((e) => watched.has(e.sender)).length;
  const inbound = events.filter((e) => watched.has(e.receiver)).length;
  if (outbound > inbound) return "outbound";
  if (inbound > outbound) return "inbound";
  return "mixed";
}
