import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { buildDecisionQuestions } from "./state.js";

export function createJevEvaluator({ client = new TypeSafeClient(), model = "jev-latest" } = {}) {
  return {
    async evaluate(state) {
      const questions = buildDecisionQuestions();
      const request = {
        model,
        state,
        questions: Object.fromEntries(
          Object.entries(questions).map(([key, q]) => [key, noul(q.prompt)])
        )
      };
      const result = await client.systemOne(request);
      return {
        model: result.model ?? model,
        answers: result.answers ?? {},
        usage: result.usage ?? null,
        evaluatedAt: new Date().toISOString()
      };
    }
  };
}
