import { IntelligenceProvider } from "../intelligence.js";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";\nconst cache = new Map();\nlet activeScans = 0;

export function createTransferFlowProvider({
  fetchImpl = globalThis.fetch,
  rpcUrl = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC,
  windowMs = 300_000,
  signatureLimit = 40,
  timeoutMs = 2500
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is required");

  return new IntelligenceProvider("transfer-flow", async (observation) => {
    const mint = observation.mint;
    const now = Date.parse(observation.observedAt || new Date().toISOString());
    const events = Array.isArray(observation.transfers?.events) ? observation.transfers.events : [];
    const chainEvents = await fetchRecentTokenTransfers(mint, fetchImpl, rpcUrl, signatureLimit, timeoutMs);
    const merged = [...events, ...chainEvents];

    const recent = merged.filter((event) => {
      const at = Date.parse(event.observedAt ?? event.timestamp ?? "");
      return Number.isFinite(at) && now - at >= 0 && now - at <= windowMs;
    });

    const result = {\n      burst: recent.length >= 3,((e) => e.direction === "out" || e.type === "sell").map((e) => e.owner || e.sender).filter(Boolean));
    const buyers = new Set(recent.filter((e) => e.direction === "in" || e.type === "buy").map((e) => e.owner || e.receiver).filter(Boolean));
    const watched = new Set(observation.wallets?.watched ?? []);
    const watchedMatches = recent.filter((e) => watched.has(e.owner) || watched.has(e.sender) || watched.has(e.receiver)).length;
    const sellerCounts = countBy(recent.filter((e) => e.direction === "out" || e.type === "sell").map((e) => e.owner || e.sender).filter(Boolean));

    return {
      burst: recent.length >= 3,
      transferCount: recent.length,
      totalAmount: recent.reduce((sum, e) => sum + finite(e.amount), 0),
      uniqueSenders: new Set(recent.map((e) => e.sender).filter(Boolean)).size,
      uniqueReceivers: new Set(recent.map((e) => e.receiver).filter(Boolean)).size,
      uniqueSellers: sellers.size,
      uniqueBuyers: buyers.size,
      watchedMatches,
      windowMs,
      direction: classifyDirection(recent, watched),
      sellerAcceleration: sellerCounts.size ? Math.max(...sellerCounts.values()) : 0,
      coordinatedSellers: [...sellerCounts.values()].filter((count) => count >= 2).length,
      events: recent.slice(-50)
    };
  });
}

async function fetchRecentTokenTransfers(mint, fetchImpl, rpcUrl, limit, timeoutMs) {
  try {
    const signatures = await rpc(fetchImpl, rpcUrl, "getSignaturesForAddress", [mint, { limit }], timeoutMs);
    const list = Array.isArray(signatures) ? signatures : [];
    const events = [];
    for (const item of list.slice(0, Math.min(list.length, 20))) {
      if (!item?.signature) continue;
      const tx = await rpc(fetchImpl, rpcUrl, "getTransaction", [
        item.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
      ], timeoutMs);
      events.push(...parseTokenBalanceFlow(tx, mint, item));
    }
    return events;
  } catch {
    return [];
  }
}

function parseTokenBalanceFlow(tx, mint, signatureInfo) {
  const meta = tx?.meta;
  const message = tx?.transaction?.message;
  if (!meta || !message) return [];
  const pre = new Map((meta.preTokenBalances ?? []).filter((x) => x.mint === mint).map((x) => [
    x.accountIndex,
    { amount: Number(x.uiTokenAmount?.uiAmount ?? 0), owner: x.owner ?? null }
  ]));
  const post = new Map((meta.postTokenBalances ?? []).filter((x) => x.mint === mint).map((x) => [
    x.accountIndex,
    { amount: Number(x.uiTokenAmount?.uiAmount ?? 0), owner: x.owner ?? null }
  ]));
  const keys = message.accountKeys ?? [];
  const events = [];
  for (const index of new Set([...pre.keys(), ...post.keys()])) {
    const before = pre.get(index)?.amount ?? 0;
    const after = post.get(index)?.amount ?? 0;
    const delta = after - before;
    if (!Number.isFinite(delta) || delta === 0) continue;
    const owner = post.get(index)?.owner ?? pre.get(index)?.owner ?? null;
    events.push({
      observedAt: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : new Date().toISOString(),
      timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : new Date().toISOString(),
      signature: signatureInfo.signature,
      owner: typeof owner === "string" ? owner : null,
      amount: Math.abs(delta),
      direction: delta < 0 ? "out" : "in",
      type: delta < 0 ? "sell" : "buy"
    });
  }
  return events;
}

async function rpc(fetchImpl, url, method, params, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("RPC request failed");
    const body = await response.json();
    if (body?.error) throw new Error(body.error.message ?? "RPC request failed");
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function classifyDirection(events, watched) {
  const outbound = events.filter((e) => e.direction === "out" && (watched.size === 0 || watched.has(e.owner) || watched.has(e.sender))).length;
  const inbound = events.filter((e) => e.direction === "in" && (watched.size === 0 || watched.has(e.owner) || watched.has(e.receiver))).length;
  if (outbound > inbound) return "outbound";
  if (inbound > outbound) return "inbound";
  return events.length ? "mixed" : "none";
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
