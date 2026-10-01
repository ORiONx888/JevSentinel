# JevSentinel BUY/ADD research — can VolSpike's EXISTING data answer it?

**Date:** 2026-10-01 · **Author:** engineer (delegated, READ-ONLY) · **Status:** evidence only — no rule, gate, or threshold proposed.
**Question:** independent smart / profitable / KOL wallets buying around a CW2 event (participation persisting,
then market confirmation) distinguishes tokens that expand from those that fail.

**What was read:** `ksGmgn.ts`, `ksLedger.ts`, `conviction2.ts`, `conviction.ts` (scoring-log DDL), `bot/kol.ts`,
`gmgnKolFeed.ts`, `gmgnFeedLedger.ts`, `gmgnFeedOutcomes.ts`, `walletBuyEventOutcomes.ts`, `walletConcOutcomes.ts`,
`walletTracker.ts`, `earlierEntryOutcomes.ts`, `earlierEntryFeed.ts`, `jevEarlierEntryShadow.ts`, `server/jevBridge.ts`,
`scripts/wallet-roster-wave1.ts`, `bot/walletDissect.ts` + their tests; whole-repo grep for `wallet_*`, `kolvc`,
`specialist_signals`, `conviction_*`, `t300/t600`, wallet PnL/tags.
**DBs used:** `/data/volspike.db` read-only in-VM (live, resolved machine `894556b64d34d8`) **plus** local copies
`/tmp/live.db` (= `topcalls-recovery-20260923/pulled/live_volspike.db.gz`, 09-21T09:47Z→09-24T09:13Z) and `/tmp/young.db`
(→09-23). **Not found:** `/tmp/merged.db` does not exist here; no pre-09-21 local copy. **Not verified:** whether GMGN's
`/v1/user/kol` payload carries a per-trade timestamp (our parser reads none; test fixtures are synthetic).
**Repo left untouched:** `main` @ `6bfe28c`, working tree clean (the 3-commit `ahead` is pre-existing).

---

## A) PER-SOURCE 12-QUESTION MATRIX

`addr`=wallet address · `ts`=per-trade timestamp · `side`=buy/sell · `size`=trade value · `cls`=wallet class
(smart/KOL/whale) at event time.

