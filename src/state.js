import { createObservation } from "./schema.js";

export function buildJevState(observation, intelligence = {}) {
  const o = createObservation(observation);
  const providerViews = Object.entries(intelligence).map(([provider, item]) => ({
    provider,
    available: item.available,
    fields: item.fields,
    observedAt: item.observedAt,
    ...(item.error ? { error: item.error } : {})
  }));

  return {
    system: "JevSentinel",
    purpose: "Real-time token risk and early-warning assessment",
    token: { mint: o.mint, symbol: o.symbol },
    context: {
      sourceCard: o.sourceCard,
      signalTime: o.signalTime,
      observedAt: o.observedAt,
      entryPrice: o.entryPrice
    },
    market: o.market,
    wallets: o.wallets,
    transfers: o.transfers,
    security: o.security,
    intelligence: providerViews,
    metadata: o.metadata
  };
}

export function buildDecisionQuestions() {
  return {
    escalation: {
      type: "noul",
      prompt: "Does the combined evidence justify escalating this token from monitoring to active risk attention? Consider the supplied security, market, wallet, transfer-flow, intelligence, and temporal evidence together."
    },
    dominantRisk: {
      type: "choice",
      options: {
        structural: "Authority, liquidity, holder concentration, sellability, or token-security conditions dominate.",
        wallet: "Wallet concentration, relationships, rotation, or coordinated wallet behavior dominate.",
        flow: "Abnormal transfers, selling pressure, or movement patterns dominate.",
        market: "Price, liquidity, volume, or market-stress deterioration dominates.",
        temporal: "The speed or progression of deterioration dominates.",
        none: "No single risk mechanism clearly dominates."
      },
      prompt: "Which single risk mechanism best explains the current evidence? Use the actual supplied fields, not assumptions."
    },
    evidenceQuality: {
      type: "score",
      levels: ["insufficient", "limited", "usable", "strong"],
      prompt: "How coherent, timely, and internally consistent is the supplied evidence for making a risk judgment? Penalize missing or stale evidence."
    },
    falsePositive: {
      type: "noul",
      prompt: "Is the combined evidence more consistent with normal market activity than genuine deterioration?"
    },
    urgency: {
      type: "score",
      levels: ["monitor", "elevated", "urgent", "immediate"],
      prompt: "How time-sensitive is the observed risk based only on the supplied state? Give greater urgency to concrete security warnings, concentrated holdings, active authorities, abnormal flows, or rapid deterioration when present."
    }
  };
}
