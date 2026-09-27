export function buildObservedOutcome({ snapshots = [], source = "live-monitor-window" } = {}) {
  const states = snapshots.filter(Boolean);
  const prices = states
    .map((state) => finite(state?.temporal?.latest?.price))
    .filter(Number.isFinite);
  const first = states.at(0)?.temporal?.latest ?? null;
  const last = states.at(-1)?.temporal?.latest ?? null;
  const entryPrice = finite(first?.price);
  const terminalPrice = finite(last?.price);
  const entryLiquidityUsd = finite(first?.liquidity);
  const terminalLiquidityUsd = finite(last?.liquidity);

  const returns = entryPrice > 0
    ? prices.map((price) => (price / entryPrice - 1) * 100)
    : [];
  const peakGainPct = returns.length ? Math.max(...returns) : null;
  const terminalReturnPct = Number.isFinite(terminalPrice) && entryPrice > 0
    ? (terminalPrice / entryPrice - 1) * 100
    : null;

  let peak = entryPrice;
  let maxDrawdownPct = null;
  for (const price of prices) {
    if (!(price > 0)) continue;
    peak = Math.max(peak, price);
    const drawdown = (price / peak - 1) * 100;
    maxDrawdownPct = maxDrawdownPct === null ? drawdown : Math.min(maxDrawdownPct, drawdown);
  }

  return {
    label: "unresolved",
    source,
    completedAt: new Date().toISOString(),
    sampleCount: states.length,
    entryPrice,
    terminalPrice,
    peakGainPct: finiteOrNull(peakGainPct),
    terminalReturnPct: finiteOrNull(terminalReturnPct),
    maxDrawdownPct: finiteOrNull(maxDrawdownPct),
    entryLiquidityUsd,
    terminalLiquidityUsd,
    liquidityChangeUsd: finiteOrNull(
      Number.isFinite(entryLiquidityUsd) && Number.isFinite(terminalLiquidityUsd)
        ? terminalLiquidityUsd - entryLiquidityUsd
        : null
    ),
    liquidityChangePct: finiteOrNull(
      Number.isFinite(entryLiquidityUsd) && entryLiquidityUsd > 0 && Number.isFinite(terminalLiquidityUsd)
        ? (terminalLiquidityUsd / entryLiquidityUsd - 1) * 100
        : null
    )
  };
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}
