const X_API_ROOT = "https://api.x.com/2/tweets/search/recent";
const CACHE_TTL_MS = 90_000;
const HISTORY_TTL_MS = 15 * 60_000;
const MAX_RESULTS = 50;
const cache = new Map();
const BULLISH = /\b(accumulat|breakout|bullish|buy|buying|bid|bids|send|moon|pump|run|higher|strength|strong|rotation|gem|undervalued|launch|listing)\b/i;
const BEARISH = /\b(rug|scam|dump|dumping|sell|selling|bearish|exit|avoid|fraud|dead|collapse|drain|exploit|hack|fud|weakness|weak)\b/i;

export function createSocialNarrativeProvider({ fetchImpl = fetch, bearerToken = process.env.X_BEARER_TOKEN, now = () => Date.now(), cacheTtlMs = CACHE_TTL_MS } = {}) {
  return {
    name: "social-narrative",
    async scan(observation) {
      const symbol = String(observation?.symbol ?? "").trim().toUpperCase();
      if (!symbol || symbol === "UNKNOWN") return emptyResult("unavailable", "token symbol unavailable");
      if (!bearerToken?.trim()) return emptyResult("unavailable", "X_BEARER_TOKEN not configured");
      const key = symbol;
      const cached = cache.get(key);
      const currentTime = now();
      if (cached && currentTime - cached.fetchedAt < cacheTtlMs) return { ...cached.result, cacheHit: true };
      try {
        const result = await lookupSymbol({ symbol, fetchImpl, bearerToken: bearerToken.trim(), now: currentTime });
        cache.set(key, { fetchedAt: currentTime, result });
        return result;
      } catch (error) {
        return emptyResult("error", error instanceof Error ? error.message : String(error));
      }
    }
  };
}

async function lookupSymbol({ symbol, fetchImpl, bearerToken, now }) {
  const query = "$" + escapeQuery(symbol) + " -is:retweet -is:reply lang:en";
  const params = new URLSearchParams({
    query, max_results: String(MAX_RESULTS),
    "tweet.fields": "created_at,public_metrics,author_id,lang",
    expansions: "author_id",
    "user.fields": "username,public_metrics,verified,verified_type"
  });
  const response = await fetchImpl(X_API_ROOT + "?" + params.toString(), { headers: { Authorization: "Bearer " + bearerToken } });
  const body = await response.json();
  if (!response.ok) throw new Error("X recent search HTTP " + response.status);
  const users = new Map((body?.includes?.users ?? []).map((user) => [String(user.id), user]));
  const posts = (Array.isArray(body?.data) ? body.data : []).map((post) => ({
    ...post,
    authorFollowers: Number(users.get(String(post.author_id ?? ""))?.public_metrics?.followers_count ?? 0),
    authorVerified: users.get(String(post.author_id ?? ""))?.verified === true,
  }));
  const previous = cache.get(symbol)?.result?.socialPosts ?? [];
  const merged = mergePosts([...previous, ...posts], now - HISTORY_TTL_MS);
  return buildResult({ symbol, posts: merged, users, fetchedAt: new Date(now).toISOString(), query });
}

