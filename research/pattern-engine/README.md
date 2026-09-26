# JEV Historical Pattern Engine

Offline-only forensic engine for turning timestamped token observations into compact rug signatures and a fast lookup library.

Pipeline: raw observations -> normalized features -> temporal signatures -> rug/control comparison -> pattern library -> live shadow matcher.

This engine is dependency-free and must never run in the Telegram alert loop.

A case contains tokenId, outcome (rug/control/unknown), terminalAt, and timestamped observations. Missing fields remain missing evidence; they are never converted to zero.

Initial signatures focus on transitions: sell pressure/acceleration, liquidity deterioration, seller growth, coordinated sellers, holder concentration, bundle/sniper/funding evidence, creator history, authority state, and price deterioration.

The miner searches combinations across the final five minutes. It does not assign a rug probability. Candidates remain unvalidated until held-out testing.

Safety: no live action changes, no execution/auto-buy changes, no future labels/post-rug observations/forward-return fields as live features, and no provider rug score becomes ground truth.
