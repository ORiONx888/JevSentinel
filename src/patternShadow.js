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
  const at60 = temporal.windowed?.["60"] ?? temporal.points?.["60"] ?? {};

  const buy5m = finite(latest.buyCount5m ?? flow.buyCount5m);
  const sell5m = finite(latest.sellCount5m ?? flow.sellCount5m);
  const buy60 = finite(latest.buyCount1h ?? flow.buyCount1h ?? flow.buys1h);
  const sell60 = finite(latest.sellCount1h ?? flow.sellCount1h ?? flow.sells1h);

  const repeatedSellerShare = finite(flow.repeatedSellerSharePct ?? wallet.repeatedSellerSharePct);
  const bundlerHolders = finite(wallet.bundlerHolderCount ?? wallet.bundlerHolders);
  const sniperHolders = finite(wallet.sniperHolderCount ?? wallet.sniperHolders);

  return {
    sellBuy300: ratio(sell60, buy60),
    sellBuy60: ratio(sell5m, buy5m),
    repeatedSellerShare,
    bundlerHolders,
    sniperHolders,
    top10ConcentrationPct: finite(holders.top10ConcentrationPct),
    at60
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

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
