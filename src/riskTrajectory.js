const ACTION_ORDER = Object.freeze({ HOLD: 0, BUY: 1, CAUTION: 2, SELL: 3 });

export function buildRiskTrajectory({ state = {}, assessment = null, history = [] } = {}) {
  state = state ?? {};
  const evidence = state.evidence ?? {};
  const temporal = state.temporal ?? {};
  const market = evidence.marketDynamics ?? {};
  const liquidity = evidence.liquidityStructure ?? {};
  const holders = evidence.holderStructure ?? {};
  const authority = evidence.tokenIntegrity?.authority ?? {};
  const flow = evidence.flowDynamics ?? {};
  const creator = evidence.creatorIntelligence ?? {};
  const answers = assessment?.answers ?? {};

  const dimensions = {
    structural: { score: 0, signals: [] },
    wallet: { score: 0, signals: [] },
    flow: { score: 0, signals: [] },
    liquidity: { score: 0, signals: [] },
    market: { score: 0, signals: [] },
    temporal: { score: 0, signals: [] },
  };

  if (authority.mintAuthorityActive) add(dimensions.structural, 2, "mint authority active");
  if (authority.freezeAuthorityActive) add(dimensions.structural, 2, "freeze authority active");
  if (Number(holders.top10ConcentrationPct) >= 40) add(dimensions.wallet, 2, "top-10 concentration ≥40%");
  if (Number(holders.topHolderConcentrationPct) >= 20) add(dimensions.wallet, 1, "top holder concentration ≥20%");

  const liq = Number(temporal.latest?.liquidity ?? liquidity.liquidityUsd ?? liquidity.usd);
  const liqPrev = Number(temporal.previous?.liquidity);
  if (Number.isFinite(liq) && liq > 0 && liq < 10_000) add(dimensions.liquidity, 2, "liquidity below $10K");
  if (Number.isFinite(liq) && Number.isFinite(liqPrev) && liqPrev > 0) {
    const pct = (liq - liqPrev) / liqPrev;
    if (pct <= -0.30) add(dimensions.liquidity, 4, "liquidity fell ≥30% between live snapshots");
    else if (pct <= -0.20) add(dimensions.liquidity, 3, "liquidity fell ≥20% between live snapshots");
  }

  const buys = Number(temporal.latest?.buyCount5m ?? market.buyCount5m);
  const sells = Number(temporal.latest?.sellCount5m ?? market.sellCount5m);
  const buyShare = Number(temporal.latest?.buySellRatio5m ?? market.buySellRatio5m);
  if (Number.isFinite(sells) && sells >= 10 && Number.isFinite(buyShare) && buyShare <= 0.25) {
    add(dimensions.flow, 3, "buy share ≤25% with ≥10 sells/5m");
  } else if (Number.isFinite(sells) && Number.isFinite(buys) && sells >= 10 && sells > buys * 2) {
    add(dimensions.flow, 2, "sell pressure dominates buys");
  }
  if (Number(flow.coordinatedSellers) >= 2 || Number(temporal.latest?.coordinatedSellers) >= 2) {
    add(dimensions.flow, 3, "multiple coordinated sellers observed");
  }

  const price5m = Number(temporal.latest?.priceChange5mPct ?? market.priceChange5mPct);
  if (Number.isFinite(price5m) && price5m <= -40) add(dimensions.market, 4, "5m price deterioration ≤−40%");
  else if (Number.isFinite(price5m) && price5m <= -20) add(dimensions.market, 2, "5m price deterioration ≤−20%");

  if (temporal.acceleration?.selling === "increasing") add(dimensions.temporal, 1, "selling is accelerating");
  if (temporal.acceleration?.liquidity === "deteriorating") add(dimensions.temporal, 1, "liquidity is deteriorating");
  if (temporal.acceleration?.sellers === "increasing") add(dimensions.temporal, 1, "unique sellers are increasing");
  if (temporal.acceleration?.coordination === "increasing") add(dimensions.temporal, 1, "coordination is increasing");

  if (Array.isArray(evidence.tokenIntegrity?.riskFlags)) {
    for (const flag of evidence.tokenIntegrity.riskFlags) {
      if (/liquidity.*(remov|withdraw)|extraction|coordinated/i.test(String(flag))) add(dimensions.structural, 4, String(flag));
    }
  }

  // Creator data is deliberately descriptive until the provider supplies verified
  // historical rug/cluster intelligence. Do not turn transaction count into a rug score.
  if (creator.creatorAddress && Number(creator.recentTransactionCount) > 0) {
    dimensions.wallet.signals.push("creator identity resolved");
  }

  const modelSignals = modelRiskSignals(answers);
  for (const signal of modelSignals) add(dimensions[signal.dimension], signal.score, signal.reason);

  const riskScore = Object.values(dimensions).reduce((sum, item) => sum + item.score, 0);
  const activeDimensions = Object.values(dimensions).filter((item) => item.score > 0).length;
  const sampleCount = Number(temporal.sampleCount ?? 0);
  const evidenceQuality = answers.evidenceQuality?.choice ?? answers.evidenceQuality?.value ?? evidence.evidenceQuality?.status ?? "unknown";
  const confidence = confidenceFor({ riskScore, activeDimensions, sampleCount, evidenceQuality });

  const stage = stageFor(riskScore, dimensions, temporal);
  const action = actionFor({ riskScore, dimensions, answers, confidence, history, temporal });

  return {
    version: 1,
    action,
    stage,
    riskScore,
    confidence,
    sampleCount,
    evidenceQuality,
    dimensions: Object.fromEntries(Object.entries(dimensions).map(([key, value]) => [key, {
      score: value.score,
      signals: [...new Set(value.signals)].slice(0, 5),
    }])),
    reasons: Object.values(dimensions).flatMap((item) => item.signals).filter(Boolean).slice(0, 8),
    observedAt: new Date().toISOString(),
  };
}