| # | Source (table / module) | Q1 What is stored | Q2 When | Q3 addr | Q4 ts | Q5 side | Q6 size | Q7 mint | Q8 cls |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `cw_ks_experiment` (ksLedger.ts:85) | 1 row/ CW2 pick: called_at, kol_posture, buy_conc, keep_pass, base/total score, t60_*, gmgn_{smart,renowned,sniper,bundler,rat}_wallets + `gmgn_fetched_at` | **decision-time**, at pick emit (conviction2.ts:905 + ksGmgn.ts:230) | ✗ | ✓ call ts | ✗ | ✗ | ✓ UNIQUE | **counts only** (no identity) |
| 2 | `conviction_picks.score_breakdown` (conviction2.ts:539) | CW2 addOns incl. raw `smartWallets/renownedWallets/whaleWallets/topWallets` + points | decision-time | ✗ | ✓ posted_at | ✗ | ✗ | ✓ | counts |
| 3 | `conviction_scoring_log.features` (conviction.ts:488; conviction2.ts:559) | `investor{smart_wallets,renowned_wallets,whale_wallets,top_wallets}` JSON | decision-time (`created_at`) | ✗ | ✓ | ✗ | ✗ | ✓ | counts |
| 4 | `jev_early_entry_shadow.specialist_signals` (jevEarlierEntryShadow.ts:366,474) | JSON `kolCount, kolSellAll, smartWallets, renownedWallets, whaleWallets, topWallets, buySellRatio, turnover, hasSocial, jevSpecialists…` | decision-time, at JEE score | ✗ | ✓ detected_at | ✗ | ✗ | ✓ PK | counts (MevX kolvc count + GMGN counts) |
| 5 | `gmgn_feed_exp` src=`gmgn-kol` (gmgnFeedLedger.ts:105,211) | per-mint aggregation of GMGN track-kol+smartmoney: `kol_buyers`, `kol_sellers`, `kol_usd`, `kol_tags` (union tag array) | first poll that sees the mint (UNIQUE(mint,source)) | ✗ (**discarded**) | ✗ | counts only | total USD | ✓ | tag union only |
| 6 | `gmgn_feed_seen_tx` (gmgnFeedLedger.ts:132) | tx_hash, mint, source, `seen_at` (poll time) | poll time | ✗ | ✗ (poll, not trade) | ✗ | ✗ | ✓ | ✗ |
| 7 | `wallet_buy_events` (walletTracker.ts:206) | wallet, mint, tx_hash, `ts` (unix **s**), usd, launchpad, symbol, price, t60_mult/2x, outcome_done… | on poll (≤180 s lag), **roster-scoped** | **✓** | **✓ 1-second** | buy-only (table) | ✓ usd | ✓ | ✗ (join to #10) |
| 8 | `wallet_sell_events` (walletTracker.ts:90) | wallet, mint, tx_hash, ts, usd, symbol, price | 09-25→09-26 only | ✓ | ✓ | sell-only | ✓ | ✓ | ✗ |
| 9 | `wallet_conc_exp` (walletTracker.ts:267) | per mint-EPISODE: `wallets_json` (**address array**), n_wallets, first_ts/last_ts, anchor_price, t60_* | at detection; stopped 09-22 | **✓** | window only (first/last) | ✗ | ✗ | ✓ | ✗ |
| 10 | `watched_wallets` (walletTracker.ts:191) | address, twitter, `tags_json`, n_coins, wins, `winrate`, `tot_realized_usd`, `lifetime_realized_usd`, status | roster seeded 08-08→09-15 | ✓ | ✗ | ✗ | ✗ | ✗ | **✓ (as of seed)** |
| 11 | MevX top-50 holders (kol.ts:105) | **nothing persisted** — `summarizeHolders()` returns `{kolCount, anySellAll}` only | fetch at score time | ✗ | ✗ | ✗ | ✗ | ✗ | quote-cached 10 min |
| 12 | `earlier_entry_feed` (earlierEntryFeed.ts) | mint, source, earliest_ts, first_seen_ts, age, firing_eligible | at first sight | ✗ | mint-time only | ✗ | ✗ | ✓ | ✗ |
| 13 | Outcomes (all ledgers) | `t60_mult`/`t60_2x` + `call_performance.audited_at`; historical path via GMGN `token_kline` **1-min candles** (earlierEntryOutcomes.ts:1-30) | +60 min | – | – | – | – | ✓ | – |

**Q9–Q12**

| # | Source | Q9 historical wallet PnL available? | Q10 knowable AT T0? | Q11 joinable to CW2 pick? | Q12 joinable to outcome? |
|---|---|---|---|---|---|
| 1,2,3 | KS/CW2 snapshots | n/a (counts) | **YES — persisted at decision time** | *is* the CW2 pick (`mint`) | yes, own t60_* + audit join |
| 4 | JEE shadow | n/a (counts) | YES (JEE's own score time) | only via `mint`; **different detection path** (JEV shadow ≠ CW2 event) | yes, own peak/entry (see JEE traps²) |
| 5 | gmgn_feed_exp kol arm | ✗ | YES for the tag *union* at first poll | `mint` join ok; **not aligned to T0** (first-poll wins) | yes, t60_2x |
| 6 | seen_tx | ✗ | n/a | ✗ | ✗ |
| 7 | wallet_buy_events | via #10 (`lifetime_realized_usd`) | class/rep = **seed-time snapshot**, not event-time | YES by `mint`; **but almost never near T0** (see C) | yes (own t60_2x + 1-min candles) |
| 8 | wallet_sell_events | via #10 | same caveat | only 46 rows / 3 wallets | ✗ (no outcome cols) |
| 9 | wallet_conc_exp | via #10 | roster class at detection | `mint` join; **stalled since 09-22** | yes, t60_2x |
| 10 | watched_wallets | **YES** (lifetime winrate/PnL) | only as a *seed-time* snapshot (08-08→09-15 vintage); roster is a SELECTED set | key = `address` | ✗ |
| 11 | MevX holders | ✗ | the KOL class **is** knowable at T0 — but nothing is stored | ✗ | ✗ |
| 12 | earlier_entry_feed | ✗ | n/a | `mint` join ok, ~1 row/mint | yes |

---

## B) DECISION-TIME vs LOOK-AHEAD AUDIT

Three clean tiers — every wallet-quality signal in the repo falls into one:

**(i) Call-time snapshot persisted at decision (SAFE, no look-ahead).**
* GMGN `wallet_tags_stat` COUNTS on `cw_ks_experiment` (`gmgn_fetched_at` written at enrichment; conviction2.ts:905-937) —
  smart/renowned/sniper/bundler/rat counts, capture 52.2% overall.
* CW2 add-on counts inside `conviction_picks.score_breakdown` + `conviction_scoring_log.features`
  (smart/renowned/whale/top) — written in the same transaction as the pick.
* `kol_posture` (+12/−8/0) — MevX top-50 `metadata.kolvc` count + "any Sell All", fetched at score time (kol.ts:107-109).
* `buy_conc` (breakdown.buyConcentration) — DexScreener 5-min txns at score time.
* JEE `specialist_signals` counts, incl. `jevSpecialists` (JEV's own judgement) at JEE score time.
* `gmgn_feed_exp.gmgn-kol` `kol_buyers`/`kol_sellers`/`kol_usd`/`kol_tags` — captured at first poll (which is *before*
  the token's outcome; the ledger is append-only and carries no post-outcome re-fetch).

**(ii) Computed later from stored trades / roster (SAFE ONLY IF you use the seed-time value, not a re-read).**
* `watched_wallets.lifetime_realized_usd` / `winrate` / `n_coins` / `tags_json` — these are **GMGN lifetime stats
  captured when the roster was seeded (08-08→09-15)**, not per-event values. They are knowable *about* the wallet at
  any later T0 in the sense that the number existed, but the stored number is a snapshot of a different date and is
  never re-stamped per event. Anything computed from `wallet_buy_events` history (a wallet's own forward hit-rate =
  `t60_2x` over its prior buys, e.g. `walletLeaderboard.ts`) is **honest at event time only if you restrict to buys
  that resolved before T0** — that restriction is *not* enforced anywhere today.
* `/dissect` (walletDissect.ts:1-40) computes per-coin `realized_profit` + lifetime winrate for a mint's traders.
  Run today for a historical CW2 mint it sees the **completed** outcome → strict look-ahead; the bot command re-fetches
  (`/dissect <CA>`), nothing is stored per pick.

**(iii) Only derivable after the outcome (LOOK-AHEAD — must never be used as a T0 feature).**
* Any roster-membership claim built from a wallet's behaviour **on the CW2 token itself** (e.g. "the wallets that
  bought this winner"). `wallet_conc_exp.wallets_json` and `wallet_buy_events` rows for a mint are, by construction,
  populated from trades whose profitability depends on the mint's later path.
* `walletLeaderboard`-style forward hit-rates computed over the full ledger (t60_2x is only known at +60 min).

**SURVIVORSHIP BIAS — explicit.** `watched_wallets` is not a sample of the market: the Phase-2A seed and wave-1
(`scripts/wallet-roster-wave1.ts:12-14`) select on **"lifetime realized PnL > 0 AND last activity ≤ 14 d"**; wave-1
additionally prunes 21 wallets for zero hits and benches 9 borderline ones on *realised* performance. So
"a roster wallet bought this CW2 token" is a statement about a set chosen for having already won. And a wallet that
later turned out profitable (e.g. `lifetime_realized_usd` $32.2 M / $9.38 M in the current roster) does **not** prove
it was identifiable as profitable at T0 of any *specific* card — the GMGN lifetime number is itself backward-looking,
updated continuously, and exposed to us only as an undated seed snapshot. Two further caps on the same idea:
`tags_json` is empty (`[]`) for 21/147 roster rows, and 13 rows are `paused` (wash-trader) — i.e. the class label itself
is noisy. A signal defined as "≥2 independent smart/KOL wallets bought before T0 and kept buying" therefore cannot be
validated from stored data without the per-wallet, per-trade, timestamped capture specified in §E.

---

## C) RECONSTRUCTION FEASIBILITY — the owner's example timeline

Target: `CW2 at T0 → Wallet A buys T−30s [known smart] → B buys T+10s [KOL] → C buys T+20s [ordinary] → participation
persists → price expands.`

| Slot | Fillable from existing data? | Evidence |
|---|---|---|
| CW2 event with mint + T0 | **YES** — `cw_ks_experiment.mint/called_at` (1,852 rows, UNIQUE(mint), ms precision); mirrors `conviction_picks` (`source='conviction_v2'`) | probe |
| Wallet ADDRESSES that bought around T0 (market-wide) | **EMPTY.** The only market-wide wallet-level stream (GMGN track kol/smartmoney, ~1.2 M seen tx) is aggregated per mint and its `maker` address is dropped before insert | gmgnFeedLedger.ts:211-237 |
| Wallet A/B/C addresses from our own roster | **MOSTLY EMPTY**: 289/1,852 CW2 picks (15.6%) have *any* roster buy; per-mint nearest roster buy to T0: **2 within ±30 s, 2 within ±5 min, 10 within ±1 h, 41 within ±6 h** | live probe |
| Per-wallet BUY timestamps near T0 | 1-second precision **exists** (`wallet_buy_events.ts`) but on the rows above — i.e. ~2 usable pairs total, 2,472 pairs otherwise scattered from −9.3 h to +25.5 d | live probe |
| Wallet CLASS at the event (smart / KOL / ordinary) | Roster class only, joined from `watched_wallets.tags_json` (seed vintage) — **no event-time stamp, and no "ordinary" population at all** | walletTracker.ts:191 |
| Trade side | buys ✓ (`wallet_buy_events`), sells ✗ live (46 rows, 09-25→09-26 only, no writer on `main`) | probe + commit `2d30877` |
| Trade size | ✓ `usd` (100% filled) | probe |
| "Participation persists" | Only as the roster-scoped `wallet_conc_exp` episodes (409 rows, **stalled 09-22**) or by counting repeated `wallet_buy_events` per mint (168 mints with ≥2 roster wallets, max 14) | probe |
| "Price then expands" | **YES** — fixed-horizon `t60_mult`/`t60_2x` on every ledger; and `earlier_entry_feed`'s scorer reconstructs *historical* prices from GMGN `token_kline` **1-minute candles** for both endpoints | earlierEntryOutcomes.ts:1-30 |

**Finest timestamp granularity anywhere near a CW2 event.** Wallet trades: **1 s** (`wallet_buy_events.ts`, GMGN
activity `timestamp`, conviction2's `called_at` is ISO **ms**). GMGN feed events: no trade timestamp is even parsed
(`TradeEvent` has no ts field, gmgnKolFeed.ts:52-60); `gmgn_feed_seen_tx.seen_at` is *our poll time*. Price paths:
**1-minute** candles (GMGN kline). So the ±30 s / ±10 s framing is *measurable* in principle (1-second wallet ts), but
only for the roster, and the roster produces ~2 such pairs in the entire history. **The crux gap is wallet identity +
per-trade timestamp for non-roster wallets — both are discarded at the only place they exist today.**

---

## D) DATA-QUALITY GROUND TRUTH (measured, not inferred)

**Live `/data/volspike.db`, read-only, 2026-10-01T13:38Z**

| Table | rows | range | fill |
|---|---|---|---|
| `watched_wallets` | 147 (104 active / 13 paused / 9 benched / 21 dropped) | first_seen 08-08→09-15 | tags_json 147/147; winrate 147/147; lifetime_realized_usd 147/147; **21 rows have `tags_json='[]'`** |
| `wallet_buy_events` | **69,419** / 133 wallets / 32,941 mints | ts 2026-07-18 → 10-01T13:33Z | usd 100%; price 98.7%; outcome_done 99.96%; t60_2x=1 → 1,445 (2.08%). **ACCRUING** (105 by 13:38Z today) |
| ↳ daily | ~8.0-8.5 k/day 09-17→09-22, then 09-23: 2,161; 09-24: 7; 09-25: 64; 09-26: 528; 09-27: 680; 09-28: 555; 09-29: 320; 09-30: 221; 10-01: 105 | | **~15× drop after the 09-21 swap; not zero** |
| `wallet_sell_events` | **46** / 3 wallets | 09-25T02:09Z → 09-26T07:34Z | capture window ~1.5 days only |
| `wallet_conc_exp` | 409 / 404 mints | 09-12 → **09-22T20:39Z (stalled)** | genuine (non-terminalized) 153/409; `n_wallets≥10` only 7 |
| `wallet_poll_state` | 104 | last_polled 10-01T13:36Z | roster poller **running** |
| `cw_ks_experiment` | **1,852** | 08-23T00:32 → 10-01T13:10Z | `gmgn_fetched_at` 967 (**52.2%**; the gap is mostly the 09-03→09-10 zero-fill hole — 0 fetched on 8 consecutive days); smart=0 30 vs smart NULL 885; keep_pass 818; t60 done 1,779 |
| `jev_early_entry_shadow` | 598 | 09-21T06:57 → 10-01T13:38Z | `specialist_signals` 588 (**98.3%**); sg_sent 74 |
| `gmgn_feed_exp` | discovery 778,444 · **kol 84,288** · mevx-control 1,826 | 08-23 → 10-01 | kol: `kol_tags` 84,274 (99.98%), call_price 100% |
| `gmgn_feed_seen_tx` | 1,196,952 | 08-23 → 10-01 | tx_hash/mint/source/seen_at only |
| `conviction_picks` | conviction 2,680 · conviction_v2 2,179 · earlier 37 · fallback 12 | 08-13 → 10-01 | – |
| `conviction_scoring_log` | v2 2,677 (`features` 1,506 = **56.3%**) · v1 33,639 (features NULL) | – | – |
| `earlier_entry_feed` 731,365 (age 99.99%) · `token_alerts` 48,361 · `hot_netflow_exp` 8,282 (kol_netflow 1,300 / smart_netflow 874) | | | |

**Local copies (09-21→09-24) corroborate the schema and the GMGN-fill hole, and show 0 rows for
`wallet_buy_events`/`wallet_sell_events`/`watched_wallets`/`wallet_conc_exp` at that date** — i.e. the "roster empty
since the 09-21 swap" finding was true then; the roster (and buys) have since been re-seeded, and `watched_wallets`
is **not** empty today. **T+300 / T+600 horizons do not exist anywhere** (grep: zero hits); every horizon is T+60.

---

## E) VERDICT

# 🔴 NEW OBSERVATIONAL CAPTURE REQUIRED

Existing data can answer the **"did the card work"** half and the **"were there smart/KOL wallets in the mint"**
half *as counts*. It cannot answer **"which wallet bought when, relative to T0, and was that wallet classifiable as
smart/KOL at that moment"** — the crux of the hypothesis. Nothing can be reconstructed for history: the wallet
identity and per-trade time are destroyed at the only place they exist (GMGN track feed ingestion), and the one
wallet-level ledger we do keep is roster-scoped and yields ~2 usable ±30 s pairs.

**Why not 🟡:** the missing pieces are *not* derivable. Deriving them would mean re-fetching each past mint's holder
and trader history for every historical CW2 event — that is (a) a new data source at read time, (b) partially
look-ahead (per-coin realized PnL is only complete after the outcome), and (c) a different dataset than the forward
one, so the "forward, decision-time unbiased, replayable" requirement still forces a capture.

### MINIMUM ADDITIONAL FIELDS (capture SPEC — observational only, not an implementation)

One new fail-open, default-OFF, log-only ledger `cw2_wallet_flow_exp` (+ optionally one row per surrounding-market
wallet), written from the existing GMGN track-kol/smartmoney poll and the existing CW2 emit hook. **Per row:**

| field | source | note |
|---|---|---|
`mint` | GMGN event `base_address` / CW2 pick | join key |
`cw2_timestamp` | `cw_ks_experiment.called_at` (ISO ms) | T0 anchor; NULL when no CW2 pick exists (still log) |
`cw2_pick_id` / `source` | CW2 emit hook | ties the row to the card |
**`wallet_address`** | GMGN `maker` | **the crux — currently discarded** |
**`trade_timestamp`** | GMGN event time (unverified field; else poll `seen_at` + lag caveat) | ±30 s framing needs this |
`trade_side` | GMGN `side` (buy/sell) | buys AND sells |
`trade_value_usd` | GMGN `amount_usd` | |
`trade_price_usd` | GMGN `price_usd` | |
`wallet_class_at_event` | GMGN `maker_info.tags[]` for THAT wallet | replaces the union array |
`wallet_reputation_at_event` | `watched_wallets.tags_json` snapshot **copied into the row at write time** | so roster edits don't rewrite history |
`wallet_profitability_at_event` | `watched_wallets.winrate` / `lifetime_realized_usd` **copied at write time**, plus `stats_asof` = the seed timestamp | makes the look-ahead boundary auditable rather than assumed |
`mint_age_seconds` | `earlier_entry_feed.earliest_ts` | context |
`observed_at` | our clock | separates trade time from observation time |

**Join key:** `(mint, wallet_address, trade_timestamp)` for a single trade; `(mint, cw2_timestamp)` to attach to a
card. **Design constraints:** decision-time unbiased (class/PnL copied at write, never re-read), replayable
(append-only, idempotent on `tx_hash`), low-volume (only mints that fire a CW2 pick or a roster buy, within a
±N-minute window of T0 — not the 8 k/day firehose), fail-open (a GMGN failure never touches the card), and
independent of production decisions (no gate, no score, no alert).
**One thing to verify before building:** whether GMGN `/v1/user/kol` / `smartmoney` returns a per-trade timestamp at
all. If it does not, the class-at-event capture is still buildable but the ±30 s timing is not — and the cheapest
substitute (poll `seen_at`, ≤60 s lag) must be labelled as observation-time, not trade-time.

---

## F) OWNER-FACING SUMMARY (what the data can and cannot do today)

1. **Answerable now:** which CW2 picks had *how many* GMGN smart/renowned/whale wallets and MevX KOL tags at the
   moment of the call — 1,852 picks, 52% with the GMGN counts filled (0% for 09-03→09-10).
2. **Answerable now:** whether each CW2 pick later hit T+60 (t60_mult / t60_2x) and whether it cleared the audit gate.
3. **Answerable now:** whether *our roster* of 104 profitable wallets bought the same mint — 289 of 1,852 picks (16%).
4. **NOT answerable:** who bought, when, in any wallet outside our roster. That stream is ingested (1.2 M trades seen)
   but the wallet address and trade timestamp are thrown away before storage.
5. **NOT answerable:** whether a buying wallet was "profitable" *as of that moment* — our stored PnL/winrate is an
   undated seed snapshot used to *select* the roster, which is survivorship-selected by construction.
6. **NOT answerable:** any "wallet A at T−30 s, wallet B at T+10 s" timeline. Across all history our roster gives
   **2 pairs within ±30 s** of a card and none of them is a market-wide sample.
7. **Side data:** sells are effectively absent — 46 sell rows across 1.5 days, and the code that wrote them was
   removed in September.
8. **Horizon:** only T+60 exists. T+300 / T+600 do not.
9. **Smallest missing piece that unlocks the research:** persist, per trade, `wallet_address` + `trade_timestamp` +
   `side` + `usd` + that wallet's tags, next to the existing `mint` — i.e. stop discarding the identity in the GMGN
   track-kol/smartmoney ingestion we already pay for and already poll every 60 s.
10. **Consequence:** until that capture is on, any forward claim about "independent smart wallets buying around the
    card" would rest on counts and on a survivorship-selected roster — it cannot be pre-registered honestly today.

---

### Evidence index (file:line)
`walletTracker.ts:87-90,191,206,230-265,267,322,387-425,595` · `gmgnFeedLedger.ts:105-130,132,211-237` ·
`gmgnKolFeed.ts:52-60,77-105` · `ksGmgn.ts:53-63,220-244` · `ksLedger.ts:57-64,85,126` ·
`conviction2.ts:522-548,559-575,874-883,899-937` · `conviction.ts:488-499` · `kol.ts:107,109` ·
`jevEarlierEntryShadow.ts:262,366,474` · `earlierEntryOutcomes.ts:1-30` · `walletBuyEventOutcomes.ts:1-20` ·
`walletConcOutcomes.ts:1-30` · `scripts/wallet-roster-wave1.ts:12-14` · `walletDissect.ts:1-40` ·
`server/jevBridge.ts:52` · commits `a302d02`, `2d30877`, `4f245b3` (sell-capture add/remove).
Scripts + raw output: `/home/team/shared/jev-buy-add-20261001/` (`probe_live.js`, `probe2.js`, `probe3.js`, `*.out`).
