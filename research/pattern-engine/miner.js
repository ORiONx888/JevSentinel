import { buildCaseSignature } from "./signature.js";

const FEATURE_TESTS = {
  liquidity_drop_20: s => s.transitions.liquidity5mToNowPct !== null && s.transitions.liquidity5mToNowPct <= -20,
  liquidity_drop_30: s => s.transitions.liquidity5mToNowPct !== null && s.transitions.liquidity5mToNowPct <= -30,
  price_drop_20: s => s.transitions.price5mToNowPct !== null && s.transitions.price5mToNowPct <= -20,
  price_drop_40: s => s.transitions.price5mToNowPct !== null && s.transitions.price5mToNowPct <= -40,
  seller_growth_5: s => s.transitions.sellerGrowth5m !== null && s.transitions.sellerGrowth5m >= 5,
  sell_acceleration: s => s.transitions.sellAcceleration !== null && s.transitions.sellAcceleration >= 0.5,
  coordinated_sellers_2: s => s.transitions.coordinatedSellerIncrease !== null && s.transitions.coordinatedSellerIncrease >= 2,
  creator_recent_rug: s => s.creator.recentRugs !== null && s.creator.recentRugs >= 1,
  creator_first_deployment: s => s.creator.firstDeployment === true,
  bundle_signal: s => s.wallet.bundleSignal === true,
  sniper_signal: s => s.wallet.sniperSignal === true,
  funding_cluster: s => s.wallet.fundingCluster === true,
  mint_authority: s => s.security.mintAuthorityActive === true,
  freeze_authority: s => s.security.freezeAuthorityActive === true
};

const SEQUENCE_FEATURES = [
  ["creator_recent_rug", "bundle_signal", "seller_growth_5"],
  ["funding_cluster", "coordinated_sellers_2", "liquidity_drop_20"],
  ["bundle_signal", "sniper_signal", "seller_growth_5"],
  ["sell_acceleration", "seller_growth_5", "liquidity_drop_20"],
  ["creator_recent_rug", "funding_cluster", "liquidity_drop_30"],
  ["mint_authority", "price_drop_40"],
  ["freeze_authority", "price_drop_40"]
];

export function extractFeatureSet(signature) {
  return Object.entries(FEATURE_TESTS).filter(([, predicate]) => predicate(signature)).map(([name]) => name);
}

export function mineCandidatePatterns(cases = [], { minRugs = 3 } = {}) {
  const signatures = cases.map(item => item.signature ?? buildCaseSignature(item));
  const rugs = signatures.filter(s => s.outcome === "rug");
  const controls = signatures.filter(s => s.outcome === "control");
  const candidates = [];

  for (const sequence of SEQUENCE_FEATURES) {
    const rugHits = rugs.filter(s => sequence.every(f => FEATURE_TESTS[f]?.(s))).length;
    const controlHits = controls.filter(s => sequence.every(f => FEATURE_TESTS[f]?.(s))).length;
    if (rugHits < minRugs) continue;

    candidates.push({
      patternId: "RTI-CAND-" + String(candidates.length + 1).padStart(3, "0"),
      name: sequence.join(" -> "),
      features: sequence,
      sequence,
      rugMatches: rugHits,
      controlMatches: controlHits,
      rugRate: rugHits / rugs.length,
      controlRate: controls.length ? controlHits / controls.length : null,
      precision: rugHits + controlHits ? rugHits / (rugHits + controlHits) : null,
      recall: rugHits / rugs.length,
      medianLeadSec: null,
      sampleSize: rugHits,
      confidence: "candidate",
      corpus: { rugs: rugs.length, controls: controls.length }
    });
  }

  return candidates.sort((a, b) => (b.precision ?? 0) - (a.precision ?? 0) || b.recall - a.recall);
}

export function matchPatterns(signature, patterns = []) {
  return patterns.filter(pattern =>
    Array.isArray(pattern.features) &&
    pattern.features.length >= 2 &&
    pattern.features.every(feature => FEATURE_TESTS[feature]?.(signature))
  ).map(pattern => ({
    patternId: pattern.patternId,
    name: pattern.name,
    matchedFeatures: pattern.features,
    confidence: pattern.confidence ?? "candidate"
  }));
}
