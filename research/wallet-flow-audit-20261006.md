# CW2 WALLET-FLOW RESEARCH — READ-ONLY AUDIT vs PR #444 (pre-registration)
Performed 2026-10-06 ~18:20–18:50Z by engineer (delegated). **Read-only end to end**: no code change, no PR,
no deploy, no restart, no migration, no toggle/secret change. Prod DB opened `{readonly:true}` only.
Prod machine at read time: bot `863220ce799118`, watcher `8ee959f7732568`, app `volspike`.

```
* CURRENT ROWS:            3,933  (cw2_wallet_flow_exp, bot /data/volspike.db; MIN observed_at 2026-10-01T14:44:56.509Z → MAX 2026-10-06T17:24:44.614Z)
* ELIGIBLE EVENTS:         182    (mint-deduped, first-emit-per-mint, T0 ≥ 2026-10-01T14:50:42Z, ≥1 in-window ledger row, window closed)
* UNIQUE MINTS:            183    (182 eligible + 1 pre-floor mint; 100% link to conviction_v2 picks)
* T+300 READY:             n/a — 0. Horizon is NOT pre-registered: §8.6 declares T+300/T+600 min DO NOT EXIST in this repo. Schema scan for any t300/t600 column returned []
* T+600 READY:             n/a — 0. Same. The only pre-registered horizon is T+60 min (cw_ks_experiment.t60_mult)
* 200-EVENT FLOOR:         NO   — 182/200, shortfall 18 (=~0.5–0.7 day of accrual)
* DATA QUALITY:            GREEN (ledger integrity: 0 dupes, 0 nulls, 100% gmgn_payload, 100% pick linkage, 0 backfill) — the READ blockers are sample/outcome floors, not defects
* ANALYSIS READY:          NO
* PRODUCTION LOGIC UNCHANGED: NO (git evidence below: execution/buy paths DID change after the ledger-enable commit; none of them read or touch this ledger)
```

