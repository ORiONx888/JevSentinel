# JEV Rug Pattern Mining

## Objective

Build a historical evidence layer that discovers the short-horizon event sequences immediately preceding Solana rug outcomes, then distill those sequences into a compact pattern library that JEV can match in real time.

JEV remains the FAST ENGINE. Historical mining is offline/shadow work and must not add blocking work to the live alert loop.

## Data sources

1. SolRPDS — 116,308 pool records derived from 3.69B Solana transactions. Useful for broad candidate discovery and liquidity/inactivity evidence, but its inactivity-based labels must not be treated as ground truth.
2. SolRugDetector 2026 benchmark/dataset — manually verified 117 confirmed rugs plus a large 2025 in-the-wild labeled corpus. Use this as the higher-confidence behavioral benchmark where accessible.
3. 2026 early-prediction research — 6.4M-token study demonstrating that first-five-minute trading features can contain short-horizon rug signal. Use as methodology guidance, not as a source of labels for JEV.

## Forensic windows

For every validated rug, reconstruct feature snapshots relative to the terminal event:

- T-300s
- T-180s
- T-120s
- T-60s
- T-30s
- T-10s
- T=0

Also retain 5m/1m rolling aggregates where available.

## Features to mine

### Flow
- buy count/value
- sell count/value
- buy-share / sell-share
- sell acceleration
- unique buyers/sellers
- buy-size vs sell-size asymmetry
- transaction velocity

### Wallet behaviour
- top-holder concentration
- deployer/creator activity
- wallet redistribution
- repeated/coordinated seller groups
- concentration changes through time

### Liquidity
- liquidity level
- liquidity delta and velocity
- add/remove events
- removal-to-add ratio
- LP extraction timing

### Market response
- price velocity
- volume velocity
- drawdown
- volume/price divergence
- slippage/liquidity stress where available

### Security / structure
- mint authority
- freeze authority
- token/program risk flags

## The key question

Do not search only for absolute thresholds.

Find transitions:

normal -> distribution
distribution -> coordinated selling
coordinated selling -> liquidity stress
liquidity stress -> extraction

The target is the earliest repeatable transition that separates rugs from legitimate volatility.

## Negative controls

Every discovered pattern must be tested against non-rug sequences, including:

- large dip followed by recovery
- normal profit-taking
- high-volume continuation
- liquidity fluctuation without rug
- coordinated-looking selling that does not end in a rug

A pattern is not promoted merely because it appears frequently in rugs.

## Pattern record

Candidate patterns should eventually normalize to:

    {
      "patternId": "RTI-001",
      "name": "short descriptive name",
      "leadWindowSec": 60,
      "features": [],
      "sequence": [],
      "rugRate": null,
      "controlRate": null,
      "precision": null,
      "recall": null,
      "medianLeadSec": null,
      "sampleSize": 0,
      "confidence": "unvalidated"
    }

Do not assign a predictive probability until it is calibrated on held-out data.

## JEV integration boundary

The eventual live path must remain:

live evidence -> fast feature extraction -> pattern lookup -> JEV trajectory -> action

The historical miner must never run synchronously inside the Telegram alert loop.

Initial integration is shadow-only:

- no BUY/HOLD/CAUTION/SELL changes
- no execution changes
- no auto-buy changes
- log pattern matches and later outcomes
- measure warning lead time and false-positive rate

## First deliverable

Produce a forensic table showing, for validated rugs and matched controls, what changed in the final 5 minutes before the terminal event.

The first success criterion is not model accuracy. It is identifying repeatable temporal signatures that occur before the obvious chart collapse.