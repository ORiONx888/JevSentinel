import test from "node:test";
import assert from "node:assert/strict";
import { buildPatternShadow } from "../src/patternShadow.js";

test("pattern shadow stays deterministic and never emits a live action", () => {
  const state = {
    evidence: {
      flowDynamics: { repeatedSellerSharePct: 30, buyCount5m: 10, sellCount5m: 30, buyCount1h: 10, sellCount1h: 30 },
      walletBehaviour: { bundlerHolderCount: 12, sniperHolderCount: 12 },
      holderStructure: {}
    },
    temporal: { latest: {} }
  };
  const result = buildPatternShadow(state);
  assert.equal(result.status, "shadow-only-research");
  assert.ok(result.matchCount >= 1);
  assert.equal("action" in result, false);
  assert.match(result.interpretation, /never directly change action/i);
});
