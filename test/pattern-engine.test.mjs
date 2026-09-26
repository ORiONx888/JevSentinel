import test from "node:test";
import assert from "node:assert/strict";
import { buildCaseSignature, mineCandidatePatterns, matchPatterns } from "../research/pattern-engine/index.js";

const terminalAt = "2026-09-26T00:00:00Z";

function observation(offsetSeconds, values = {}) {
  return {
    observedAt: new Date(Date.parse(terminalAt) - offsetSeconds * 1000).toISOString(),
    priceUsd: 1,
    liquidityUsd: 10000,
    buys1h: 50,
    sells1h: 10,
    uniqueBuyers: 30,
    uniqueSellers: 5,
    coordinatedSellers: 0,
    ...values
  };
}

function rugCase(id) {
  return {
    tokenId: id, outcome: "rug", terminalAt,
    observations: [
      observation(300, { liquidityUsd: 20000, priceUsd: 1, uniqueSellers: 2 }),
      observation(180, { liquidityUsd: 18000, priceUsd: 0.98, uniqueSellers: 4 }),
      observation(120, { liquidityUsd: 16000, priceUsd: 0.94, uniqueSellers: 5 }),
      observation(60, { liquidityUsd: 14000, priceUsd: 0.90, uniqueSellers: 7, coordinatedSellers: 1 }),
      observation(30, { liquidityUsd: 13000, priceUsd: 0.86, uniqueSellers: 8, coordinatedSellers: 1 }),
      observation(10, { liquidityUsd: 12000, priceUsd: 0.84, uniqueSellers: 9, coordinatedSellers: 1 }),
      observation(0, { liquidityUsd: 13000, priceUsd: 0.79, uniqueSellers: 9, coordinatedSellers: 2, sells1h: 70, buys1h: 20, creator: { recentRugs: 2 }, wallet: { bundleSignal: true, sniperSignal: true, fundingCluster: true } })
    ]
  };
}

function controlCase(id) {
  return { tokenId: id, outcome: "control", terminalAt, observations: [300,180,120,60,30,10,0].map(n => observation(n)) };
}

test("buildCaseSignature reconstructs final-five-minute transitions", () => {
  const s = buildCaseSignature(rugCase("R1"));
  assert.equal(s.outcome, "rug");
  assert.equal(s.transitions.sellerGrowth5m, 7);
  assert.equal(s.wallet.bundleSignal, true);
  assert.equal(s.creator.recentRugs, 2);
});

test("miner finds a repeated creator/bundle/seller sequence", () => {
  const patterns = mineCandidatePatterns([rugCase("R1"), rugCase("R2"), rugCase("R3"), controlCase("C1"), controlCase("C2")], { minRugs: 3 });
  assert.ok(patterns.some(p => p.features.includes("creator_recent_rug") && p.features.includes("bundle_signal")));
});

test("pattern matcher returns only satisfied patterns", () => {
  const s = buildCaseSignature(rugCase("R1"));
  const patterns = mineCandidatePatterns([rugCase("R1"), rugCase("R2"), rugCase("R3")], { minRugs: 3 });
  const matches = matchPatterns(s, patterns);
  assert.ok(matches.length > 0);
  assert.ok(matches.every(m => m.matchedFeatures.length >= 2));
});
