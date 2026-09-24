import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { buildDecisionQuestions } from "./state.js";

export function createJevEvaluator({ client = new TypeSafeClient(), model = "jev-latest" } = {}) {
  return {
    async evaluate(state) {
      const definitions = buildDecisionQuestions();
      const questions = {
        escalation: noul(definitions.escalation.prompt),
        dominantRisk: choice(definitions.dominantRisk.prompt, definitions.dominantRisk.options),
        evidenceQuality: score(definitions.evidenceQuality.prompt, definitions.evidenceQuality.levels),
        falsePositive: noul(definitions.falsePositive.prompt),
        urgency: score(definitions.urgency.prompt, definitions.urgency.levels)
      };

      const result = await client.systemOne({ model, state, questions });
      return {
        model: result.model ?? model,
        answers: result.answers ?? {},
        usage: result.usage ?? null,
        evaluatedAt: new Date().toISOString()
      };
    }
  };
}
