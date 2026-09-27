#!/usr/bin/env python3
"""
Offline mining adapter for ian05012/solana-memecoin-dataset.

Important: this dataset does not contain confirmed rug labels. We therefore
call the target cohort "collapse-like" and never use forward-return labels as
live JEV features. Forward outcomes are used only to define retrospective
research targets. The live features come from data available before the
collapse event.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path

import duckdb

COLLAPSE_RATIO = 0.20
LOOKAHEAD_HOURS = 24
PRE_WINDOWS = [(300, 0), (60, 0), (30, 0), (10, 0)]
MIN_TARGETS = 20
MIN_CONTROLS = 50


def qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def finite(x):
    return x is not None and not (isinstance(x, float) and math.isnan(x))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()

    data = Path(args.data_dir)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    db = duckdb.connect()
    db.execute("PRAGMA threads=2")

    tokens = data / "tokens.parquet"
    ohlcv = data / "ohlcv.parquet"
    trades = data / "trades-*.parquet"

    # One retrospective event per token: first 15m candle within 24h after
    # detection whose low is <= 20% of the detection price. This is a
    # deliberately conservative collapse-like target, not a confirmed rug.
    events_sql = f"""
    WITH t AS (
      SELECT
        token_address, captured_at, price_at_capture, time_since_launch_sec,
        market_cap_usd, liquidity_usd, holder_count, top10_holder_pct,
        dev_remaining_pct, rat_position_pct, sniper_count, new_wallet_count,
        smart_money_count, cluster_count, cluster_max_pct, cluster_top3_pct,
        bundler_pct_holders, fresh_wallet_pct, insider_pct_holders,
        sniper_pct_holders, smart_pct_holders, mint_disabled, freeze_disabled,
        lp_burned_pct, trade_buy_sell_ratio, flipper_ratio, bundler_ratio,
        top_holder_ratio, insider_cluster_size, insider_holding_ratio,
        known_smart_count, known_insider_count, smart_ratio, early_smart_ratio,
        smart_earliness, crew_cohesion
      FROM read_parquet('{tokens.as_posix()}')
      WHERE price_at_capture > 0 AND captured_at IS NOT NULL
    ),
    c AS (
      SELECT
        o.token_address, o.ts, o.low, o.close,
        t.captured_at, t.price_at_capture,
        row_number() OVER (
          PARTITION BY o.token_address
          ORDER BY o.ts
        ) AS rn
      FROM read_parquet('{ohlcv.as_posix()}') o
      JOIN t ON t.token_address = o.token_address
      WHERE o.ts >= t.captured_at
        AND o.ts <= t.captured_at + INTERVAL '{LOOKAHEAD_HOURS} hours'
        AND o.low IS NOT NULL
        AND o.low > 0
        AND o.low <= o.close * 10
        AND o.low <= t.price_at_capture * {COLLAPSE_RATIO}
    ),
    first_event AS (
      SELECT * EXCLUDE (rn) FROM c QUALIFY row_number() OVER (
        PARTITION BY token_address ORDER BY ts
      ) = 1
    )
    SELECT t.*, e.ts AS event_ts
    FROM t
    LEFT JOIN first_event e USING (token_address)
    """

    cases = db.execute(events_sql).fetchdf()
    cases["target"] = cases["event_ts"].notna().astype(int)

    # Only tokens with a reconstructable event and a meaningful capture time
    # can contribute to the target cohort. Controls are the non-event tokens.
    cases.to_parquet(out / "event_cases.parquet", index=False)

    # Build pre-event trade-flow features from all trade shards, but only for
    # tokens in the candidate universe. This avoids loading 9.5M rows into
    # Python memory.
    db.register("cases_df", cases[["token_address", "captured_at", "event_ts", "target"]])

    flow_sql = f"""
    WITH c AS (
      SELECT * FROM cases_df
      WHERE event_ts IS NOT NULL
         OR target = 0
    ),
    tr AS (
      SELECT wallet, token_address, side, amount_usd, ts
      FROM read_parquet('{trades.as_posix()}')
      WHERE amount_usd IS NOT NULL AND amount_usd >= 0 AND ts IS NOT NULL
    ),
    bounded AS (
      SELECT
        c.token_address, c.target, c.event_ts,
        tr.wallet, tr.side, tr.amount_usd, tr.ts,
        CASE WHEN tr.ts >= c.event_ts - INTERVAL '300 seconds'
               AND tr.ts < c.event_ts THEN 1 ELSE 0 END AS w300,
        CASE WHEN tr.ts >= c.event_ts - INTERVAL '60 seconds'
               AND tr.ts < c.event_ts THEN 1 ELSE 0 END AS w60,
        CASE WHEN tr.ts >= c.event_ts - INTERVAL '30 seconds'
               AND tr.ts < c.event_ts THEN 1 ELSE 0 END AS w30,
        CASE WHEN tr.ts >= c.event_ts - INTERVAL '10 seconds'
               AND tr.ts < c.event_ts THEN 1 ELSE 0 END AS w10
      FROM c
      JOIN tr ON tr.token_address = c.token_address
      WHERE c.event_ts IS NOT NULL
        AND tr.ts >= c.event_ts - INTERVAL '300 seconds'
        AND tr.ts < c.event_ts
    ),
    agg AS (
      SELECT
        token_address, target,
        sum(CASE WHEN side='sell' THEN amount_usd ELSE 0 END) AS sell_usd_300,
        sum(CASE WHEN side='buy' THEN amount_usd ELSE 0 END) AS buy_usd_300,
        count(DISTINCT CASE WHEN side='sell' THEN wallet END) AS sellers_300,
        count(DISTINCT CASE WHEN side='buy' THEN wallet END) AS buyers_300,
        count(DISTINCT wallet) AS wallets_300,
        sum(CASE WHEN side='sell' AND w60=1 THEN amount_usd ELSE 0 END) AS sell_usd_60,
        sum(CASE WHEN side='buy' AND w60=1 THEN amount_usd ELSE 0 END) AS buy_usd_60,
        count(DISTINCT CASE WHEN side='sell' AND w60=1 THEN wallet END) AS sellers_60,
        count(DISTINCT CASE WHEN side='buy' AND w60=1 THEN wallet END) AS buyers_60,
        count(DISTINCT CASE WHEN side='sell' AND w30=1 THEN wallet END) AS sellers_30,
        count(DISTINCT CASE WHEN side='sell' AND w10=1 THEN wallet END) AS sellers_10,
        sum(CASE WHEN side='sell' AND w10=1 THEN amount_usd ELSE 0 END) AS sell_usd_10,
        sum(CASE WHEN side='buy' AND w10=1 THEN amount_usd ELSE 0 END) AS buy_usd_10
      FROM bounded
      GROUP BY token_address, target
    ),
    repeated_sellers AS (
      SELECT token_address,
        count(*) AS repeated_seller_wallets
      FROM (
        SELECT token_address, wallet
        FROM bounded
        WHERE side='sell'
        GROUP BY token_address, wallet
        HAVING count(*) >= 2
      )
      GROUP BY token_address
    )
    SELECT a.*, coalesce(r.repeated_seller_wallets, 0) AS repeated_seller_wallets
    FROM agg a
    LEFT JOIN repeated_sellers r USING (token_address)
    """

    flows = db.execute(flow_sql).fetchdf()
    cases = cases.merge(flows, on=["token_address", "target"], how="left")
    numeric = [c for c in flows.columns if c not in ("token_address", "target")]
    for c in numeric:
        cases[c] = cases[c].fillna(0)

    def ratio(a, b):
        return float(a / b) if finite(a) and finite(b) and b > 0 else None

    cases["sell_buy_300"] = [ratio(a,b) for a,b in zip(cases.sell_usd_300, cases.buy_usd_300)]
    cases["sell_buy_60"] = [ratio(a,b) for a,b in zip(cases.sell_usd_60, cases.buy_usd_60)]
    cases["sell_buy_10"] = [ratio(a,b) for a,b in zip(cases.sell_usd_10, cases.buy_usd_10)]
    cases["sell_accel_10_vs_60"] = [
        (x - y) if x is not None and y is not None else None
        for x,y in zip(cases.sell_buy_10, cases.sell_buy_60)
    ]
    cases["seller_growth_60_vs_300"] = cases.sellers_60 - cases.sellers_300
    cases["seller_burst_10_vs_60"] = cases.sellers_10 - cases.sellers_60
    cases["repeated_seller_share"] = cases.repeated_seller_wallets / cases.sellers_300.clip(lower=1)

    # Candidate pre-event features. No forward labels are used here.
    predicates = {
        "sell_buy_300_ge_2": lambda r: r.sell_buy_300 is not None and r.sell_buy_300 >= 2,
        "sell_buy_60_ge_2": lambda r: r.sell_buy_60 is not None and r.sell_buy_60 >= 2,
        "sell_accel_ge_1": lambda r: r.sell_accel_10_vs_60 is not None and r.sell_accel_10_vs_60 >= 1,
        "seller_growth_5": lambda r: r.seller_growth_60_vs_300 >= 5,
        "seller_burst_10_3": lambda r: r.seller_burst_10_vs_60 >= 3,
        "repeated_seller_share_25": lambda r: r.repeated_seller_share >= 0.25,
        "cluster_top3_ge_20": lambda r: r.cluster_top3_pct is not None and r.cluster_top3_pct >= 20,
        "insider_ratio_ge_10": lambda r: r.insider_holding_ratio is not None and r.insider_holding_ratio >= 0.10,
        "bundler_holders_ge_10": lambda r: r.bundler_pct_holders is not None and r.bundler_pct_holders >= 0.10,
        "sniper_holders_ge_10": lambda r: r.sniper_pct_holders is not None and r.sniper_pct_holders >= 0.10,
        "smart_earliness_high": lambda r: r.smart_earliness is not None and r.smart_earliness >= 0.75,
        "crew_cohesion_high": lambda r: r.crew_cohesion is not None and r.crew_cohesion >= 0.75,
        "mint_not_disabled": lambda r: r.mint_disabled == False,
        "freeze_not_disabled": lambda r: r.freeze_disabled == False,
        "lp_burned_lt_50": lambda r: r.lp_burned_pct is not None and r.lp_burned_pct < 50,
        "dev_remaining_ge_5": lambda r: r.dev_remaining_pct is not None and r.dev_remaining_pct >= 5,
        "rat_position_ge_2": lambda r: r.rat_position_pct is not None and r.rat_position_pct >= 2,
    }

    def hit(row, name):
        try:
            return bool(predicates[name](row))
        except Exception:
            return False

    target_df = cases[cases.target == 1]
    control_df = cases[cases.target == 0]

    # Controls are not claimed to be safe; they are simply non-collapse cases
    # under this retrospective target. Pairing is approximated by age/mcap
    # bins in the aggregate report.
    rows = []
    import itertools
    names = list(predicates)
    for k in (2, 3):
        for combo in itertools.combinations(names, k):
            th = sum(all(hit(r, f) for f in combo) for _, r in target_df.iterrows())
            ch = sum(all(hit(r, f) for f in combo) for _, r in control_df.iterrows())
            if th < MIN_TARGETS or len(control_df) < MIN_CONTROLS:
                continue
            precision = th / (th + ch) if th + ch else 0
            recall = th / len(target_df) if len(target_df) else 0
            control_rate = ch / len(control_df) if len(control_df) else 0
            rows.append({
                "patternId": f"COLLAPSE-CAND-{len(rows)+1:03d}",
                "features": list(combo),
                "targetMatches": int(th),
                "controlMatches": int(ch),
                "targetRate": round(recall, 6),
                "controlRate": round(control_rate, 6),
                "precisionAgainstNonCollapse": round(precision, 6),
                "confidence": "research-candidate",
                "targetDefinition": f"first post-detection 15m candle low <= {COLLAPSE_RATIO:.0%} of detection price within {LOOKAHEAD_HOURS}h",
                "note": "Collapse-like retrospective target, not confirmed rug label; validate against confirmed-rug corpora before live use."
            })

    rows.sort(key=lambda x: (x["precisionAgainstNonCollapse"], x["targetRate"], x["targetMatches"]), reverse=True)
    patterns = rows[:50]

    cases.to_parquet(out / "collapse_feature_cases.parquet", index=False)
    with open(out / "collapse-pattern-candidates.json", "w") as f:
        json.dump({
            "method": {
                "dataset": "ian05012/solana-memecoin-dataset",
                "target": "collapse-like",
                "collapse_ratio": COLLAPSE_RATIO,
                "lookahead_hours": LOOKAHEAD_HOURS,
                "live_feature_rule": "only pre-event observations/features may become JEV inputs",
                "forward_label_leakage": "not used as live features"
            },
            "corpus": {
                "tokens": int(len(cases)),
                "collapse_like": int(len(target_df)),
                "non_collapse": int(len(control_df))
            },
            "patterns": patterns
        }, f, indent=2)

    top = patterns[:20]
    with open(out / "collapse-mining-report.md", "w") as f:
        f.write("# JEV Offline Collapse-Pattern Mining\n\n")
        f.write("**Status:** research-only candidate mining.\n\n")
        f.write("This dataset has forward-return labels, not confirmed rug labels. "
                "The target below is therefore called **collapse-like**, not rug. "
                "No forward outcome is used as a live JEV feature.\n\n")
        f.write(f"- Tokens scanned: **{len(cases):,}**\n")
        f.write(f"- Collapse-like cases: **{len(target_df):,}**\n")
        f.write(f"- Non-collapse cases: **{len(control_df):,}**\n")
        f.write(f"- Target: first post-detection 15m candle with low <= **{COLLAPSE_RATIO:.0%}** "
                f"of detection price within **{LOOKAHEAD_HOURS}h**\n\n")
        f.write("## Candidate signatures\n\n")
        if not top:
            f.write("No candidate reached the minimum support thresholds.\n")
        else:
            f.write("| Pattern | Target matches | Control matches | Target rate | Control rate | Precision vs non-collapse |\n")
            f.write("|---|---:|---:|---:|---:|---:|\n")
            for p in top:
                f.write("| " + " + ".join(p["features"]) + f" | {p['targetMatches']} | {p['controlMatches']} | "
                        f"{p['targetRate']:.1%} | {p['controlRate']:.1%} | {p['precisionAgainstNonCollapse']:.1%} |\n")
        f.write("\n## Next validation gate\n\n")
        f.write("Cross-check these signatures against confirmed-rug corpora and matched non-rug controls. "
                "Do not promote these candidates into live JEV BUY/SELL gates until held-out validation and calibration exist.\n")

    print(json.dumps({
        "tokens": len(cases),
        "collapse_like": int(len(target_df)),
        "non_collapse": int(len(control_df)),
        "patterns": len(patterns),
        "top_patterns": top[:5]
    }, indent=2))


if __name__ == "__main__":
    main()
