export const SOURCE_CARDS = Object.freeze(["CW", "HOT", "VOLUME_SPIKE", "UNKNOWN"]);

export function createObservation(input = {}) {
  if (!input.mint || typeof input.mint !== "string") throw new TypeError("mint is required");
  const now = input.observedAt ?? new Date().toISOString();
  return {
    mint: input.mint,
    symbol: input.symbol ?? null,
    sourceCard: input.sourceCard ?? "UNKNOWN",
    signalTime: input.signalTime ?? now,
    observedAt: now,
    entryPrice: finiteOrNull(input.entryPrice),
    market: input.market ?? {},
    wallets: input.wallets ?? {},
    transfers: input.transfers ?? {},
    security: input.security ?? {},
    metadata: input.metadata ?? {}
  };
}

export function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
