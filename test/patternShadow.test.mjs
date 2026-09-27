import test from "node:test";
import assert from "node:assert/strict";
import { buildPatternShadow } from "../src/patternShadow.js";

test("pattern shadow stays deterministic and never emits a live action", () => {
  const state = {
    evidence: {
      flowDynamics: { repeatedSellerSharePct: 30, buyCount5m: 10, sellCount5m: 30 },
      walletBehaviour: { bundlerHolderCount: 12, sniperHolderCount: 12 },
      holderStructure: {}
    },
    temporal: { latest: {} }
  };
  const result = buildPatternShadow(state);
  assert.equal(result.status, "shadow-only-research");
  assert.ok(result.matchCount >= 1);
  assert.equal(result.features.sellBuy300, 3);
  assert.equal(result.features.sellBuy60, null);
  assert.equal("action" in result, false);
  assert.match(result.interpretation, /never directly change action/i);
});


test("pattern shadow never treats a five-minute counter as a sixty-second counter", () => {
  const result = buildPatternShadow({
    evidence: {
      flowDynamics: { repeatedSellerSharePct: 100, buyCount5m: 1, sellCount5m: 10 },
      walletBehaviour: { bundlerHolderCount: 12 },
      holderStructure: {}
    },
    temporal: { latest: {} }
  });
  assert.equal(result.features.sellBuy300, 10);
  assert.equal(result.features.sellBuy60, null);
  assert.equal(result.matches.some((match) => match.id === "COLLAPSE-CAND-057"), false);
});
