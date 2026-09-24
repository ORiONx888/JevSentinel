# JevSentinel

Real-time token risk intelligence and early-warning protection engine for crypto alert systems.

JevSentinel is a standalone intelligence layer built around JEV. It accepts alert-card context and assembles its own local evidence before asking JEV for a structured assessment.

## Native intelligence

- Token/security conditions: authority, liquidity, holder concentration, sellability and honeypot indicators
- Wallet behaviour: concentration, unique buyers/sellers, coordinated activity and seller acceleration
- Market stress: price, liquidity and volume velocity plus buy/sell pressure
- Transfer-flow analysis: bounded bursts, transfer counts, amounts, unique counterparties and watched-wallet direction
- Temporal analysis: change and deterioration across repeated observations
- Structured JEV questions: escalation, dominant risk mechanism, evidence quality, false-positive context and urgency
- Outcome telemetry for discovering effective gates from real observations

No third-party risk-scanner subscription or risk-provider API key is required. JevSentinel's intelligence is computed from the observation data supplied by the integrating alert system.

The only required service credential for JEV evaluation is the user's own TypeSafe API key, supplied at runtime via `TYPESAFE_API_KEY`.
