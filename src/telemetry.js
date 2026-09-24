export function createTelemetryRecord({ observation, state, intelligence, assessment }) {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    mint: observation.mint,
    symbol: observation.symbol,
    sourceCard: observation.sourceCard,
    signalTime: observation.signalTime,
    observedAt: observation.observedAt,
    state,
    intelligence,
    assessment,
    outcome: null
  };
}

export function attachOutcome(record, outcome) {
  return {
    ...record,
    outcome: {
      recordedAt: new Date().toISOString(),
      ...outcome
    }
  };
}

export class MemoryTelemetry {
  #records = [];
  append(record) { this.#records.push(structuredClone(record)); return record.id; }
  get(id) { return this.#records.find((r) => r.id === id) ?? null; }
  all() { return structuredClone(this.#records); }
  updateOutcome(id, outcome) {
    const record = this.#records.find((r) => r.id === id);
    if (!record) throw new Error("telemetry record not found");
    record.outcome = { recordedAt: new Date().toISOString(), ...outcome };
    return structuredClone(record);
  }
}
