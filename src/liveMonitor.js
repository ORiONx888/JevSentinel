export function createLiveMonitor({
  intervalMs = 10_000,
  maxSnapshots = 12,
  logger = null
} = {}) {
  const jobs = new Map();

  function start({ mint, run, onAssessment, initialState = null }) {
    if (!mint || typeof run !== "function") throw new TypeError("mint and run are required");
    stop(mint);

    const job = {
      stopped: false,
      timer: null,
      snapshots: initialState ? [initialState] : [],
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
        if (result && typeof onAssessment === "function") {
          await onAssessment(result, job.snapshots);
        }
        if (job.snapshots.length >= maxSnapshots) {
          job.stopped = true;
          jobs.delete(mint);
          return;
        }
      } catch (error) {
        logger?.error?.("[jevsentinel-live] monitoring tick failed");
      } finally {
        job.running = false;
        if (!job.stopped) job.timer = setTimeout(tick, intervalMs);
      }
    };

    job.timer = setTimeout(tick, intervalMs);
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
