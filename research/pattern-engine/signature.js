const WINDOWS_SEC = [300, 180, 120, 60, 30, 10, 0];

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pctChange(current, previous) {
  const c = finite(current);
  const p = finite(previous);
  if (c === null || p === null || p === 0) return null;
  return ((c - p) / Math.abs(p)) * 100;
}

function ratio(a, b) {
  const x = finite(a);
  const y = finite(b);
  if (x === null || y === null || y === 0) return null;
  return x / y;
}

function nearestObservation(observations, terminalMs, secondsBefore) {
  const target = terminalMs - secondsBefore * 1000;
  let best = null;
  let bestDistance = Infinity;
  for (const item of observations) {
    const ms = Date.parse(item.observedAt);
    if (!Number.isFinite(ms)) continue;
    const distance = Math.abs(ms - target);
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

function derive(point, previous) {
  if (!point) return {};
  const buys = finite(point.buys1h);
  const sells = finite(point.sells1h);
  return {
    liquidityUsd: finite(point.liquidityUsd),
    priceUsd: finite(point.priceUsd),
    volume1hUsd: finite(point.volume1hUsd),
    buys1h: buys,
    sells1h: sells,
    uniqueBuyers: finite(point.uniqueBuyers),
    uniqueSellers: finite(point.uniqueSellers),
    top10Pct: finite(point.top10Pct),
    coordinatedSellers: finite(point.coordinatedSellers),
    sellBuyRatio: ratio(sells, buys),
    liquidityDeltaPct: previous ? pctChange(point.liquidityUsd, previous.liquidityUsd) : null,
    priceDeltaPct: previous ? pctChange(point.priceUsd, previous.priceUsd) : null,
    creatorRecentRugs: finite(point.creator?.recentRugs),
    creatorFirstDeployment: typeof point.creator?.firstDeployment === "boolean" ? point.creator.firstDeployment : null,
    bundleSignal: typeof point.wallet?.bundleSignal === "boolean" ? point.wallet.bundleSignal : null,
    sniperSignal: typeof point.wallet?.sniperSignal === "boolean" ? point.wallet.sniperSignal : null,
    fundingCluster: typeof point.wallet?.fundingCluster === "boolean" ? point.wallet.fundingCluster : null,
    mintAuthorityActive: typeof point.mintAuthorityActive === "boolean" ? point.mintAuthorityActive : null,
    freezeAuthorityActive: typeof point.freezeAuthorityActive === "boolean" ? point.freezeAuthorityActive : null
  };
}

export function buildCaseSignature({ tokenId, outcome = "unknown", terminalAt, observations = [] } = {}) {
  if (!tokenId) throw new Error("tokenId is required");
  if (!terminalAt || !Number.isFinite(Date.parse(terminalAt))) throw new Error("terminalAt must be a valid timestamp");

  const sorted = observations
    .filter(item => item && Number.isFinite(Date.parse(item.observedAt)))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));

  const terminalMs = Date.parse(terminalAt);
  const points = WINDOWS_SEC.map(secondsBefore => {
    const raw = nearestObservation(sorted, terminalMs, secondsBefore);
    const previous = nearestObservation(sorted, terminalMs, secondsBefore + 10);
    return { secondsBefore, observedAt: raw?.observedAt ?? null, features: derive(raw, previous) };
  });

  const latest = points.find(p => p.secondsBefore === 0)?.features ?? {};
  const at10 = points.find(p => p.secondsBefore === 10)?.features ?? {};
  const at300 = points.find(p => p.secondsBefore === 300)?.features ?? {};

  return {
    tokenId, outcome, terminalAt, windows: points,
    transitions: {
      liquidity5mToNowPct: at300.liquidityUsd !== null && latest.liquidityUsd !== null ? pctChange(latest.liquidityUsd, at300.liquidityUsd) : null,
      price5mToNowPct: at300.priceUsd !== null && latest.priceUsd !== null ? pctChange(latest.priceUsd, at300.priceUsd) : null,
      sellerGrowth5m: at300.uniqueSellers !== null && latest.uniqueSellers !== null ? latest.uniqueSellers - at300.uniqueSellers : null,
      sellBuyRatioNow: latest.sellBuyRatio,
      sellBuyRatio10sAgo: at10.sellBuyRatio,
      sellAcceleration: latest.sellBuyRatio !== null && at10.sellBuyRatio !== null ? latest.sellBuyRatio - at10.sellBuyRatio : null,
      coordinatedSellerIncrease: at300.coordinatedSellers !== null && latest.coordinatedSellers !== null ? latest.coordinatedSellers - at300.coordinatedSellers : null
    },
    creator: { recentRugs: latest.creatorRecentRugs, firstDeployment: latest.creatorFirstDeployment },
    wallet: { bundleSignal: latest.bundleSignal, sniperSignal: latest.sniperSignal, fundingCluster: latest.fundingCluster },
    security: { mintAuthorityActive: latest.mintAuthorityActive, freezeAuthorityActive: latest.freezeAuthorityActive }
  };
}
