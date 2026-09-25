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

test("exposes single-actor retrace context without calling it safe", () => {
  const evidence = buildEvidenceState({
    "token-research": {
      available: true,
      fields: {
        flowDynamics: {
          uniqueSellers: 1,
          dominantSellerShare: 0.82,
          coordinatedSellers: false
        },
        marketDynamics: {
          volume5mUsd: 25000,
          uniqueBuyers: 40,
          recoveryAttempt: true
        },
        liquidityStructure: { liquidityChangePct: -2 }
      }
    },
    "transfer-flow": { available: true, fields: {} }
  });

  assert.equal(evidence.alternativeExplanation.uniqueSellerCount, 1);
  assert.equal(evidence.alternativeExplanation.dominantSellerShare, 0.82);
  assert.equal(evidence.alternativeExplanation.coordinatedSellerEvidence, false);
  assert.equal(evidence.alternativeExplanation.severeEvidencePresent, false);
  assert.match(evidence.alternativeExplanation.interpretationRule, /not safety proof/i);
});

test("preserves severe coordinated evidence despite popularity context", () => {
  const evidence = buildEvidenceState({
    "token-research": {
      available: true,
      fields: {
        flowDynamics: {
          uniqueSellers: 6,
          coordinatedSellers: true,
          uniqueBuyers: 100
        },
        marketDynamics: { volume5mUsd: 90000 },
        liquidityStructure: { liquidityRemoved: true },
        tokenIntegrity: { riskFlags: ["coordinated liquidity removal"] }
      }
    },
    "transfer-flow": { available: true, fields: {} }
  });

  assert.equal(evidence.alternativeExplanation.severeEvidencePresent, true);
  assert.equal(evidence.alternativeExplanation.popularityContext.uniqueBuyers, 100);
});
