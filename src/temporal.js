export function buildTemporalState(samples = []) {
  const normalized = samples.map(normalizeSample).filter(Boolean);
  const ordered = normalized.sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
  if (!ordered.length) return { sampleCount: 0, deltas: {}, acceleration: {} };

  const latest = ordered.at(-1);
  const previous = ordered.length > 1 ? ordered.at(-2) : null;
  const deltas = {};
  for (const key of ["price", "liquidity", "volume", "sellUsd", "buyUsd", "sellerCount"]) {
    if (previous && Number.isFinite(previous[key]) && Number.isFinite(latest[key])) {
      deltas[key] = latest[key] - previous[key];
    }
  }

  return {
    sampleCount: ordered.length,
    firstObservedAt: ordered[0].observedAt,
    latestObservedAt: latest.observedAt,
    deltas,
    acceleration: {
      selling: direction(deltas.sellUsd),
      liquidity: direction(deltas.liquidity, true),
      price: direction(deltas.price, true),
      sellers: direction(deltas.sellerCount)
    }
  };
}

function normalizeSample(sample) {
  if (!sample?.observedAt) return null;
  const market = sample.market ?? {};
  return {
    observedAt: sample.observedAt,
    price: finite(sample.price ?? market.price),
    liquidity: finite(sample.liquidity ?? market.liquidity ?? market.liquidityUsd),
    volume: finite(sample.volume ?? market.volume ?? market.volume5mUsd),
    sellUsd: finite(sample.sellUsd ?? market.sellUsd),
    buyUsd: finite(sample.buyUsd ?? market.buyUsd),
    sellerCount: finite(sample.sellerCount ?? market.sellerCount)
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
