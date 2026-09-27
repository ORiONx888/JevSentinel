# JEV Offline Collapse-Pattern Mining

**Status:** research-only candidate mining.

This dataset has forward-return labels, not confirmed rug labels. The target below is therefore called **collapse-like**, not rug. No forward outcome is used as a live JEV feature.

- Tokens scanned: **44,460**
- Collapse-like cases: **9,833**
- Non-collapse cases: **34,627**
- Target: first post-detection 15m candle with low <= **20%** of detection price within **24h**

## Candidate signatures

| Pattern | Target matches | Control matches | Target rate | Control rate | Precision vs non-collapse |
|---|---:|---:|---:|---:|---:|
| sell_buy_300_ge_2 + repeated_seller_share_25 + bundler_holders_ge_10 | 306 | 0 | 3.1% | 0.0% | 100.0% |
| sell_buy_60_ge_2 + repeated_seller_share_25 + bundler_holders_ge_10 | 155 | 0 | 1.6% | 0.0% | 100.0% |
| repeated_seller_share_25 + sniper_holders_ge_10 | 128 | 0 | 1.3% | 0.0% | 100.0% |
| repeated_seller_share_25 + insider_ratio_ge_10 + sniper_holders_ge_10 | 128 | 0 | 1.3% | 0.0% | 100.0% |
| repeated_seller_share_25 + sniper_holders_ge_10 + lp_burned_lt_50 | 128 | 0 | 1.3% | 0.0% | 100.0% |
| repeated_seller_share_25 + bundler_holders_ge_10 + sniper_holders_ge_10 | 126 | 0 | 1.3% | 0.0% | 100.0% |
| repeated_seller_share_25 + sniper_holders_ge_10 + crew_cohesion_high | 60 | 0 | 0.6% | 0.0% | 100.0% |
| repeated_seller_share_25 + smart_earliness_high | 41 | 0 | 0.4% | 0.0% | 100.0% |
| repeated_seller_share_25 + insider_ratio_ge_10 + smart_earliness_high | 41 | 0 | 0.4% | 0.0% | 100.0% |
| repeated_seller_share_25 + smart_earliness_high + lp_burned_lt_50 | 41 | 0 | 0.4% | 0.0% | 100.0% |
| repeated_seller_share_25 + bundler_holders_ge_10 + smart_earliness_high | 35 | 0 | 0.4% | 0.0% | 100.0% |
| sell_buy_300_ge_2 + repeated_seller_share_25 + sniper_holders_ge_10 | 27 | 0 | 0.3% | 0.0% | 100.0% |
| repeated_seller_share_25 + bundler_holders_ge_10 | 2102 | 3 | 21.4% | 0.0% | 99.9% |
| repeated_seller_share_25 + insider_ratio_ge_10 + bundler_holders_ge_10 | 2102 | 3 | 21.4% | 0.0% | 99.9% |
| repeated_seller_share_25 + bundler_holders_ge_10 + lp_burned_lt_50 | 2102 | 3 | 21.4% | 0.0% | 99.9% |
| repeated_seller_share_25 + bundler_holders_ge_10 + crew_cohesion_high | 638 | 1 | 6.5% | 0.0% | 99.8% |
| repeated_seller_share_25 + lp_burned_lt_50 | 2581 | 16 | 26.2% | 0.0% | 99.4% |
| repeated_seller_share_25 + insider_ratio_ge_10 | 2580 | 16 | 26.2% | 0.0% | 99.4% |
| repeated_seller_share_25 + insider_ratio_ge_10 + lp_burned_lt_50 | 2580 | 16 | 26.2% | 0.0% | 99.4% |
| repeated_seller_share_25 + crew_cohesion_high | 846 | 7 | 8.6% | 0.0% | 99.2% |

## Next validation gate

Cross-check these signatures against confirmed-rug corpora and matched non-rug controls. Do not promote these candidates into live JEV BUY/SELL gates until held-out validation and calibration exist.
