export function buildTemporalState(samples = []) {
  const normalized = samples.map(normalizeSample).filter(Boolean);
  const ordered = normalized.sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
  if (!ordered.length) return { sampleCount: 0, deltas: {}, acceleration: {} };

  const latest = ordered.at(-1);
  const previous = ordered.length > 1 ? ordered.at(-2) : null;
  const deltas = {};
  for (const key of [
    "price",
    "liquidity",
    "volume",
    "priceChange5mPct",
    "priceChange1hPct",
    "buyCount5m",
    "sellCount5m",
    "buySellRatio5m",
    "uniqueSellers",
    "uniqueBuyers",
    "sellerAcceleration",
    "coordinatedSellers",
    "sellUsd",
    "buyUsd",
    "sellerCount"
  ]) {
    if (previous && Number.isFinite(previous[key]) && Number.isFinite(latest[key])) {
      deltas[key] = latest[key] - previous[key];
    }
  }

  return {
    sampleCount: ordered.length,
    firstObservedAt: ordered[0].observedAt,
    latestObservedAt: latest.observedAt,
    latest,
    previous,
    deltas,
    acceleration: {
      selling: direction(deltas.sellCount5m ?? deltas.sellUsd),
      buyPressure: direction(deltas.buySellRatio5m),
      volume: direction(deltas.volume),
      liquidity: direction(deltas.liquidity, true),
      price: direction(deltas.priceChange5mPct ?? deltas.price, true),
      sellers: direction(deltas.uniqueSellers ?? deltas.sellerCount),
      coordination: direction(deltas.coordinatedSellers)
    }
  };
}

function normalizeSample(sample) {
  if (!sample?.observedAt) return null;
  const market = sample.market ?? {};
  const flow = sample.flow ?? {};
  return {
    observedAt: sample.observedAt,
    price: finite(sample.price ?? market.price),
    liquidity: finite(sample.liquidity ?? market.liquidity ?? market.liquidityUsd),
    volume: finite(sample.volume ?? market.volume ?? market.volume5mUsd),
    priceChange5mPct: finite(sample.priceChange5mPct ?? market.priceChange5mPct),
    priceChange1hPct: finite(sample.priceChange1hPct ?? market.priceChange1hPct),
    buyCount5m: finite(sample.buyCount5m ?? market.buyCount5m),
    sellCount5m: finite(sample.sellCount5m ?? market.sellCount5m),
    buySellRatio5m: finite(sample.buySellRatio5m ?? market.buySellRatio5m),
    uniqueSellers: finite(sample.uniqueSellers ?? flow.uniqueSellers ?? sample.sellerCount ?? market.sellerCount),
    uniqueBuyers: finite(sample.uniqueBuyers ?? flow.uniqueBuyers),
    sellerAcceleration: finite(sample.sellerAcceleration ?? flow.sellerAcceleration),
    coordinatedSellers: finite(sample.coordinatedSellers ?? flow.coordinatedSellers),
    sellUsd: finite(sample.sellUsd ?? market.sellUsd),
    buyUsd: finite(sample.buyUsd ?? market.buyUsd),
    sellerCount: finite(sample.sellerCount ?? flow.uniqueSellers ?? market.sellerCount)
  };
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function direction(delta, inverse = false) {
  if (!Number.isFinite(delta) || delta === 0) return "stable";
  const positive = delta > 0;
  return inverse ? (positive ? "improving" : "deteriorating") : (positive ? "increasing" : "decreasing");
}
