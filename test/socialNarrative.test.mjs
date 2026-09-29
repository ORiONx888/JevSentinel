import test from "node:test";
import assert from "node:assert/strict";
import { __resetSocialNarrativeCacheForTests, createSocialNarrativeProvider } from "../src/providers/socialNarrative.js";

test("social provider performs a bounded X recent-search lookup and normalizes narrative evidence", async () => {
  __resetSocialNarrativeCacheForTests();
  let requestedUrl = "";
  const provider = createSocialNarrativeProvider({
    bearerToken: "test-token",
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.headers.Authorization, "Bearer test-token");
      return new Response(JSON.stringify({
        data: [
          { id: "1", author_id: "a", created_at: "2026-09-28T15:00:00.000Z", text: "$TEST breakout strength", public_metrics: { like_count: 10, retweet_count: 2, reply_count: 1, quote_count: 0 } },
          { id: "2", author_id: "b", created_at: "2026-09-28T15:04:00.000Z", text: "$TEST accumulating, strong", public_metrics: { like_count: 20, retweet_count: 3, reply_count: 1, quote_count: 0 } },
          { id: "3", author_id: "c", created_at: "2026-09-28T15:08:00.000Z", text: "$TEST dump, avoid", public_metrics: { like_count: 5, retweet_count: 0, reply_count: 0, quote_count: 0 } }
        ],
        includes: { users: [
          { id: "a", username: "one", public_metrics: { followers_count: 20000 }, verified: true },
          { id: "b", username: "two", public_metrics: { followers_count: 5000 }, verified: false },
          { id: "c", username: "three", public_metrics: { followers_count: 100 }, verified: false }
        ] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    now: () => Date.parse("2026-09-28T15:10:00.000Z"),
  });
  const result = await provider.scan({ symbol: "TEST" });
  assert.match(requestedUrl, /tweets%2Fsearch%2Frecent|tweets\/search\/recent/);
  assert.equal(result.socialNarrative.postCount, 3);
  assert.equal(result.socialNarrative.uniqueAuthors, 3);
  assert.equal(result.socialNarrative.bullishMentions, 2);
  assert.equal(result.socialNarrative.bearishMentions, 1);
  assert.equal(result.socialNarrative.sentimentDirection, "bullish");
  assert.equal(result.socialNarrative.influencerMentions, 1);
  assert.ok(result.socialNarrative.sourceDiversity > 0);
  assert.ok(result.socialNarrative.durabilityScore >= 0);
});

test("social provider fails open as unavailable when the X secret is absent", async () => {
  __resetSocialNarrativeCacheForTests();
  const provider = createSocialNarrativeProvider({ bearerToken: "" });
  const result = await provider.scan({ symbol: "TEST" });
  assert.equal(result.socialNarrative.status, "unavailable");
  assert.equal(result.socialNarrative.narrativeTier, "unavailable");
});

test("social provider caches repeated live ticks", async () => {
  __resetSocialNarrativeCacheForTests();
  let calls = 0;
  const provider = createSocialNarrativeProvider({
    bearerToken: "test-token",
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [], includes: { users: [] } }), { status: 200 });
    },
    now: () => 1_000,
  });
  await provider.scan({ symbol: "TEST" });
  await provider.scan({ symbol: "TEST" });
  assert.equal(calls, 1);
});
