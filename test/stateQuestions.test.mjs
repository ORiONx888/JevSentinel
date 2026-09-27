import test from "node:test";
import assert from "node:assert/strict";
import { buildDecisionQuestions } from "../src/state.js";

test("JEV questions are independent and include explicit pattern contradiction/resemblance judgments", () => {
  const q = buildDecisionQuestions();
  assert.equal(q.patternResemblance.type, "noul");
  assert.equal(q.patternContradiction.type, "noul");
  assert.match(q.progression.prompt, /Do not force/i);
  assert.match(q.retraceAlternative.prompt, /insufficient evidence/i);
});