function buildResult({ symbol, posts, users, fetchedAt, query }) {
  const uniqueAuthors = new Set(); let bullish = 0; let bearish = 0; let engagementTotal = 0; let influencerMentions = 0; const authorCredibility = [];
  for (const post of posts) {
    const authorId = String(post.author_id ?? "");
    if (authorId) uniqueAuthors.add(authorId);
    const sentiment = classifySentiment(String(post.text ?? ""));
    if (sentiment === "bullish") bullish += 1;
    if (sentiment === "bearish") bearish += 1;
    const metrics = post.public_metrics ?? {};
    const engagement = Number(metrics.like_count ?? 0) + Number(metrics.retweet_count ?? 0) + Number(metrics.reply_count ?? 0) + Number(metrics.quote_count ?? 0);
    engagementTotal += Number.isFinite(engagement) ? engagement : 0;
    const followers = Number(post.authorFollowers ?? 0);
    if (followers >= 10_000) influencerMentions += 1;
    authorCredibility.push(computeCredibility(followers, engagement));
  }
  const mentionCount = posts.length;
  const uniqueAuthorCount = uniqueAuthors.size;
  const sourceDiversity = Number(Math.min(1, uniqueAuthorCount / Math.max(2, Math.ceil(Math.sqrt(Math.max(1, mentionCount))))).toFixed(3));
  const credibility = authorCredibility.length ? Number((authorCredibility.reduce((sum, value) => sum + value, 0) / authorCredibility.length).toFixed(3)) : 0;
  const contradictionRatio = mentionCount ? Number((bearish / mentionCount).toFixed(3)) : 0;
  const persistenceMinutes = persistenceWindow(posts);
  const persistence = Math.min(1, persistenceMinutes / 180);
  const durability = Number(Math.max(0, Math.min(1, credibility * 0.35 + sourceDiversity * 0.30 + persistence * 0.20 - contradictionRatio * 0.15)).toFixed(3));
  const now = Date.now();
  const midpoint = now - 30 * 60_000;
  const recentCount = posts.filter((post) => Date.parse(post.created_at ?? 0) >= midpoint).length;
  const olderCount = Math.max(0, mentionCount - recentCount);
  const velocity = olderCount === 0 ? (recentCount > 0 ? "emerging" : "flat") : recentCount / olderCount >= 1.5 ? "accelerating" : recentCount / olderCount <= 0.67 ? "decelerating" : "stable";
  const direction = bullish > bearish ? "bullish" : bearish > bullish ? "bearish" : "mixed";
  const tier = mentionCount === 0 ? "unavailable" : contradictionRatio >= 0.33 ? "contested" : persistence >= 0.5 && sourceDiversity >= 0.5 ? "confirmed" : velocity === "emerging" || velocity === "accelerating" ? "emerging" : "decaying";
  return { socialNarrative: { provider: "x-api", status: "available", symbol, query, fetchedAt, postCount: mentionCount, uniqueAuthors: uniqueAuthorCount, bullishMentions: bullish, bearishMentions: bearish, sentimentDirection: direction, sourceDiversity, credibilityScore: credibility, influencerMentions, persistenceMinutes, persistenceScore: Number(persistence.toFixed(3)), contradictionRatio, durabilityScore: durability, velocity, narrativeTier: tier, engagementTotal, lookbackMinutes: 15, cacheHit: false }, socialPosts: posts.slice(-20) };
}

function classifySentiment(text) { const bullish = BULLISH.test(text); const bearish = BEARISH.test(text); if (bullish && !bearish) return "bullish"; if (bearish && !bullish) return "bearish"; return "neutral"; }
function computeCredibility(followers, engagement) { const followerScore = Math.min(1, Math.log10(followers + 10) / 5); const engagementScore = Math.min(1, engagement / 400); return Number((followerScore * 0.6 + engagementScore * 0.4).toFixed(3)); }
function persistenceWindow(posts) { if (posts.length < 2) return 0; const timestamps = posts.map((post) => Date.parse(post.created_at ?? "")).filter(Number.isFinite); if (timestamps.length < 2) return 0; return Math.max(0, (Math.max(...timestamps) - Math.min(...timestamps)) / 60_000); }
function mergePosts(posts, cutoff) { const unique = new Map(); for (const post of posts) { const timestamp = Date.parse(post?.created_at ?? ""); if (!post?.id || !Number.isFinite(timestamp) || timestamp < cutoff) continue; unique.set(String(post.id), post); } return [...unique.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)); }
function emptyResult(status, reason) { return { socialNarrative: { provider: "x-api", status, reason, postCount: 0, uniqueAuthors: 0, bullishMentions: 0, bearishMentions: 0, sentimentDirection: "unknown", sourceDiversity: null, credibilityScore: null, influencerMentions: 0, persistenceMinutes: 0, persistenceScore: null, contradictionRatio: null, durabilityScore: null, velocity: "unknown", narrativeTier: "unavailable", engagementTotal: 0, lookbackMinutes: 15 }, socialPosts: [] }; }
function escapeQuery(symbol) { return symbol.replace(/["\\]/g, ""); }
export function __resetSocialNarrativeCacheForTests() { cache.clear(); }
