import { buildTemporalState } from "./temporal.js";

export function createLiveMonitor({
  intervalMs = 30_000,
  maxSnapshots = 12,
  onAssessment,
  logger = null
} = {}) {
  if (typeof onAssessment !== "function") throw new TypeError("onAssessment is required");

  const jobs = new Map();

  function start({ mint, run, onAssessment }) {
    if (!mint || typeof run !== "function") throw new TypeError("mint and run are required");
    stop(mint);

    const job = {
      stopped: false,
      timer: null,
      snapshots: [],
      running: false
    };
    jobs.set(mint, job);

    const tick = async () => {
      if (job.stopped || job.running) return;
      job.running = true;
      try {
        const result = await run(job.snapshots);
        if (result?.state) {
          job.snapshots = [...job.snapshots, result.state].slice(-maxSnapshots);
        }
        if (result && typeof onAssessment === "function") await onAssessment(result, job.snapshots);
      } catch (error) {
        logger?.error?.("[jevsentinel-live] monitoring tick failed");
      } finally {
        job.running = false;
        if (!job.stopped) job.timer = setTimeout(tick, intervalMs);
      }
    };

    void tick();
    return { stop: () => stop(mint) };
  }

  function stop(mint) {
    const job = jobs.get(mint);
    if (!job) return false;
    job.stopped = true;
    if (job.timer) clearTimeout(job.timer);
    jobs.delete(mint);
    return true;
  }

  function stopAll() {
    for (const mint of [...jobs.keys()]) stop(mint);
  }

  return { start, stop, stopAll, size: () => jobs.size };
}

export function buildLiveSnapshot(state) {
  const intelligence = state?.intelligence ?? [];
  const fields = Object.fromEntries(
    intelligence.flatMap((item) => Object.entries(item.fields ?? {}))
  );
  const market = fields.marketDynamics ?? {};
  const liquidity = fields.liquidityStructure ?? {};
  const wallet = fields.walletBehaviour ?? {};
  const flow = fields.flowDynamics ?? {};

  return {
    observedAt: new Date().toISOString(),
    price: number(fields.priceUsd),
    liquidity: number(fields.liquidityUsd ?? liquidity.usd),
    volume: number(fields.volume5mUsd),
    sellUsd: number(fields.sellUsd ?? flow.sellUsd),
    buyUsd: number(fields.buyUsd ?? flow.buyUsd),
    sellerCount: number(fields.sellerCount ?? wallet.uniqueSellers)
  };
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
