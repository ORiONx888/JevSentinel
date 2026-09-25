import test from "node:test";
import assert from "node:assert/strict";
import { createTokenResearchProvider } from "../src/providers/tokenResearch.js";

function response(json, ok = true) {
  return { ok, status: ok ? 200 : 500, async json() { return json; } };
}

test("token research digs into CA independently of card fields", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("dexscreener") || url.includes("dex.test")) {
      return response({
        pairs: [{
          liquidity: { usd: 8000, base: 100000, quote: 8 },
          marketCap: 50000,
          priceUsd: "0.0005",
          priceChange: { m5: -25, h1: -40 },
          volume: { m5: 30000, h1: 90000 },
          txns: { m5: { buys: 10, sells: 30 } },
          pairCreatedAt: Date.now() - 3600000,
          pairAddress: "PAIR",
          dexId: "raydium"
        }]
      });
    }
    const body = JSON.parse(options.body);
    if (body.method === "getTokenSupply") {
      return response({ result: { value: { amount: "1000000", decimals: 0, mintAuthority: "AUTH", freezeAuthority: null } } });
    }
    if (body.method === "getTokenLargestAccounts") {
      return response({ result: { value: [
        { amount: "300000" }, { amount: "100000" }, { amount: "50000" },
        { amount: "50000" }, { amount: "50000" }, { amount: "50000" },
        { amount: "50000" }, { amount: "50000" }, { amount: "50000" }, { amount: "50000" }
      ] } });
    }
    throw new Error("unexpected RPC method");
  };

  const provider = createTokenResearchProvider({
    fetchImpl,
    rpcUrl: "https://rpc.test",
    dexUrl: "https://dexscreener.test/latest/dex/tokens"
  });

  const result = await provider.scan({ mint: "MintFromCAOnly" });
  assert.equal(result.authority.mintAuthorityActive, true);
  assert.equal(result.holders.top10ConcentrationPct, 80);
  assert.equal(result.liquidityUsd, 8000);
  assert.equal(result.sellCount5m, 30);
  assert.equal(result.buyCount5m, 10);
  assert.ok(result.riskFlags.includes("mint-authority-active"));
  assert.ok(result.riskFlags.includes("high-top10-concentration"));
  assert.ok(result.riskFlags.includes("low-liquidity"));
  assert.ok(result.riskFlags.includes("sell-pressure"));
  assert.ok(result.riskFlags.includes("rapid-price-deterioration"));
  assert.ok(calls.some((c) => c.url.includes("/MintFromCAOnly")));
  assert.ok(calls.some((c) => JSON.parse(c.options.body ?? "{}").method === "getTokenSupply"));
});

test("token research tolerates missing market pair", async () => {
  const fetchImpl = async (url, options = {}) => {
    if (url.includes("dex.test")) return response({ pairs: [] });
    const body = JSON.parse(options.body);
    if (body.method === "getTokenSupply") return response({ result: { value: { amount: "100", decimals: 0, mintAuthority: null, freezeAuthority: null } } });
    return response({ result: { value: [] } });
  };
  const provider = createTokenResearchProvider({ fetchImpl, rpcUrl: "https://rpc.test", dexUrl: "https://dex.test/tokens" });
  const result = await provider.scan({ mint: "MintOnly" });
  assert.equal(result.marketCapUsd, null);
  assert.equal(result.liquidityUsd, null);
  assert.equal(result.authority.mintAuthorityActive, false);
});
