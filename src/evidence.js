const GROUPS = [
  "tokenIntegrity",
  "holderStructure",
  "creatorIntelligence",
  "walletBehaviour",
  "flowDynamics",
  "marketDynamics",
  "liquidityStructure",
  "temporalIntelligence",
  "historicalIntelligence"
];

export function buildEvidenceState(intelligence = {}, temporal = {}, history = []) {
  const research = intelligence["token-research"]?.fields ?? {};
  const native = intelligence["native-risk"]?.fields ?? {};
  const flow = intelligence["transfer-flow"]?.fields ?? {};
  const available = Object.values(intelligence).filter((item) => item?.available).length;
  const failed = Object.values(intelligence).filter((item) => item && item.available === false).length;

  const evidence = {
    tokenIntegrity: research.tokenIntegrity ?? {
      authority: research.authority ?? native.authority ?? null,
      tokenProgram: research.tokenProgram ?? null,
      token2022: research.token2022 ?? null,
      sellability: research.sellability ?? null,
      riskFlags: research.riskFlags ?? []
    },
    holderStructure: research.holderStructure ?? {
      ...(research.holders ?? native.holders ?? {}),
      topHolderConcentrationPct: research.holders?.topHolderConcentrationPct ?? null,
      top10ConcentrationPct: research.holders?.top10ConcentrationPct ?? null,
      ownerResolutionCoveragePct: research.holders?.ownerResolutionCoveragePct ?? null
    },
    creatorIntelligence: research.creatorIntelligence ?? null,
    walletBehaviour: research.walletBehaviour ?? native.wallet ?? research.wallet ?? null,
    flowDynamics: research.flowDynamics ?? {
      ...(flow ?? {}),
      ...(research.flowDynamics ?? {})
    },
    marketDynamics: research.marketDynamics ?? {
      ...(research.behavior ?? {}),
      priceUsd: research.priceUsd ?? null,
      priceChange5mPct: research.priceChange5mPct ?? null,
      priceChange1hPct: research.priceChange1hPct ?? null,
      volume5mUsd: research.volume5mUsd ?? null,
      volume1hUsd: research.volume1hUsd ?? null,
      marketCapUsd: research.marketCapUsd ?? null,
      buyCount5m: research.buyCount5m ?? null,
      sellCount5m: research.sellCount5m ?? null,
      buySellRatio5m: research.buySellRatio5m ?? null
    },
    liquidityStructure: research.liquidityStructure ?? {
      ...(research.liquidity ?? {}),
      liquidityUsd: research.liquidityUsd ?? null,
      pairAddress: research.pairAddress ?? null,
      dex: research.dex ?? null
    },
    temporalIntelligence: {
      ...(research.temporalIntelligence ?? {}),
      ...temporal
    },
    historicalIntelligence: research.historicalIntelligence ?? buildHistoricalIntelligence(history, temporal)
  };

  evidence.alternativeExplanation = buildAlternativeExplanationEvidence(evidence, history);

  const missingGroups = GROUPS.filter((group) => !hasEvidence(evidence[group]));
  evidence.evidenceQuality = {
    providerCount: Object.keys(intelligence).length,
    availableProviderCount: available,
    failedProviderCount: failed,
    populatedGroups: GROUPS.length - missingGroups.length,
    totalGroups: GROUPS.length,
    missingGroups,
    status: missingGroups.length <= 2 && failed === 0 ? "strong"
      : missingGroups.length <= 4 ? "usable"
      : missingGroups.length <= 6 ? "limited"
      : "insufficient"
  };

  return evidence;
}

function buildHistoricalIntelligence(history, temporal = {}) {
  const items = Array.isArray(history) ? history : [];
  const assessments = items.map((item) => item?.verdict ?? item?.state?.verdict ?? item?.assessment).filter(Boolean);
  const priorEscalations = assessments.filter((assessment) => assessment?.answers?.escalation?.noul === true).length;
  const priorDominantRisks = assessments.map((assessment) => assessment?.answers?.dominantRisk?.choice).filter(Boolean);
  return { sampleCount: temporal.sampleCount ?? items.length, priorAssessments: assessments.length, priorEscalations, priorDominantRisks };
}

function buildAlternativeExplanationEvidence(evidence, history) {
  const flow = evidence.flowDynamics ?? {};
  const market = evidence.marketDynamics ?? {};
  const liquidity = evidence.liquidityStructure ?? {};
  const wallet = evidence.walletBehaviour ?? {};
  const temporal = evidence.temporalIntelligence ?? {};

  return {
    purpose: "Separate a possible single-actor retrace or dump from coordinated extraction.",
    uniqueSellerCount: firstValue(flow.uniqueSellers, flow.uniqueSellerCount, market.uniqueSellers),
    uniqueBuyerCount: firstValue(flow.uniqueBuyers, flow.uniqueBuyerCount, market.uniqueBuyers),
    dominantSellerShare: firstValue(flow.dominantSellerShare, flow.topSellerShare),
    sellerAcceleration: firstValue(flow.sellerAcceleration, temporal.sellerAcceleration),
    coordinatedSellerEvidence: firstValue(flow.coordinatedSellers, flow.coordinatedSellerEvidence, wallet.coordinatedSellers),
    holderGrowthOrRedistribution: firstValue(evidence.holderStructure.holderGrowth, evidence.holderStructure.holderDelta, evidence.holderStructure.redistribution),
    liquidityStabilityOrRemoval: firstValue(liquidity.liquidityChangePct, liquidity.liquidityRemoved, liquidity.stability),
    priceRecoveryEvidence: firstValue(market.recoveryAttempt, market.priceRecovery, temporal.recoveryAttempt),
    popularityContext: {
      volume5mUsd: market.volume5mUsd ?? null,
      volume1hUsd: market.volume1hUsd ?? null,
      uniqueBuyers: firstValue(flow.uniqueBuyers, flow.uniqueBuyerCount, market.uniqueBuyers),
      holderGrowth: firstValue(evidence.holderStructure.holderGrowth, evidence.holderStructure.holderDelta)
    },
    severeEvidencePresent: hasSevereExtractionEvidence(evidence),
    priorSnapshotCount: Array.isArray(history) ? history.length : 0,
    interpretationRule: "Popularity and activity are context, not safety proof; confirmed severe evidence must not be overridden by a retrace explanation."
  };
}

function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined) ?? null;
}

function hasSevereExtractionEvidence(evidence) {
  const flags = evidence.tokenIntegrity?.riskFlags;
  const liquidity = evidence.liquidityStructure ?? {};
  const flow = evidence.flowDynamics ?? {};
  return Boolean(
    Array.isArray(flags) && flags.some((flag) => /liquidity.*(remov|withdraw)|coordinated|rug/i.test(String(flag)))
    || liquidity.liquidityRemoved === true
    || flow.coordinatedSellerEvidence === true
    || flow.coordinatedSellers === true
  );
}

function hasEvidence(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== "object") return true;
  return Object.values(value).some((item) => item !== null && item !== undefined && !(Array.isArray(item) && item.length === 0));
}
