const NUMERIC_FIELDS = [
  "peakGainPct",
  "terminalReturnPct",
  "maxDrawdownPct",
  "entryLiquidityUsd",
  "terminalLiquidityUsd"
];

const LABELS = new Set(["positive", "negative", "pump_then_collapse", "unresolved"]);
const OUTCOME_LABELS = [...LABELS];

export const VALIDATION_STATUS = "offline-validation-only";

export function normalizeOutcome(input = {}) {
  if (!input || typeof input !== "object") throw new TypeError("outcome must be an object");

  const normalized = { label: input.label ?? "unresolved" };
  if (!LABELS.has(normalized.label)) throw new TypeError("invalid outcome label");

  for (const field of NUMERIC_FIELDS) {
    const value = input[field];
    normalized[field] = value === null || value === undefined || value === ""
      ? null
      : finiteOrNull(value);
  }

  if (input.resolvedAt !== undefined) normalized.resolvedAt = input.resolvedAt;
  if (input.source !== undefined) normalized.source = input.source;
  if (input.notes !== undefined) normalized.notes = input.notes;

  return normalized;
}

export function validateOutcomeForTelemetry(outcome = {}) {
  const normalized = normalizeOutcome(outcome);
  const missing = NUMERIC_FIELDS.filter((field) => normalized[field] === null);
  const resolved = normalized.label !== "unresolved";

  return {
    valid: resolved || missing.length < NUMERIC_FIELDS.length,
    normalized,
    missingFields: missing,
    resolved,
    reason: resolved
      ? "Outcome is labelled and may enter offline validation."
      : "Outcome remains unresolved; no predictive label should be learned."
  };
}

export function buildOutcomeValidation(records = []) {
  const rows = records
    .filter((record) => record?.outcome)
    .map((record) => ({ ...record, outcome: normalizeOutcome(record.outcome) }));

  const resolved = rows.filter((record) => record.outcome.label !== "unresolved");
  const byLabel = countLabels(resolved);

  const patternIds = [...new Set(
    rows.flatMap((record) => (record.patternShadow?.matches ?? []).map((match) => match.id))
  )];

  const patterns = patternIds.map((id) => {
    const matched = resolved.filter((record) =>
      (record.patternShadow?.matches ?? []).some((match) => match.id === id)
    );
    const unmatched = resolved.filter((record) =>
      !(record.patternShadow?.matches ?? []).some((match) => match.id === id)
    );

    return {
      id,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      matchedLabels: countLabels(matched),
      unmatchedLabels: countLabels(unmatched),
      matchedMeanTerminalReturnPct: mean(matched.map((r) => r.outcome.terminalReturnPct)),
      unmatchedMeanTerminalReturnPct: mean(unmatched.map((r) => r.outcome.terminalReturnPct))
    };
  });

  const featureValidation = validateFeatureGroups(resolved);
  const holdout = buildChronologicalHoldout(resolved);
  const predictionValidation = buildPredictionOutcomeLinkage(rows);

  return {
    status: VALIDATION_STATUS,
    sampleCount: rows.length,
    resolvedCount: resolved.length,
    unresolvedCount: rows.length - resolved.length,
    byLabel,
    patterns,
    featureValidation,
    holdout,
    predictionValidation,
    promotion: "disabled"
  };
}

/**
 * Links each recorded shadow prediction to the resolved outcome on the same
 * telemetry record. This is descriptive/offline only: it never changes a
 * prediction, creates a live threshold, or promotes an action.
 */
export function buildPredictionOutcomeLinkage(records = []) {
  const rows = records.map((record) => ({
    ...record,
    outcome: record?.outcome ? normalizeOutcome(record.outcome) : null,
    prediction: record?.prediction ?? record?.state?.shadowPrediction ?? null
  }));

  const predicted = rows.filter((record) => record.prediction?.action);
  const resolved = predicted.filter((record) => record.outcome?.label !== "unresolved" && record.outcome?.label);
  const actions = ["BUY", "HOLD", "CAUTION", "SELL"];
  const labels = [...LABELS];

  const byAction = Object.fromEntries(actions.map((action) => {
    const bucket = predicted.filter((record) => record.prediction.action === action);
    const resolvedBucket = bucket.filter((record) => record.outcome?.label !== "unresolved" && record.outcome?.label);
    return [action, {
      predictionCount: bucket.length,
      resolvedCount: resolvedBucket.length,
      unresolvedCount: bucket.length - resolvedBucket.length,
      outcomes: Object.fromEntries(labels.map((label) => [
        label,
        resolvedBucket.filter((record) => record.outcome.label === label).length
      ])),
      meanConfidence: round(mean(bucket.map((record) => finiteOrNull(record.prediction.confidence))))
    }];
  }));

  return {
    status: VALIDATION_STATUS,
    predictionCount: predicted.length,
    resolvedPredictionCount: resolved.length,
    unresolvedPredictionCount: predicted.length - resolved.length,
    byAction,
    promotion: "disabled"
  };
}

/**
 * Compares deterministic feature states against resolved outcomes.
 * This is deliberately descriptive: it does not produce a live threshold,
 * modify JEV, or promote a feature.
 */
