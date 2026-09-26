# JEV Research Data Sources

Status: active research inventory — no live JEV changes.

## Priority 1 — recent Solana rug evidence

### SILENT-KILLER-2026
- Observation: 2026-06-29 through 2026-07-17
- 52 positive rug events + 91 controls
- Useful for testing wallet/developer activity hypotheses.
- Important null result: developer-wallet silence did not distinguish rugs from controls.
- Source: Zenodo 10.5281/zenodo.21828794

### RED-COHORT-2026
- Observation: June 2026 Pump.fun launches
- 1,012 persistent wallet cohorts from 166,098 token launches and 1,578,333 buyer events.
- Useful for coordinated-wallet and pre-rug cohort research.
- Latest located release: v1.1.1
- Source: Zenodo 10.5281/zenodo.21765387

## Priority 2 — confirmed-rug benchmark

### SolRugDetector
- 117 manually confirmed rug tokens.
- Large 2025 in-the-wild corpus is useful for scale, but confirmed examples remain the higher-confidence benchmark.
- Source: arXiv:2603.24625

## Priority 3 — broad historical baseline

### SolRPDS
- Broad Solana DEX history covering 2021-2024.
- Useful for older/persistent patterns and control construction.
- Labels include suspected/confirmed cases and are not equivalent to manually verified ground truth.
- Source: arXiv:2504.07132

## Live/API enrichment layer

The research pipeline should preserve provider-specific raw observations before normalization.

### DexScreener
Target fields:
- pair/token identity
- pair creation time
- price
- volume
- buys/sells
- liquidity
- FDV/market cap
- pair/DEX metadata

### GeckoTerminal
Target fields:
- pool identity
- OHLCV
- liquidity
- volume
- transactions
- pool timestamps

### Birdeye
Target fields:
- historical token/market data
- trades
- holders
- wallet historical checkpoints where available

### GMGN
Target fields if authorized API access is available:
- wallet/smart-money activity
- holder/trader intelligence
- trading activity

Do not build the pipeline around scraping GMGN. Treat authorized API access as optional enrichment.

## Data design rule

Keep:
1. raw provider response
2. normalized observation
3. derived feature
4. source timestamp
5. confidence/availability

This lets us identify provider disagreement instead of silently merging it.

## Analysis order

recent confirmed rugs
-> reconstruct final 5 minutes
-> match recent controls
-> identify temporal sequences
-> test wallet/cohort relationships
-> compare across providers
-> compare against older cohorts
-> only then build shadow pattern matcher

No pattern is allowed to change live JEV action until it has held out validation.
