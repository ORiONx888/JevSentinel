# JEV shadow intelligence design

Status: implemented as shadow-only infrastructure.

## Behaviour
For each EARLY ENTRY EXPERIMENT assessment, derive deterministic temporal/flow features, look up compact historical candidate patterns, ask JEV narrow independent questions over the same state, and record the answers. Pattern matches never directly change Telegram delivery, BUY/SELL action, or execution.

## Judgments
1. coordinatedBehavior — independent Noul.
2. extractionProgression — Choice with an explicit unclear outcome.
3. deterioration — ordered Score.
4. retraceAlternative — Choice with an insufficient-evidence outcome.
5. patternResemblance — Noul: does the current sequence resemble the historical candidate patterns?
6. patternContradiction — Noul: is there evidence that materially contradicts the historical-pattern interpretation?
7. evidenceQuality — ordered Score.
8. urgency — ordered Score.

Deterministic code remains responsible for arithmetic, feature extraction, pattern lookup, action, and execution policy.

## Validation status
The first mining corpus is a 44,460-token collapse-like dataset: 9,833 target cases and 34,627 controls. Its labels are forward-return collapse labels, not confirmed rugs. The six retained candidates therefore remain research candidates.

A public confirmed-rug benchmark is documented by SolRugDetector: 117 manually verified rugs and 65 legitimate controls. Its published paper describes the benchmark and taxonomy, but the raw per-token feature table required to evaluate the six JEV pattern signatures is not exposed through the paper text. This repository therefore does not fabricate confirmed-rug match rates.

Additional public evidence used as negative/orthogonal controls:
- SILENT-KILLER v1.3: 27 operational rug events and 91 controls; it demonstrates that dev-wallet silence is not a useful positive rug predictor and is intentionally not promoted into the pattern library.
- RED-COHORT v1.1.1: 1,012 persistent sniper cohorts from 1,578,333 buyer events across 166,098 launches; cohort detection is treated as context, not a rug label.

## Production rule
No candidate pattern, JEV probability, confidence, or cookbook threshold can independently authorize BUY/SELL. Any future production threshold must be measured on a labelled, held-out dataset and version-pinned.
