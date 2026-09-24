import { createObservation } from "./schema.js";

export function buildJevState(observation, intelligence = {}) {
  const o = createObservation(observation);
  const providerViews = Object.values(intelligence).map((item) => ({
    available: item.available,
    fields: item.fields,
    observedAt: item.observedAt
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
    externalIntelligence: providerViews,
    metadata: o.metadata
  };
}

export function buildDecisionQuestions() {
  return {
    escalation: {
      type: "noul",
      prompt: "Does the combined evidence justify escalating this token from monitoring to active risk attention?"
    },
    dominantRisk: {
      type: "noul",
      prompt: "What is the dominant risk mechanism in the supplied evidence right now?"
    },
    evidenceQuality: {
      type: "noul",
      prompt: "Is the evidence coherent and timely enough to support a meaningful risk judgment?"
    },
    falsePositive: {
      type: "noul",
      prompt: "Does the combined evidence look more consistent with normal market activity than genuine deterioration?"
    },
    urgency: {
      type: "noul",
      prompt: "How time-sensitive is the observed risk based only on the supplied state?"
    }
  };
}
