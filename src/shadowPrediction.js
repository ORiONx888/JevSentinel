const ACTIONS = Object.freeze(["BUY", "HOLD", "CAUTION", "SELL"]);

export function buildShadowPrediction({ state = {}, assessment = null, trajectory = null, priorPrediction = null } = {}) {
  const answers = assessment?.answers ?? {};
  const temporal = state?.temporal ?? {};
  const latest = temporal.latest ?? {};
  const acceleration = temporal.acceleration ?? {};
  const evidenceQuality = valueOf(answers.evidenceQuality) ?? state?.evidence?.evidenceQuality?.status ?? "unknown";
  const progression = valueOf(answers.progression);
  const deterioration = valueOf(answers.deterioration);
  const retrace = valueOf(answers.retraceAlternative);
  const urgency = valueOf(answers.urgency);
  const falsePositive = answers.falsePositive?.noul === true;
  const coordinated = answers.coordinatedBehavior?.noul === true;

  const reasons = [];
  let action = "CAUTION";
  let confidence = 0.40;

  const severe = trajectory?.action === "SELL"
    || progression === "extraction"
    || deterioration === "severe"
    || urgency === "immediate"
    || coordinated === true
    || acceleration.liquidity === "deteriorating" && Number(trajectory?.riskScore ?? 0) >= 4;

  const conflicting = evidenceQuality === "insufficient"
    || evidenceQuality === "limited"
    || progression === "unclear"
    || retrace === "mixedEvidence"
    || (acceleration.selling === "increasing" && acceleration.buyPressure === "increasing");

  const confirmation = temporal.sampleCount >= 2
    && (evidenceQuality === "usable" || evidenceQuality === "strong")
    && (acceleration.buyPressure === "increasing" || acceleration.price === "improving")
    && acceleration.selling !== "increasing"
    && deterioration !== "elevated"
    && deterioration !== "severe"
    && !coordinated;

  const positiveStructure = trajectory?.riskScore === 0
    && (progression === "noProgression" || progression == null)
    && (deterioration === "stable" || deterioration == null)
    && (retrace === "likelyNormalRetrace" || retrace == null)
    && urgency === "monitor";

  if (severe) {
    action = "SELL";
    confidence = 0.78;
    reasons.push("forward risk structure is deteriorating");
    if (progression === "extraction") reasons.push("JEV progression indicates extraction");
    if (deterioration === "severe") reasons.push("JEV deterioration is severe");
    if (coordinated) reasons.push("JEV detected coordinated behavior");
  } else if (conflicting) {
    action = "CAUTION";
    confidence = 0.58;
    reasons.push("evidence is conflicting or unreliable");
    if (evidenceQuality === "limited" || evidenceQuality === "insufficient") reasons.push("evidence quality is not yet sufficient");
    if (retrace === "mixedEvidence") reasons.push("retrace and deterioration explanations remain mixed");
  } else if (positiveStructure && confirmation && (falsePositive || retrace === "likelyNormalRetrace")) {
    action = "BUY";
    confidence = evidenceQuality === "strong" ? 0.82 : 0.72;
    reasons.push("positive structure is supported by live confirmation");
    reasons.push("buy pressure/recovery is improving without accelerating selling");
    if (falsePositive) reasons.push("JEV found normal-market activity more consistent than deterioration");
  } else if (positiveStructure || confirmation) {
    action = "HOLD";
    confidence = 0.62;
    reasons.push("setup remains promising but confirmation is incomplete");
    if (temporal.sampleCount < 2) reasons.push("more temporal observations are needed");
    if (!confirmation) reasons.push("live confirmation is incomplete");
  } else {
    action = "CAUTION";
    confidence = 0.50;
    reasons.push("signals do not form a reliable forward setup");
  }

  if (priorPrediction?.action === "BUY" && (action === "CAUTION" || action === "SELL")) {
    reasons.unshift("prior positive prediction has deteriorated");
  }

  return {
    version: 1,
    shadow: true,
    action: ACTIONS.includes(action) ? action : "CAUTION",
    confidence: Math.max(0, Math.min(0.99, confidence)),
    sampleCount: Number(temporal.sampleCount ?? 0),
    evidenceQuality,
    sourceTrajectoryAction: trajectory?.action ?? null,
    reasons: [...new Set(reasons)].slice(0, 5),
    predictedAt: new Date().toISOString()
  };
}

function valueOf(answer) {
  if (!answer) return null;
  if (typeof answer === "boolean") return answer;
  return answer.choice ?? answer.value ?? answer.noul ?? null;
}
