const NUMERIC_FIELDS = [
  "peakGainPct",
  "terminalReturnPct",
  "maxDrawdownPct",
  "entryLiquidityUsd",
  "terminalLiquidityUsd"
];

const LABELS = new Set(["positive", "negative", "pump_then_collapse", "unresolved"]);

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

  return {
    valid: normalized.label !== "unresolved" || missing.length < NUMERIC_FIELDS.length,
    normalized,
    missingFields: missing,
    resolved: normalized.label !== "unresolved",
    reason: normalized.label === "unresolved"
      ? "Outcome remains unresolved; no predictive label should be learned."
      : "Outcome is labelled and may enter offline validation."
  };
}

export function buildOutcomeValidation(records = []) {
  const rows = records
    .filter((record) => record?.outcome)
    .map((record) => ({ ...record, outcome: normalizeOutcome(record.outcome) }));

  const resolved = rows.filter((record) => record.outcome.label !== "unresolved");
  const byLabel = Object.fromEntries(
    [...LABELS].map((label) => [label, resolved.filter((record) => record.outcome.label === label).length])
  );

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

  return {
    status: "offline-validation-only",
    sampleCount: rows.length,
    resolvedCount: resolved.length,
    unresolvedCount: rows.length - resolved.length,
    byLabel,
    patterns,
    promotion: "disabled"
  };
}

function countLabels(records) {
  return Object.fromEntries(
    [...LABELS].map((label) => [label, records.filter((r) => r.outcome.label === label).length])
  );
}

function mean(values) {
  const finite = values.filter((value) => value !== null && Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
