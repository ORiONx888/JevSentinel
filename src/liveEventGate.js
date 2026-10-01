const MATERIAL_THRESHOLDS = Object.freeze({
  priceChange5mPct: 1.0,
  liquidityRelative: 0.05,
  volumeRelative: 0.25,
  buySellRatio: 0.10,
  sellCount5m: 5,
  uniqueSellers: 3,
});

const SEMANTIC_KEYS = Object.freeze([
  "progression",
  "deterioration",
  "retraceAlternative",
  "dominantRisk",
  "evidenceQuality",
]);

function answerValue(answer) {
  if (!answer) return null;
  return answer.choice ?? answer.value ?? answer.noul ?? null;
}

function urgency(answers = {}) {
  const item = answers.urgency ?? {};
  return {
    level: item.choice ?? (typeof item.value === "string" ? item.value : null),
    score: typeof item.score === "number" ? item.score : (typeof item.value === "number" ? item.value : null),
  };
}

function semanticState(assessment = {}, state = {}) {
  const answers = assessment.answers ?? {};
  const temporal = state.temporal ?? {};
  const acceleration = temporal.acceleration ?? {};
  const u = urgency(answers);
  return {
    action: state.trajectory?.action ?? null,
    urgencyLevel: u.level,
    progression: answerValue(answers.progression),
    deterioration: answerValue(answers.deterioration),
    retraceAlternative: answerValue(answers.retraceAlternative),
    dominantRisk: answerValue(answers.dominantRisk),
    evidenceQuality: answerValue(answers.evidenceQuality),
    escalation: answers.escalation?.noul ?? null,
    coordinatedBehavior: answerValue(answers.coordinatedBehavior),
    selling: acceleration.selling ?? null,
    buyPressure: acceleration.buyPressure ?? null,
    price: acceleration.price ?? null,
    liquidity: acceleration.liquidity ?? null,
    sellers: acceleration.sellers ?? null,
    coordination: acceleration.coordination ?? null,
  };
}

function changed(a, b, key) {
  return (a?.[key] ?? null) !== (b?.[key] ?? null);
}

function relativeChange(previous, latest) {
  if (!Number.isFinite(previous) || !Number.isFinite(latest) || previous === 0) return null;
  return Math.abs((latest - previous) / Math.abs(previous));
}

function hasFreshMarketData(intelligence = {}, state = {}) {
  const market = intelligence["token-research"];
  if (market && market.available === false) return false;
  const latest = state.temporal?.latest ?? {};
  return [
    latest.price,
    latest.liquidity,
    latest.volume,
    latest.priceChange5mPct,
    latest.buyCount5m,
    latest.sellCount5m,
  ].some(Number.isFinite);
}

function telemetryMaterialSinceBaseline(state, baseline) {
  if (!baseline) return false;
  const latest = state.temporal?.latest ?? {};
  if (!latest) return false;

  const price = relativeChange(baseline.price, latest.price);
  const liquidity = relativeChange(baseline.liquidity, latest.liquidity);
  const volume = relativeChange(baseline.volume, latest.volume);
  const buyShare = Number.isFinite(baseline.buySellRatio5m) && Number.isFinite(latest.buySellRatio5m)
    ? Math.abs(latest.buySellRatio5m - baseline.buySellRatio5m)
    : null;
  const sells = Number.isFinite(baseline.sellCount5m) && Number.isFinite(latest.sellCount5m)
    ? Math.abs(latest.sellCount5m - baseline.sellCount5m)
    : null;
  const sellers = Number.isFinite(baseline.uniqueSellers) && Number.isFinite(latest.uniqueSellers)
    ? Math.abs(latest.uniqueSellers - baseline.uniqueSellers)
    : null;
  const price5m = Number.isFinite(baseline.priceChange5mPct) && Number.isFinite(latest.priceChange5mPct)
    ? Math.abs(latest.priceChange5mPct - baseline.priceChange5mPct)
    : null;

  return (
    (price ?? 0) >= MATERIAL_THRESHOLDS.priceChange5mPct / 100 ||
    (liquidity ?? 0) >= MATERIAL_THRESHOLDS.liquidityRelative ||
    (volume ?? 0) >= MATERIAL_THRESHOLDS.volumeRelative ||
    (buyShare ?? 0) >= MATERIAL_THRESHOLDS.buySellRatio ||
    (sells ?? 0) >= MATERIAL_THRESHOLDS.sellCount5m ||
    (sellers ?? 0) >= MATERIAL_THRESHOLDS.uniqueSellers ||
    (price5m ?? 0) >= MATERIAL_THRESHOLDS.priceChange5mPct
  );
}

