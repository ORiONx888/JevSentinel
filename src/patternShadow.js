import library from "../research/jev-pattern-library.json" with { type: "json" };

const MAX_MATCHES = 8;

export function buildPatternShadow(state = {}) {
  const evidence = state.evidence ?? {};
  const temporal = state.temporal ?? {};
  const features = extractShadowFeatures(evidence, temporal);
  const matches = library.patterns
    .map((pattern) => {
      const matched = pattern.features.filter((name) => featureHolds(name, features));
      return {
        id: pattern.id,
        matchedFeatures: matched,
        complete: matched.length === pattern.features.length,
        targetMatches: pattern.targetMatches,
        controlMatches: pattern.controlMatches
      };
    })
    .filter((pattern) => pattern.complete)
    .slice(0, MAX_MATCHES);

  return {
    version: library.version,
    status: library.status,
    features,
    matches,
    matchCount: matches.length,
    interpretation: "Shadow evidence only. Pattern matches never directly change action."
  };
}

function extractShadowFeatures(evidence, temporal) {
  const flow = evidence.flowDynamics ?? {};
  const wallet = evidence.walletBehaviour ?? {};
  const holders = evidence.holderStructure ?? {};
  const latest = temporal.latest ?? {};

  // The historical sell_buy_300 candidate is a 300-second (5-minute)
  // horizon. Never substitute 1-hour counters for this feature.
  const buy300 = finiteOrNull(latest.buyCount5m ?? flow.buyCount5m);
  const sell300 = finiteOrNull(latest.sellCount5m ?? flow.sellCount5m);

  // The live evidence contract does not currently provide a true 60-second
  // rolling counter. Keep this missing rather than deriving a 60s value from
  // the 5m counter; missing evidence must never become a match.
  const buy60 = finiteOrNull(latest.buyCount1m ?? flow.buyCount1m);
  const sell60 = finiteOrNull(latest.sellCount1m ?? flow.sellCount1m);

  const repeatedSellerShare = finiteOrNull(flow.repeatedSellerSharePct ?? wallet.repeatedSellerSharePct);
  const bundlerHolders = finiteOrNull(wallet.bundlerHolderCount ?? wallet.bundlerHolders);
  const sniperHolders = finiteOrNull(wallet.sniperHolderCount ?? wallet.sniperHolders);

  return {
    sellBuy300: ratio(sell300, buy300),
    sellBuy60: ratio(sell60, buy60),
    repeatedSellerShare,
    bundlerHolders,
    sniperHolders,
    top10ConcentrationPct: finiteOrNull(holders.top10ConcentrationPct)
  };
}

function featureHolds(name, f) {
  switch (name) {
    case "sell_buy_300_ge_2": return f.sellBuy300 !== null && f.sellBuy300 >= 2;
    case "sell_buy_60_ge_2": return f.sellBuy60 !== null && f.sellBuy60 >= 2;
    case "repeated_seller_share_25": return f.repeatedSellerShare !== null && f.repeatedSellerShare >= 25;
    case "bundler_holders_ge_10": return f.bundlerHolders !== null && f.bundlerHolders >= 10;
    case "sniper_holders_ge_10": return f.sniperHolders !== null && f.sniperHolders >= 10;
    default: return false;
  }
}

function ratio(a, b) {
  return a !== null && b !== null && b !== 0 ? a / b : null;
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
