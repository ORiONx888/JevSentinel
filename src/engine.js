import { buildJevState } from "./state.js";
import { buildTemporalState } from "./temporal.js";
import { collectIntelligence } from "./intelligence.js";
import { createTelemetryRecord } from "./telemetry.js";

export function createJevSentinel({ providers = [], evaluator, telemetry } = {}) {
  if (!evaluator?.evaluate) throw new TypeError("evaluator.evaluate is required");
  if (!telemetry?.append) throw new TypeError("telemetry.append is required");

  return {
    async assess(observation, history = []) {
      const intelligence = await collectIntelligence(providers, observation);
      const temporal = buildTemporalState(history);
      const state = buildJevState(observation, intelligence);
      state.temporal = temporal;

      const assessment = await evaluator.evaluate(state);
      const record = createTelemetryRecord({ observation, state, intelligence, assessment });
      telemetry.append(record);

      return {
        id: record.id,
        state,
        intelligence,
        assessment,
        outcome: null
      };
    }
  };
}