function snapshotFromState(state) {
  const latest = state?.temporal?.latest ?? {};
  return {
    price: Number.isFinite(latest.price) ? latest.price : null,
    liquidity: Number.isFinite(latest.liquidity) ? latest.liquidity : null,
    volume: Number.isFinite(latest.volume) ? latest.volume : null,
    priceChange5mPct: Number.isFinite(latest.priceChange5mPct) ? latest.priceChange5mPct : null,
    buySellRatio5m: Number.isFinite(latest.buySellRatio5m) ? latest.buySellRatio5m : null,
    sellCount5m: Number.isFinite(latest.sellCount5m) ? latest.sellCount5m : null,
    uniqueSellers: Number.isFinite(latest.uniqueSellers) ? latest.uniqueSellers : null,
    observedAt: latest.observedAt ?? null,
  };
}

export function createLiveEventGate({
  heartbeatMs = 120_000,
  now = () => Date.now(),
} = {}) {
  let lastEmittedSemantic = null;
  let lastEmittedTelemetry = null;
  let lastEmittedAt = 0;
  let initialized = false;

  function prime(assessment, state, intelligence = {}) {
    lastEmittedSemantic = semanticState(assessment, state);
    lastEmittedTelemetry = snapshotFromState(state);
    lastEmittedAt = now();
    initialized = true;
    return { emit: false, reason: "primed", kind: "none" };
  }

  function evaluate({ assessment, state, intelligence = {} } = {}) {
    if (!initialized) {
      prime(assessment, state, intelligence);
      return { emit: true, reason: "initial", kind: "state", events: [] };
    }

    const current = semanticState(assessment, state);
    const previous = lastEmittedSemantic;
    const latest = state?.temporal?.latest ?? {};

    if (changed(previous, current, "action")) return commit("action-transition", "state", current, state);
    if (changed(previous, current, "urgencyLevel")) return commit("urgency-transition", "state", current, state);
    if (changed(previous, current, "escalation")) return commit("escalation-transition", "state", current, state);

    for (const key of SEMANTIC_KEYS) {
      if (changed(previous, current, key) && (previous?.[key] != null || current?.[key] != null)) {
        return commit(key + "-transition", "state", current, state);
      }
    }

    // A deterioration/improvement acceleration is emitted on the transition
    // into that state, not on every 3-second tick while it remains unchanged.
    const deteriorationStates = new Set(["selling:increasing", "buyPressure:decreasing", "price:deteriorating", "liquidity:deteriorating", "sellers:increasing", "coordination:increasing"]);
    for (const key of ["selling", "buyPressure", "price", "liquidity", "sellers", "coordination"]) {
      if (changed(previous, current, key) && current[key] && current[key] !== "stable") {
        const kind = deteriorationStates.has(key + ":" + current[key]) ? "deterioration" : "improvement";
        return commit("acceleration-" + key, kind, current, state);
      }
    }

    if (telemetryMaterialSinceBaseline(state, lastEmittedTelemetry) && hasFreshMarketData(intelligence, state)) {
      return commit("material-telemetry-change", "telemetry", current, state);
    }

    const elapsed = now() - lastEmittedAt;
    if (heartbeatMs > 0 && elapsed >= heartbeatMs && hasFreshMarketData(intelligence, state)) {
      const result = {
        emit: true,
        reason: "heartbeat",
        kind: "heartbeat",
        events: ["💓 Live monitor heartbeat — no material state change since the last update"],
      };
      lastEmittedAt = now();
      lastEmittedTelemetry = snapshotFromState(state);
      return result;
    }

    return { emit: false, reason: "no-material-change", kind: "none", events: [] };
  }

  function commit(reason, kind, semantic, state) {
    lastEmittedSemantic = semantic;
    lastEmittedTelemetry = snapshotFromState(state);
    lastEmittedAt = now();
    return { emit: true, reason, kind, events: [] };
  }

  return { prime, evaluate };
}
