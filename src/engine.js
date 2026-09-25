import { buildJevState } from "./state.js";
import { buildTemporalState } from "./temporal.js";
import { collectIntelligence } from "./intelligence.js";
import { buildEvidenceState } from "./evidence.js";
import { createTelemetryRecord } from "./telemetry.js";

export function createJevSentinel({ providers = [], evaluator, telemetry, logger = null } = {}) {
  if (!evaluator?.evaluate) throw new TypeError("evaluator.evaluate is required");
  if (!telemetry?.append) throw new TypeError("telemetry.append is required");

  return {
    async assess(observation, history = []) {
      const intelligence = await collectIntelligence(providers, observation);
      const temporal = buildTemporalState(history);
      const evidence = buildEvidenceState(intelligence, temporal);
      const state = buildJevState(observation, intelligence);
      state.temporal = temporal;
      state.evidence = evidence;

      logger?.log?.("[jevsentinel] decision input", JSON.stringify(buildDecisionInputSummary(state, intelligence)));
      const assessment = await evaluator.evaluate(state);
      const record = createTelemetryRecord({ observation, state, intelligence, assessment });
      telemetry.append(record);

      return { id: record.id, state, intelligence, assessment, outcome: null };
    }
  };
}

function buildDecisionInputSummary(state, intelligence) {
  return {
    mint: state.token.mint,
    sourceCard: state.context.sourceCard,
    evidenceGroups: Object.fromEntries(Object.entries(state.evidence ?? {})
      .filter(([key]) => key !== "evidenceQuality")
      .map(([key, value]) => [key, Boolean(value)])),
    evidenceQuality: state.evidence?.evidenceQuality?.status ?? "unknown",
    providers: Object.fromEntries(Object.entries(intelligence).map(([name, item]) => [name, {
      available: item.available,
      fieldCount: Object.keys(item.fields ?? {}).filter((key) => item.fields[key] !== null && item.fields[key] !== undefined).length
    }])),
    temporalSampleCount: state.temporal?.sampleCount ?? 0
  };
}
