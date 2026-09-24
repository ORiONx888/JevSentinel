export function buildTemporalState(samples = []) {
  const ordered = [...samples].sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
  if (!ordered.length) return { sampleCount: 0, deltas: {}, acceleration: {} };

  const latest = ordered.at(-1);
  const previous = ordered.length > 1 ? ordered.at(-2) : null;
  const deltas = {};
  for (const key of ["price", "liquidity", "volume", "sellUsd", "buyUsd", "sellerCount"]) {
    if (previous && Number.isFinite(Number(previous[key])) && Number.isFinite(Number(latest[key]))) {
      deltas[key] = Number(latest[key]) - Number(previous[key]);
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

function direction(delta, inverse = false) {
  if (!Number.isFinite(delta) || delta === 0) return "stable";
  const positive = delta > 0;
  return inverse ? (positive ? "improving" : "deteriorating") : (positive ? "increasing" : "decreasing");
}
