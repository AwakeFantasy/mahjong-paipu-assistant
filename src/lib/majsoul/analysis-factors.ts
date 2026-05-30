import type { CandidateComparison } from "./types";

export type AnalysisDecisionFactor = CandidateComparison["decidingFactors"][number];

type FactorPolicy = {
  defaultStrength: NonNullable<AnalysisDecisionFactor["strength"]>;
  canDriveConclusion: "always" | "tie-break-only";
};

export const FACTOR_POLICY: Record<AnalysisDecisionFactor["type"], FactorPolicy> = {
  efficiency: { defaultStrength: "strong", canDriveConclusion: "always" },
  "current-dora": { defaultStrength: "strong", canDriveConclusion: "always" },
  safety: { defaultStrength: "strong", canDriveConclusion: "always" },
  engine: { defaultStrength: "medium", canDriveConclusion: "always" },
  "route-factor": { defaultStrength: "medium", canDriveConclusion: "tie-break-only" },
  "future-dora-potential": { defaultStrength: "weak", canDriveConclusion: "tie-break-only" },
};

export function normalizeDecisionFactor(factor: AnalysisDecisionFactor): AnalysisDecisionFactor {
  return {
    ...factor,
    strength: factor.strength ?? FACTOR_POLICY[factor.type].defaultStrength,
  };
}

export function hasDominantFactor(factors: AnalysisDecisionFactor[], candidate: AnalysisDecisionFactor, options: { sameEfficiency: boolean }) {
  const normalizedCandidate = normalizeDecisionFactor(candidate);

  return factors.map(normalizeDecisionFactor).some((factor) => {
    if (factor === normalizedCandidate || factor.type === normalizedCandidate.type) {
      return false;
    }

    return factor.strength === "strong" && !(factor.type === "efficiency" && options.sameEfficiency);
  });
}

export function canFactorDriveConclusion({
  candidate,
  factors,
  sameEfficiency,
}: {
  candidate: AnalysisDecisionFactor;
  factors: AnalysisDecisionFactor[];
  sameEfficiency: boolean;
}) {
  const factor = normalizeDecisionFactor(candidate);
  const policy = FACTOR_POLICY[factor.type];

  if (policy.canDriveConclusion === "always") {
    return true;
  }

  return !hasDominantFactor(factors, factor, { sameEfficiency });
}
