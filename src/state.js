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
    intelligence: providerViews
  };
}

export function buildDecisionQuestions() {
  return {
    escalation: {
      type: "noul",
      prompt: "Does the independently gathered token evidence justify escalating this token from monitoring to active risk attention? The source alert card is only a trigger. Do not use its scores, safety claims, rug labels, holder percentages, dev claims, volume figures, or other card-derived evidence as evidence for this decision."
    },
    coordinatedBehavior: {
      type: "noul",
      prompt: "Is there sufficient independent evidence that creator-linked, insider-linked, or otherwise connected wallets are acting in a coordinated manner that increases rug-pull risk? Consider funding relationships, timing, clustered transfers, synchronized selling, and evidence quality. Do not infer coordination from proximity alone."
    },
    progression: {
      type: "choice",
      options: {
        noProgression: "No meaningful suspicious progression is established.",
        preparation: "Evidence suggests preparation, accumulation, funding, or positioning before extraction.",
        distribution: "Evidence suggests holders or linked wallets are distributing positions or transferring exposure.",
        extraction: "Evidence suggests active extraction through coordinated selling, liquidity movement, or related severe deterioration.",
        unclear: "The sequence is incomplete, conflicting, or too weak to classify."
      },
      prompt: "Which stage best describes the independently observed behavior sequence across the current and prior snapshots? Do not force a stage when the timeline is incomplete."
    },
    deterioration: {
      type: "score",
      levels: ["stable", "watch", "elevated", "severe"],
      prompt: "How severe is the current deterioration compared with prior snapshots? Consider changes in liquidity, price, selling pressure, seller acceleration, holder redistribution, failed sells, and other independently observed signals."
    },
    dominantRisk: {
      type: "choice",
      options: {
        structural: "Token integrity, authorities, sellability, holder concentration, or liquidity structure dominate.",
        wallet: "Creator, holder, wallet concentration, rotation, or coordinated wallet behavior dominate.",
        flow: "Transfers, selling pressure, abnormal movement, or clustered flow dominate.",
        market: "Price, volume, liquidity, or market-stress deterioration dominate.",
        temporal: "The speed or progression of deterioration dominates.",
        none: "No single risk mechanism clearly dominates."
      },
      prompt: "Which single risk mechanism best explains the independently gathered evidence? Use the normalized evidence groups and temporal history only."
    },
    evidenceQuality: {
      type: "score",
      levels: ["insufficient", "limited", "usable", "strong"],
      prompt: "How coherent, timely, independently gathered, and internally consistent is the evidence? Penalize missing, stale, or provider-failed evidence. Never convert missing evidence into a safety signal."
    },
    falsePositive: {
      type: "noul",
      prompt: "Is the combined independently gathered evidence more consistent with normal market activity than genuine deterioration? Consider alternative explanations and conflicting signals."
    },
    urgency: {
      type: "score",
      levels: ["monitor", "elevated", "urgent", "immediate"],
      prompt: "How time-sensitive is the observed risk based only on the normalized evidence and its progression? Give greater urgency to concrete security warnings, concentrated holdings, active authorities, abnormal flows, rapid deterioration, confirmed liquidity removal, or repeated failed sells when present."
    }
  };
}
