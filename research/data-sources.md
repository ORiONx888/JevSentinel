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

### Solana memecoin dataset — June 2026
- 44,460 early-stage token snapshots.
- 9.5M wallet-level trades, 272k 15-minute OHLCV rows, 506k sequence rows.
- 11,817 wallet profiles and 15,493 wallet-funding edges.
- Includes holder composition, wallet tags, cluster/funding data, contract safety, trade-flow features and forward-return labels.
- Released under MIT; public addresses/data are intended for research.
- Important: labels are forward-return labels, not confirmed-rug labels. Use it as a control/trajectory corpus and for feature engineering, not as ground truth.
- Source: github.com/ian05012/solana-memecoin-dataset

### Solana 6.4M-token early-prediction study
- 2026 study covering 6.4M Solana tokens across seven months.
- Reports that first-five-minute trading data can contain useful early fraud signal and that multi-source fusion helps cross-platform generalization.
- Use methodology/results as a feature-selection guide; do not import its model as a JEV probability.
- Source: arXiv:2608.20271

## Priority 2 — confirmed-rug benchmark

### SolRugDetector
- 117 manually confirmed rug tokens.
- Large 2025 in-the-wild corpus covering 100,063 newly issued tokens.
- Three documented behavioral families: freeze-authority abuse, liquidity withdrawal and pump-and-dump.
- Useful as the high-confidence benchmark and for terminal-event definitions.
- Source: arXiv:2603.24625

## Priority 3 — broad historical baseline

### SolRPDS
- 116,308 liquidity-pool records / 33,358 mints derived from 3.69B transactions.
- Covers 2021–Nov 2024.
- Fields include liquidity adds/removes, pool activity and swap timestamps.
- CC BY 4.0.
- Critical caveat: inactivity is used as the primary label proxy; related analysis found substantial label noise. Do not treat every inactive pool as a confirmed rug.
- Source: github.com/DeFiLabX/SolRPDS

## Priority 4 — reusable open-source feature systems

### DeFi-Sentinel
- Real-time Solana rug-detection project using SolRPDS plus multiple API enrichments.
- Useful for auditing feature inventories, API wiring and confidence-scored labels.
- Its own audit explicitly warns about SolRPDS label noise.
- Source: github.com/alidor4702/DeFi-Sentinel

### Solana Rug Guard
- Deterministic open-source Solana safety/rug checker.
- Checks authorities, concentration, sniper/deployer behavior, liquidity and market data; supports persistent watch history.
- Useful as a baseline feature extractor and independent comparator, not as JEV's decision engine.
- Source: github.com/codegraphtheory/solana-rug

### Solana Memecoin Helper
- BirdEye holder scanning, liquidity monitoring and Jito bundle tracking.
- Useful for API-field coverage and MEV/bundle features.
- Source: github.com/SAMBAS123/solana-memecoin-helper

### GMGN trending/scanner projects
- Several open-source collectors expose structured token, holder, wallet, rugcheck and smart-money fields.
- Treat unofficial scrapers as exploratory only; prefer authorized/API access for production collection.
- Source example: github.com/logiover/gmgn-trending-memecoin-scanner

### Solana graduation-prediction project
- Open ML project with creator behavior, liquidity evolution, buy/sell ratios, transaction timing, wallet diversity/concentration and price dynamics.
- Useful for feature ideas that describe early lifecycle behavior.
- Source: github.com/sqqshh/Solana-Skill-Sprint-Memcoin-Graduation-Prediction

## Priority 5 — outcome/market-behavior controls

### SmugCalls Solana memecoin calls dataset
- 3,500+ timestamped Solana calls with entry market cap and subsequent peak outcomes, including losers.
- CC0.
- Not a rug dataset, but useful for constructing non-rug outcome controls and studying when apparently strong signals become exit liquidity.
- Source: github.com/Smurfetc/solana-memecoin-calls-dataset

### MemeChain
- 34,988 meme coins across Ethereum, BSC, Base and Solana with financial metadata, digital presence and visual assets.
- Useful for cross-chain comparison and metadata/forensic feature ideas.
- Do not use cross-chain labels as direct Solana rug labels.
- Source: Zenodo 10.5281/zenodo.18246856

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

### Helius / Solana RPC / Jito
Target fields:
- raw transaction history
- creator/deployer actions
- wallet funding edges
- token-account changes
- liquidity add/remove transactions
- bundle/MEV context where available

Do not build the pipeline around scraping GMGN. Treat authorized API access as optional enrichment.

## Data design rule

Keep:
1. raw provider response
2. normalized observation
3. derived feature
4. source timestamp
5. confidence/availability
6. provider/source identifier

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

## Important anti-leakage rules

- Never use future labels, post-rug observations or forward-return fields as live features.
- Split by token/time and, where possible, by wallet/deployer cohort to prevent graph leakage.
- Preserve the exact observation timestamp for every feature.
- Separate confirmed rugs, inferred rugs, controls and unknown outcomes.
- Do not let one provider's derived rug score become JEV ground truth.
- No pattern changes live JEV action until held-out validation demonstrates useful lead time and acceptable false-positive behavior.

No live JEV, Telegram, execution or auto-buy changes are made by this research branch.
