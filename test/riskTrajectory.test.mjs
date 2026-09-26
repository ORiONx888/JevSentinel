import test from "node:test";
import assert from "node:assert/strict";
import { buildRiskTrajectory } from "../src/riskTrajectory.js";

function baseState(overrides = {}) {
  return {
    evidence: {
      tokenIntegrity: { authority: { mintAuthorityActive: false, freezeAuthorityActive: false }, riskFlags: [] },
      holderStructure: { top10ConcentrationPct: 10, topHolderConcentrationPct: 5 },
      creatorIntelligence: null,
      walletBehaviour: {},
      flowDynamics: {},
      marketDynamics: { buyCount5m: 20, sellCount5m: 8, buySellRatio5m: 0.71 },
      liquidityStructure: { liquidityUsd: 50_000 },
    },
    temporal: {
      sampleCount: 3,
      latest: { liquidity: 50_000, buyCount5m: 20, sellCount5m: 8, buySellRatio5m: 0.71, priceChange5mPct: 1.5, coordinatedSellers: 0 },
      previous: { liquidity: 50_000 },
      acceleration: { selling: "stable", liquidity: "stable", sellers: "stable", coordination: "stable" },
    },
    ...overrides,
  };
}

test("trajectory engine produces BUY only from clean evidence plus explicit positive JEV evidence", () => {
  const result = buildRiskTrajectory({
    state: baseState(),
    assessment: {
      answers: {
        falsePositive: { noul: true },
        progression: { choice: "noProgression" },
        deterioration: { choice: "stable" },
        retraceAlternative: { choice: "likelyNormalRetrace" },
        urgency: { choice: "monitor" },
        evidenceQuality: { choice: "strong" },
      },
    },
  });
  assert.equal(result.action, "BUY");
  assert.equal(result.stage, "STABLE");
  assert.equal(result.riskScore, 0);
});

test("severe liquidity collapse cannot remain HOLD", () => {
  const result = buildRiskTrajectory({
    state: baseState({
      temporal: {
        sampleCount: 4,
        latest: { liquidity: 20_000, buyCount5m: 8, sellCount5m: 30, buySellRatio5m: 0.21, priceChange5mPct: -45, coordinatedSellers: 2 },
        previous: { liquidity: 35_000 },
        acceleration: { selling: "increasing", liquidity: "deteriorating", sellers: "increasing", coordination: "increasing" },
      },
      evidence: {
        tokenIntegrity: { authority: { mintAuthorityActive: false, freezeAuthorityActive: false }, riskFlags: [] },
        holderStructure: { top10ConcentrationPct: 45, topHolderConcentrationPct: 22 },
        creatorIntelligence: null,
        walletBehaviour: {},
        flowDynamics: { coordinatedSellers: 2 },
        marketDynamics: {},
        liquidityStructure: { liquidityUsd: 20_000 },
      },
    }),
    assessment: { answers: { progression: { choice: "unclear" }, deterioration: { choice: "watch" }, urgency: { choice: "monitor" } } },
  });
  assert.equal(result.action, "SELL");
  assert.equal(result.stage, "EXTRACTION");
  assert.ok(result.reasons.length > 0);
});

test("JEV extraction assessment becomes SELL even before every objective threshold fires", () => {
  const result = buildRiskTrajectory({
    state: baseState(),
    assessment: {
      answers: {
        progression: { choice: "extraction" },
        deterioration: { choice: "severe" },
        retraceAlternative: { choice: "possibleCoordinatedExtraction" },
        urgency: { choice: "immediate" },
      },
    },
  });
  assert.equal(result.action, "SELL");
  assert.ok(result.riskScore >= 9);
});

test("trajectory exposes independent dimensions and evidence quality", () => {
  const result = buildRiskTrajectory({
    state: baseState({
      evidence: {
        tokenIntegrity: { authority: { mintAuthorityActive: true, freezeAuthorityActive: false }, riskFlags: [] },
        holderStructure: { top10ConcentrationPct: 42, topHolderConcentrationPct: 18 },
        creatorIntelligence: { creatorAddress: "CREATOR", recentTransactionCount: 20 },
        walletBehaviour: {},
        flowDynamics: {},
        marketDynamics: {},
        liquidityStructure: { liquidityUsd: 8_000 },
      },
      temporal: {
        sampleCount: 3,
        latest: { liquidity: 8_000 },
        previous: { liquidity: 8_000 },
        acceleration: { selling: "stable", liquidity: "stable", sellers: "stable", coordination: "stable" },
      },
    }),
    assessment: { answers: { evidenceQuality: { choice: "usable" } } },
  });
  assert.ok(result.dimensions.structural.score > 0);
  assert.ok(result.dimensions.wallet.score > 0);
  assert.ok(result.dimensions.liquidity.score > 0);
  assert.equal(result.evidenceQuality, "usable");
});