function modelRiskSignals(answers) {
  const progression = valueOf(answers.progression);
  const deterioration = valueOf(answers.deterioration);
  const retrace = valueOf(answers.retraceAlternative);
  const urgency = valueOf(answers.urgency);
  const escalation = answers.escalation?.noul === true;
  const signals = [];

  if (progression === "extraction") signals.push({ dimension: "temporal", score: 4, reason: "JEV progression: extraction" });
  else if (progression === "distribution") signals.push({ dimension: "flow", score: 2, reason: "JEV progression: distribution" });
  if (deterioration === "severe") signals.push({ dimension: "market", score: 4, reason: "JEV deterioration: severe" });
  else if (deterioration === "elevated") signals.push({ dimension: "market", score: 2, reason: "JEV deterioration: elevated" });
  if (retrace === "possibleCoordinatedExtraction") signals.push({ dimension: "flow", score: 3, reason: "JEV sees coordinated extraction as plausible" });
  if (valueOf(answers.coordinatedBehavior) === true) signals.push({ dimension: "wallet", score: 2, reason: "JEV detected coordinated behavior" });
  if (escalation) signals.push({ dimension: "temporal", score: 1, reason: "JEV escalation is active" });
  if (urgency === "immediate") signals.push({ dimension: "temporal", score: 2, reason: "JEV urgency: immediate" });
  else if (urgency === "urgent") signals.push({ dimension: "temporal", score: 1, reason: "JEV urgency: urgent" });
  return signals;
}

function actionFor({ riskScore, dimensions, answers, confidence, history, temporal }) {
  const severeObjective = dimensions.liquidity.score >= 4 || dimensions.market.score >= 4 || dimensions.flow.score >= 5;
  if (severeObjective || riskScore >= 9) return "SELL";
  if (riskScore >= 2) return "CAUTION";

  const progression = valueOf(answers.progression);
  const deterioration = valueOf(answers.deterioration);
  const retrace = valueOf(answers.retraceAlternative);
  const falsePositive = answers.falsePositive?.noul === true;
  const buyPressure = answers.urgency?.choice === "monitor"
    && (answers.deterioration?.choice === "stable" || answers.deterioration?.value === "stable");
  const positiveRecovery = temporal.acceleration?.price === "improving"
    && temporal.acceleration?.buyPressure === "increasing"
    && temporal.acceleration?.selling !== "increasing";

  if (
    riskScore === 0 &&
    confidence >= 0.70 &&
    falsePositive &&
    (progression === "noProgression" || progression == null) &&
    (deterioration === "stable" || deterioration == null) &&
    (retrace === "likelyNormalRetrace" || retrace == null) &&
    (buyPressure || positiveRecovery)
  ) return "BUY";

  // A prior SELL is not sticky: recovery must be re-earned from fresh evidence.
  if (history.length && riskScore === 0 && confidence >= 0.80 && falsePositive) return "BUY";
  return "HOLD";
}

function stageFor(riskScore, dimensions, temporal) {
  if (dimensions.liquidity.score >= 4 || dimensions.flow.score >= 5 || riskScore >= 9) return "EXTRACTION";
  if (riskScore >= 6 || dimensions.market.score >= 4) return "DISTRIBUTION";
  if (riskScore >= 3) return "WATCH";
  if (temporal.sampleCount < 2) return "INITIAL";
  return "STABLE";
}

function confidenceFor({ riskScore, activeDimensions, sampleCount, evidenceQuality }) {
  let confidence = 0.45;
  confidence += Math.min(activeDimensions * 0.08, 0.24);
  confidence += Math.min(sampleCount * 0.02, 0.16);
  if (sampleCount >= 3) confidence += 0.08;
  if (evidenceQuality === "strong") confidence += 0.15;
  else if (evidenceQuality === "usable") confidence += 0.08;
  else if (evidenceQuality === "insufficient") confidence -= 0.12;
  if (riskScore === 0 && sampleCount < 2) confidence -= 0.10;
  return Math.max(0, Math.min(0.99, confidence));
}

function valueOf(answer) {
  if (!answer) return null;
  if (typeof answer === "boolean") return answer;
  return answer.choice ?? answer.value ?? answer.noul ?? null;
}

function add(target, score, reason) {
  target.score += score;
  target.signals.push(reason);
}