## 0. PR #444 — the pre-registered methodology (source of truth)
- **URL:** https://github.com/ORiONx888/VolSpike/pull/444 — `docs(research): pre-register the cw2_wallet_flow_exp methodology (owner 10-01)`
- **MERGED** 2026-10-01T15:26:15Z · **merge commit** `c6406a72837315079c608baec162f1da2cae413c` · base `main` · head `docs/wallet-flow-preregistered`
- **Artifact:** `docs/research/wallet-flow-preregistered-20261001.md` (626 lines, freeze point = the merge commit).
- **Ledger it governs:** table `cw2_wallet_flow_exp`, code `src/watchlist/cw2WalletFlowLedger.ts` (shipped by **PR #443**, commit `d2a781e`, 2026-10-01 14:22:37Z — the ledger-enable commit used throughout this audit). Repo: `ORiONx888/VolSpike` (NOT JevSentinel; the ledger is not in JevSentinel — that repo is at `5b309d4`, 2026-09-27, unchanged).
- **Toggle:** `CW2_WALLET_FLOW_ENABLED`, default OFF, read at call time.

### Eligibility / event definition — verbatim (§3.1–§3.3)
> **T0 = `conviction_picks.posted_at` for the `source = 'conviction_v2'` row associated with the event.**
> **Primary event sample T0** | **the FIRST CW2 emit for that mint** — minimum `posted_at` among that mint's `conviction_picks` rows with `source='conviction_v2'` that fall inside the accrual period and that have ≥1 associated wallet row
> Later emits of the same mint | **logged, reported descriptively, and EXCLUDED from the primary event sample.**
> **Eligibility floor (frozen):** an event is eligible only if **T0 ≥ 2026-10-01T14:50:42Z** (arm time + the 360 s pre-T0 ring-buffer TTL).
> **Row provenance (§4):** a row counts toward any window statistic **only if `trade_timestamp_source = 'gmgn_payload'`.**
> **§15.13:** a read must not include events whose window has not fully closed (T0 + 300 s + one poll interval).

### Outcome horizon — verbatim (§8.1, §8.6)
> **Primary outcome source:** `cw_ks_experiment.t60_mult` … **price at exactly T+60 min ÷ `call_performance.initial_price`**, with `t60_2x = 1 iff t60_mult ≥ 2`.
> **T+300 min and T+600 min do not exist anywhere in this repo** (verified by prior investigation: zero hits). This specification therefore makes **no claim at any horizon other than T+60 min**.

### Floors — verbatim (§10) — `FROZEN`
| # | Floor | Value |
|---|---|---|
| 1 | Eligible mint-deduped CW2 events with ≥1 in-window wallet row | ≥ 200 |
| 2 | EXPANSION events | ≥ 25 |
| 3 | NON-EXPANSION events | ≥ 25 |
| 4 | Wallet-flow field coverage | ≥ 90 % FAIL CLOSED |
| 5 | Timestamp coverage (`gmgn_payload` inside windows) | ≥ 95 % FAIL CLOSED |
| 6 | Missing + MIXED-UNCERTAIN | ≤ 10 % FAIL CLOSED |
| 7 | Audit coverage (outcome rows with `audited_at IS NOT NULL`) | ≥ 90 % FAIL CLOSED |
| 8 | Events with ≥1 pre-T0 (W1) row | ≥ 40 |
| 9 | Two temporal halves by T0, each | ≥ 80 events AND ≥ 15 expansions |
Also §10: *"at the ~45–49 % base rate the project measures at T+60, n = 200 gives a minimum detectable effect of ≈20 pp"*, accrual ≈26–31 eligible events/day ⇒ ≈7–8 days.
§12/§13: below any floor ⇒ **INSUFFICIENT — no conclusion**; corrections only via a **signed dated addendum**, never an edit.

## 1. Ledger volume
Query: `SELECT COUNT(*), MIN(observed_at), MAX(observed_at), MIN/MAX(trade_timestamp) FROM cw2_wallet_flow_exp` on `/data/volspike.db` (**readonly**), bot machine.
| metric | value |
|---|---|
| rows | **3,933** |
| distinct mint | 183 · distinct wallet_address 429 · distinct cw2_pick_id 183 |
| first / last `observed_at` | 2026-10-01T14:44:56.509Z / 2026-10-06T17:24:44.614Z (5.11 days) |
| by `source_feed` | `gmgn-smartmoney` 2,988 · `gmgn-kol` 945 |
| by `trade_side` | buy 2,046 · sell 1,887 |
| by `trade_timestamp_source` | `gmgn_payload` 3,933 (**100 %**) · `observation_fallback` **0** |
| by `cw2_source` | `conviction_v2` 3,933 (100 %) |
| rows in last 24 h (2026-10-05T18:26Z→) | ≈ 337 (light day); accrual average ≈ 770/day (pre-reg assumed ≈1,000/day) |
| avg rows per covered pick | 21.6 (pre-reg assumed ≈34) |

## 2. Eligible events — rules applied verbatim
Filter list (SQL-equivalent):
1. `conviction_picks.source = 'conviction_v2'` and `posted_at >= '2026-10-01 14:50:42'` (floor, arm 14:44:42Z + 360 s);
2. event unit = **mint**; T0 = `MIN(posted_at)` per mint (first emit wins); later emits excluded;
3. the event's pick must have **≥1** `cw2_wallet_flow_exp` row with `cw2_pick_id = that pick id`;
4. window closed: `T0 + 360 s < now` (§15.13);
5. row provenance for all window variables: `trade_timestamp_source = 'gmgn_payload'` (100 % of rows).
Result: **182 eligible events** (T0 range 2026-10-01 15:00:31 → 2026-10-06 17:20:13).
CW2 mints in the window = 232 ⇒ **78.4 % of post-floor CW2 mints have ≥1 ledger row** (pre-reg assumed 87.5 %);
the other **50** mints have no in-window row (all 50 do have a `cw_ks_experiment` outcome row ⇒ the gap is ledger coverage, not outcome availability). Window-open exclusions at read time: **0**.

## 3. Unique CW2 mints represented
`SELECT COUNT(DISTINCT mint) FROM cw2_wallet_flow_exp` = **183**; join `cw2_wallet_flow_exp.cw2_pick_id = conviction_picks.id` ⇒ 3,933/3,933 resolve, 0 orphan, 0 mint mismatch, all `source='conviction_v2'`.
**v1/v2 duplicate-row trap:** the ledger stores only `conviction_v2` events, and `conviction_picks` also holds 2,959 `conviction` (v1) rows — no v1 row is referenced by the ledger, so v1+v2 double-counting cannot occur. Also: 10 mints have >1 `conviction_v2` row overall, **all dated 2026-09-13…09-15** ⇒ the "repeat-emit" secondary arm is **empty** in the accrual window (no repeat emit since the floor).

## 4. Outcome readiness — scorer table/columns used
- `cw_ks_experiment` (`mint` UNIQUE — 2,089 rows, all `engine='conviction_v2'`): `t60_mult`, `t60_2x`, `outcome_done`, `audited_at`, `called_at`.
- `call_performance` (`initial_price`, `audited_at`), joined `tracked_tokens.mint_address → tracked_tokens.id = call_performance.token_id`.
- **T+300 / T+600: no such column in ANY table.** Programmatic scan of every table's `PRAGMA table_info` for `t300|t600` ⇒ `[]`. Pre-reg §8.6 says the same. **Only T+60 min exists.**
| horizon | pre-registered? | ready |
|---|---|---|
| **T+60 min** (primary label) | YES (`cw_ks_experiment.t60_mult`) | **180 / 182** (`outcome_done=1`, `t60_mult` non-null); 2 missing (1.1 %) |
| T+300 / T+600 | **NO** | 0 (does not exist) |
Qualifying picks = the 182 eligible events above; T+60 missing = **2** mints whose `cw_ks_experiment` row carries `t60_mult IS NULL` / `outcome_done ≠ 1` (0 mints lack a KS row entirely).

## 5. 200-event floor
**NOT reached: 182 / 200 ⇒ shortfall 18.** At the measured rate (182 events in 5.11 days ≈ 35.6/day, vs the pre-reg's 26–31/day) ≈ 0.5 day of further accrual would clear it.

## 6–7. Is the data clean enough to run now? NO — floor-by-floor
| # | Floor | Required | Actual | Verdict |
|---|---|---|---|---|
| 1 | eligible events | ≥ 200 | **182** | FAIL (short 18) |
| 2 | EXPANSION | ≥ 25 | **20** (11.0 % of 182) | FAIL (short 5) |
| 3 | NON-EXPANSION | ≥ 25 | **160** | PASS |
| 4 | wallet-flow field coverage | ≥ 90 % | **100 %** (no NULL side/usd/wallet; every row has class + side + USD) | PASS |
| 5 | timestamp coverage | ≥ 95 % | **100 %** (`gmgn_payload` 3,933/3,933) | PASS |
| 6 | missing + MIXED-UNCERTAIN | ≤ 10 % | **1.1 %** (2 missing, 0 in the [1.90,2.10) band) | PASS |
| 7 | audit coverage | ≥ 90 % | **158/182 = 86.8 %** (`call_performance.audited_at`) | **FAIL CLOSED** (short 6) |
| 8 | events with ≥1 pre-T0 (W1) row | ≥ 40 | **151** | PASS |
| 9 | each temporal half | ≥ 80 events **and ≥ 15 expansions** | halves 90/90 events but **8 / 12 expansions** | FAIL (expansions short 7 / 3) |
Reference: `cw_ks_experiment.audited_at` is NOT NULL on only **31/2,089** rows; the §8.1 audit stamp is the `call_performance.audited_at` join (158/182), which is what is quoted above. `cw_ks_experiment.audited_at` on the 182 = **1**.

## 8. PRODUCTION BUY/ADD LOGIC UNCHANGED — **NO** (with commit evidence)
Baseline = ledger-enable commit `d2a781e` (2026-10-01 14:22:37Z, PR #443). Window: `d2a781e..origin/main` (`origin/main` = `7ced4fd`, 2026-10-03; the local clone's origin refs were refreshed with the fresh credential URL).
Files changed in buy/execution/position paths: `src/watchlist/greenPeakGate.ts` (M), `src/execution/greenPeakExec.ts` (M), `src/execution/remoteDb.ts` (M +100), `src/execution/jevEarlyEntryBuyer.test.ts` (M), plus a **new** auto-trader: `src/albert/{control,exitExperiment,paper-run,paperLedger,paperNotifications}.ts`, `src/execution/{albertCommand,albertDecision,albertFilters,albertJev,albertMarket,albertSocial}.ts`, `fly.albert-paper.toml`, `.github/workflows/deploy-albert-paper.yml`.
| commit | date | what | BUY/ADD impact |
|---|---|---|---|
| `e4d9dd2` (**PR #446**) | 10-02 | remove Halifax peak-TIME window from the SOL-GREEN auto-buy gate (owner) | **YES — BUY admission**: `gate_pass` was *SOL-GREEN ∧ peak-hours*; now SOL-GREEN alone (all 24 h). Entry hours materially widened. |
| `6c20165` (**PR #449**) | 10-02 | pin launcher exit flags to the paper-run set | Exits config — but it removes the `EXITS_CHANGED` refusals that were blocking **every entry** (autoexec unblock). Entry-enabling, not a new BUY rule. |
| `45b6706` + `5af18ae` + `d3a55dc`…`21179d1` (Albert chain, PRs #454–#469) | 10-02/03 | build + isolate the **Albert HOT auto-trader** (separate app/executor) | **YES — new BUY/position code**, on a separate path; per the plan, live Albert execution is OFF (`ALBERT_EXECUTION_ENABLED` gate). |
| `bb70899` / `5cf6ba6` | 10-02 | remove Albert paper position cap | **YES — position sizing** (Albert paper path). |
| `3c230f2` (**PR #455**) | 10-02 | Albert evidence-driven exit experiment | Exits (Albert path). |
| `52963d6` (**PR #452**) | 10-03 | watcher: resolve token launch time from a `createTime`-bearing `token_events` row | **YES — entry admission**: fixes the ~43 % token-age fail-closed gap, i.e. changes which picks are eligible to be bought. |
| `e6364c7` (#447), `02e63cd` (#445), CI/docs commits | 10-02/03 | audit disk retention, Telegram-polling reconcile, docs | No BUY/ADD impact. |
Assessment: **execution and buy-path logic did change in the window** — but none of it is the wallet-flow research feeding production. A repo-wide grep shows `cw2_wallet_flow_exp` is referenced **only** by the ledger module, its 2 hook files (`gmgnKolFeed.ts` capture/buffer, `conviction2.ts` flush), `db/index.ts` (table bootstrap) and its own test — **no execution, buy, alert or card path reads it**. The pre-reg §6 "no enrichment path exists" claim still holds.
**JevSentinel:** HEAD `5b309d4` (2026-09-27), **no commits since 2026-10-01** — nothing to audit there; no buy/add change.

## 9. Toggle enabled + ledger flowing — **YES**
- Live bot process (`/proc/644/cmdline` contains `src/index.ts`; `/proc/644/environ`, 77 keys): **`CW2_WALLET_FLOW_ENABLED=1`**, `TELEGRAM_POLL_ENABLED=1`. (`AUTOEXEC_ENABLED`, `RUNNER_AUTOEXEC`, `GREEN_PEAK_MIN_TRADE_SOL`, `CONVICTION_GREEN_PEAK_MIN_TRADE_SOL`, `ALBERT_EXECUTION_ENABLED` = absent on the bot — they belong to the watcher / the separate Albert app.)
- Owner commits `4d10abd` + `5a069b8` (10-03) also added `flyctl secrets set CW2_WALLET_FLOW_ENABLED="1"` to `.github/workflows/deploy.yml` / `deploy-fly.yml` ⇒ the toggle now survives redeploys by construction.
- Receiving: `MAX(observed_at) = 2026-10-06T17:24:44Z`, i.e. written **after** the newest CW2 emit (`conviction_picks` last `conviction_v2` `posted_at` = 2026-10-06 17:20:13Z); the newest 6 rows all carry that pick. Last write ≈ 1 h before the read because no CW2 emit fired in between — the ledger only persists mints with a CW2 emit within ±5 min.
- No watermark/sequence column; append-only. `id` is AUTOINCREMENT: `MAX(id) 4,294` vs `COUNT(*) 3,933` ⇒ **361 ignored writes** = `INSERT OR IGNORE` dedupe absorbing feed/poll overlap (expected, benign).

## 10. Data-quality scan (counts)
| check | result |
|---|---|
| (a) duplicate `event_key` | **0** (UNIQUE index `sqlite_autoindex_cw2_wallet_flow_exp_1` present) |
| (a) exact full-row duplicates | **0** |
| (b) NULL/empty `cw2_timestamp` / `observed_at` / `mint` / `wallet_address` / `trade_timestamp` / `cw2_pick_id` | **0 / 0 / 0 / 0 / 0 / 0** |
| (b) NULL `trade_value_usd` | **0** (so `usd_*`/HHI variables are computable on 100 % of rows) |
| (c) rows with no resolvable CW2 mint linkage | **0 orphan, 0 mint mismatch** (3,933 joined) |
| (d) rows written before the arm (backfill contamination) | **0** (`observed_at < 2026-10-01T14:44:42Z`); 3 rows precede the 14:50:42Z *floor* — 1 mint (`HuM8Qo…pump`, pick 4916) — correctly excluded, not backfill |
| (e) coverage asymmetry | **50** post-floor CW2 mints have a `cw_ks_experiment` outcome but **no** ledger row (all 50 have `outcome_done`); reverse: 2 eligible events have no resolved T60 — 2/182 = 1.1 % ≤ 10 % |
| (f) clock/format integrity | `cw2_timestamp` mirrors `conviction_picks.posted_at` to the second on 3,933/3,933 (ISO-ms vs space format; UTC parse identical); `trade_timestamp` is unix seconds (`MAX 1791307475` = 2026-10-06T17:24:35Z, consistent with `observed_at`); **no** timezone drift; no replay/duplicate windows |
| (f) field coverage that is *deliberately* partial | `wallet_class_at_event` present on 3,933/3,933 (100 %); roster copy (`stats_asof`) present on **910/3,933 (23.1 %)** — the ≥76.9 % "unknown at the time" category the pre-reg defines, not a defect |
| (f) feed mix stability | per-day `gmgn-kol` share ≈ 24–39 %, stable across the window |

## If not analysis-ready: the exact remaining shortfall
1. **Event count:** 182/200 → **short 18** (≈0.5 day at 35.6 events/day). Self-resolving.
2. **Audit coverage (fail-closed):** 158/182 = 86.8 % → **short 6 audited outcomes** to reach 90 % (164). Blocks the read on its own.
3. **EXPANSION cell:** 20/25 → **short 5** — see the base-rate note below; this is the structural blocker.
4. **Two temporal halves:** 8 and 12 expansions vs the ≥15 floor → **short 7 / 3** — at the measured 11.0 % base rate each half needs ≈136 events ⇒ ≈272 eligible events total (vs 182 today).
5. **Base-rate mismatch (the deepest blocker, read-only finding).** The pre-reg's floors and its MDE are keyed to an assumed **~45–49 % base rate** at T+60. The pre-registered scorer itself carries **7.7 %** overall (`cw_ks_experiment`: 156/2,018 `outcome_done` rows ≥2×) and **9.6 %** for 2026-10-01→10-06 (24/250); the eligible cohort measures **11.0 %** (20/182). So at the observed base rate floor 2 (≥25 expansions) needs ≈227 eligible events — it **cannot pass at the frozen n = 200 trigger** — and floor 9's "≥15 expansions in each half" needs ≈272. Floors 2 and 9 are therefore not merely "not yet reached": they are unreachable at the pre-registration's own n = 200 / 7–8-day design, and §10's MDE (~20 pp at n = 200) is understated for an 11 % base rate. Per the pre-reg's own §13 the only lawful fix is a **signed dated addendum** (owner decision) — nothing was changed here.
   *Cross-check that this is a lens difference, not a broken scorer:* `src/watchlist/ksOutcomes.ts` / `gmgnFeedOutcomes.ts` define `t60_mult = price@+60 / call_performance.initial_price` and say **"never a max/peak"**; pre-reg §8.4 defines the *peak* over (T0, T0+60 min] as a **secondary** variable. The house KPI's "T+60 ≥2× ≈48.9 % (v2)" therefore cannot be the same measurement as the primary label — the pre-reg's §8.1 sentence "this is the same convention the house uses for the audited T+60 lens" is not supported by the data. **Flagging for lead/owner; no change made.**
6. **Throughput vs plan:** ledger ≈770 rows/day (vs ≈1,000) and 21.6 rows/covered pick (vs ≈34) — accrual is slower than the pre-reg assumed, which stretches the calendar but not the outcome.

## Reproduce (read-only)
Probe scripts (all `new Database("/data/volspike.db", { readonly: true })`, run in-VM via
`python3 /home/team/shared/x_sched/run_js_gz.py <file> 150` — machine resolved at call time):
`/home/team/shared/wallet-flow-audit-20261006/p1.js` (schema/volume) · `p3.js` (eligibility) ·
`p5.js` (dupes/nulls/orphans/backfill) · `p8.js` (outcomes/halves/window events) ·
`p9.js` (base rates, feed mix, coverage asymmetry). Git/PR evidence files: `/tmp/git_evidence.txt`,
`/tmp/git_diff_gate.txt`, `/tmp/t60.txt`.

**Bottom line:** the ledger is healthy and log-only, the toggle is live and the rows are flowing, no production
buy/add path reads it — but the read is **NOT analysis-ready**: floor 1 is short 18 events, floor 7 fails closed
at 86.8 % audit coverage, and floors 2 + 9 are structurally unreachable at the pre-registered scorer's real
(~8–11 %) base rate. All further action is an owner decision (dated addendum per §13); nothing was tuned, modified or deployed.
