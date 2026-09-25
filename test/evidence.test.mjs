import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceState } from "../src/evidence.js";

test("normalizes independent research into JEV evidence groups", () => {
  const evidence = buildEvidenceState({
    "token-research": {
      available: true,
      fields: {
        tokenIntegrity: { token2022: false },
        holders: { top10ConcentrationPct: 52 },
        creatorIntelligence: { creatorAddress: "CREATOR" },
        walletBehaviour: { concentrationPct: 52 },
        flowDynamics: { status: "limited" },
        marketDynamics: { priceChange5mPct: -12 },
        liquidityStructure: { usd: 12000 }
      }
    },
    "native-risk": { available: true, fields: {} },
    "transfer-flow": { available: true, fields: {} }
  }, { sampleCount: 2, deltas: { price: -0.1 } });

  assert.equal(evidence.holderStructure.top10ConcentrationPct, 52);
  assert.equal(evidence.creatorIntelligence.creatorAddress, "CREATOR");
  assert.equal(evidence.marketDynamics.priceChange5mPct, -12);
  assert.equal(evidence.temporalIntelligence.sampleCount, 2);
  assert.ok(["usable", "strong"].includes(evidence.evidenceQuality.status));
});

test("missing evidence is explicit, not interpreted as safe", () => {
  const evidence = buildEvidenceState({
    "token-research": { available: true, fields: { tokenIntegrity: null } },
    "native-risk": { available: false, fields: {} }
  }, {});
  assert.ok(evidence.evidenceQuality.missingGroups.length >= 5);
  assert.notEqual(evidence.evidenceQuality.status, "strong");
});
