import { IntelligenceProvider } from "../intelligence.js";

const FIELDS = [
  "authority", "liquidity", "holders", "behavior", "wallet", "honeypot",
  "riskFlags", "rugStage", "rugStageName", "temporalScore", "temporalStage",
  "estimatedPullHours", "score", "riskLevel", "isRug", "confidence"
];

export function createNativeRiskProvider() {
  return new IntelligenceProvider("native-risk", async (observation) => {
    const security = observation.security ?? {};
    const market = observation.market ?? {};
    const wallets = observation.wallets ?? {};

    const riskFlags = collectRiskFlags(security, market, wallets);
    const walletSignals = deriveWalletSignals(wallets);
    const marketSignals = deriveMarketSignals(market);
    const securitySignals = deriveSecuritySignals(security);

    return {
      ...pick(security, FIELDS),
      ...securitySignals,
      ...marketSignals,
      wallet: { ...(security.wallet ?? {}), ...walletSignals },
      behavior: {
        ...(security.behavior ?? {}),
        sellerAcceleration: finiteOrNull(wallets.sellerAcceleration),
        coordinatedSellers: finiteOrNull(wallets.coordinatedSellers),
        buySellRatio: finiteOrNull(wallets.buySellRatio)
      },
      riskFlags,
      signalCount: riskFlags.length
    };
  });
}

function deriveSecuritySignals(security) {
  return {
    authority: security.authority ?? null,
    honeypot: security.honeypot ?? null,
    liquidity: security.liquidity ?? null,
    holders: security.holders ?? null
  };
}

function deriveMarketSignals(market) {
  return {
    priceVelocity: finiteOrNull(market.priceVelocity),
    liquidityVelocity: finiteOrNull(market.liquidityVelocity),
    volumeVelocity: finiteOrNull(market.volumeVelocity),
    sellUsd: finiteOrNull(market.sellUsd),
    buyUsd: finiteOrNull(market.buyUsd),
    sellerCount: finiteOrNull(market.sellerCount)
  };
}

function deriveWalletSignals(wallets) {
  return {
    concentration: finiteOrNull(wallets.concentration),
    uniqueSellers: finiteOrNull(wallets.uniqueSellers),
    uniqueBuyers: finiteOrNull(wallets.uniqueBuyers),
    sellerAcceleration: finiteOrNull(wallets.sellerAcceleration),
    coordinatedSellers: finiteOrNull(wallets.coordinatedSellers)
  };
}

function collectRiskFlags(security, market, wallets) {
  const flags = new Set([
    ...(Array.isArray(security.riskFlags) ? security.riskFlags : []),
    ...(Array.isArray(market.riskFlags) ? market.riskFlags : []),
    ...(Array.isArray(wallets.riskFlags) ? wallets.riskFlags : [])
  ]);

  if (security.honeypot === true) flags.add("honeypot");
  if (security.authority?.mintAuthority === true) flags.add("mint-authority-active");
  if (security.authority?.freezeAuthority === true) flags.add("freeze-authority-active");
  if (Number(security.liquidity?.changePct) < 0) flags.add("liquidity-declining");
  if (Number(market.priceVelocity) < 0) flags.add("price-deteriorating");
  if (Number(wallets.sellerAcceleration) > 0) flags.add("seller-acceleration");

  return [...flags];
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