export function validateFeatureGroups(records = [], { minSupport = 3 } = {}) {
  const resolved = records
    .filter((record) => record?.outcome)
    .map((record) => ({ ...record, outcome: normalizeOutcome(record.outcome) }))
    .filter((record) => record.outcome.label !== "unresolved");

  const groups = [
    ["decision", (r) => valueAt(r, ["assessment", "decision"], ["assessment", "verdict", "decision"])],
    ["trajectoryAction", (r) => valueAt(r, ["state", "trajectory", "action"])],
    ["trajectoryStage", (r) => valueAt(r, ["state", "trajectory", "stage"])],
    ["evidenceQuality", (r) => valueAt(r, ["state", "evidence", "evidenceQuality", "status"])],
    ["temporalSelling", (r) => valueAt(r, ["state", "temporal", "acceleration", "selling"])],
    ["temporalPrice", (r) => valueAt(r, ["state", "temporal", "acceleration", "price"])],
    ["temporalLiquidity", (r) => valueAt(r, ["state", "temporal", "acceleration", "liquidity"])],
    ["temporalCoordination", (r) => valueAt(r, ["state", "temporal", "acceleration", "coordination"])]
  ];

  return groups.flatMap(([feature, getter]) => {
    const buckets = new Map();
    for (const record of resolved) {
      const value = getter(record);
      if (value === null || value === undefined || value === "") continue;
      const key = String(value);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(record);
    }

    return [...buckets.entries()]
      .filter(([, bucket]) => bucket.length >= minSupport)
      .map(([value, bucket]) => summarizeBucket(feature, value, bucket, resolved.length));
  });
}

function summarizeBucket(feature, value, bucket, totalCount) {
  const positive = bucket.filter((r) => r.outcome.label === "positive").length;
  const negative = bucket.filter((r) => r.outcome.label === "negative").length;
  const collapse = bucket.filter((r) => r.outcome.label === "pump_then_collapse").length;

  return {
    feature,
    value,
    count: bucket.length,
    coveragePct: round(bucket.length / totalCount * 100),
    positiveRatePct: round(positive / bucket.length * 100),
    negativeRatePct: round(negative / bucket.length * 100),
    pumpThenCollapseRatePct: round(collapse / bucket.length * 100),
    meanTerminalReturnPct: round(mean(bucket.map((r) => r.outcome.terminalReturnPct))),
    meanPeakGainPct: round(mean(bucket.map((r) => r.outcome.peakGainPct)))
  };
}

/**
 * Chronological holdout only. No feature is promoted from the holdout result.
 * The returned candidateFeatures are descriptive candidates observed in the
 * earlier partition; testMetrics report what happened in the later partition.
 */
export function buildChronologicalHoldout(records = [], { trainFraction = 0.7, minTrainSupport = 3 } = {}) {
  const resolved = records
    .filter((record) => record?.outcome)
    .map((record) => ({ ...record, outcome: normalizeOutcome(record.outcome) }))
    .filter((record) => record.outcome.label !== "unresolved")
    .sort((a, b) => timestampOf(a) - timestampOf(b));

  if (resolved.length < 2) {
    return {
      status: "insufficient-data",
      trainCount: resolved.length,
      testCount: 0,
      candidateFeatures: [],
      testMetrics: null
    };
  }

  const split = Math.min(Math.max(Math.floor(resolved.length * trainFraction), 1), resolved.length - 1);
  const train = resolved.slice(0, split);
  const test = resolved.slice(split);
  const candidateFeatures = validateFeatureGroups(train, { minSupport: minTrainSupport })
    .filter((row) => row.positiveRatePct !== null || row.negativeRatePct !== null)
    .map(({ feature, value }) => ({ feature, value }));

  const testRows = test.filter((record) => candidateFeatures.some((candidate) =>
    String(valueAt(record, featurePath(candidate.feature))) === candidate.value
  ));

  return {
    status: "chronological-holdout",
    trainCount: train.length,
    testCount: test.length,
    candidateFeatures,
    testMetrics: summarizeOutcomes(test),
    candidateCoverageInTest: test.length ? round(testRows.length / test.length * 100) : 0,
    promotion: "disabled"
  };
}

function summarizeOutcomes(records) {
  const counts = countLabels(records);
  return {
    ...counts,
    meanTerminalReturnPct: round(mean(records.map((r) => r.outcome.terminalReturnPct))),
    meanPeakGainPct: round(mean(records.map((r) => r.outcome.peakGainPct))),
    meanMaxDrawdownPct: round(mean(records.map((r) => r.outcome.maxDrawdownPct)))
  };
}

function countLabels(records) {
  return Object.fromEntries(
    OUTCOME_LABELS.map((label) => [label, records.filter((r) => r.outcome.label === label).length])
  );
}

function mean(values) {
  const finite = values.filter((value) => value !== null && Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function round(value) {
  return value === null || value === undefined ? null : Number(value.toFixed(4));
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function timestampOf(record) {
  const value = record.outcome.resolvedAt ?? record.createdAt ?? record.observedAt;
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function valueAt(record, ...paths) {
  for (const path of paths) {
    const value = path.reduce((current, key) => current?.[key], record);
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function featurePath(feature) {
  const paths = {
    decision: ["assessment", "decision"],
    trajectoryAction: ["state", "trajectory", "action"],
    trajectoryStage: ["state", "trajectory", "stage"],
    evidenceQuality: ["state", "evidence", "evidenceQuality", "status"],
    temporalSelling: ["state", "temporal", "acceleration", "selling"],
    temporalPrice: ["state", "temporal", "acceleration", "price"],
    temporalLiquidity: ["state", "temporal", "acceleration", "liquidity"],
    temporalCoordination: ["state", "temporal", "acceleration", "coordination"]
  };
  return paths[feature] ?? [];
}
