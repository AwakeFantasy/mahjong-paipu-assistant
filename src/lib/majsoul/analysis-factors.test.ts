import { describe, expect, it } from "vitest";

import { canFactorDriveConclusion, normalizeDecisionFactor } from "./analysis-factors";
import type { CandidateComparison } from "./types";

type DecisionFactor = CandidateComparison["decidingFactors"][number];

describe("analysis factor policy", () => {
  it("lets future dora potential decide only when no stronger factor dominates", () => {
    const futureDora: DecisionFactor = { type: "future-dora-potential", strength: "weak", summary: "future dora" };
    const efficiency: DecisionFactor = { type: "efficiency", strength: "strong", summary: "efficiency gap" };

    expect(canFactorDriveConclusion({ candidate: futureDora, factors: [futureDora, efficiency], sameEfficiency: false })).toBe(false);
    expect(canFactorDriveConclusion({ candidate: futureDora, factors: [futureDora, efficiency], sameEfficiency: true })).toBe(true);
  });

  it("keeps current dora as a strong factor", () => {
    const currentDora = normalizeDecisionFactor({ type: "current-dora", summary: "current dora" });

    expect(currentDora).toMatchObject({ type: "current-dora", strength: "strong" });
    expect(canFactorDriveConclusion({ candidate: currentDora, factors: [currentDora], sameEfficiency: false })).toBe(true);
  });
});
