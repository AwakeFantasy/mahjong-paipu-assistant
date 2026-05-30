import { describe, expect, it } from "vitest";

import { classifyAnalysisErrorProfile, type AnalysisErrorProfileSource } from "./analysis-error-profile";

type ProfileAnalysisPackage = NonNullable<AnalysisErrorProfileSource["analysisPackage"]>;
type ProfileKnowledgeCase = NonNullable<AnalysisErrorProfileSource["knowledgeCases"]>[number];

function makeBaseSource(overrides: Partial<Parameters<typeof classifyAnalysisErrorProfile>[0]> = {}) {
  const snapshot = {
    source: { id: "sample", region: "cn" },
    round: { id: "east-1", title: "东一局", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "东家", danger: "low" },
    cursor: 12,
    maxCursor: 30,
    targetSeat: 0,
    players: [{ seat: 0, wind: "E", name: "A", score: "25,000", startScore: 25000, style: "目标" }],
    doraIndicators: ["9p"],
    targetHand: ["1m", "2m", "3m"],
    discards: { 0: [], 1: [], 2: [], 3: [] },
    calls: { 0: [], 1: [], 2: [], 3: [] },
    riichiTiles: { 0: [], 1: [], 2: [], 3: [] },
    currentEventText: "东一局 0本场",
  } as const;

  return {
    context: { question: "为什么这样打？", snapshot },
    ...overrides,
  } as Parameters<typeof classifyAnalysisErrorProfile>[0];
}

describe("analysis error profile", () => {
  it("classifies user corrections first", () => {
    const profile = classifyAnalysisErrorProfile(
      makeBaseSource({
        intent: "user_correction",
        toolPlan: { intent: "user_correction", tools: [], focusTiles: [], answerMode: "correct", userCorrection: true },
      }),
    );

    expect(profile.category).toBe("user_correction");
    expect(profile.priorityOrder[0]).toBe("correction");
  });

  it("classifies placement questions by round context", () => {
    const profile = classifyAnalysisErrorProfile(
      makeBaseSource({
        intent: "placement_strategy",
        context: {
          question: "现在是南场二本场，分差很近，怎么判断避4和打点？",
          snapshot: {
            source: { id: "sample", region: "cn" },
            round: { id: "south-2", title: "南二局 2本场", windRound: 1, roundNumber: 1, honba: 2, riichiSticks: 1, dealer: "东家", danger: "mid" },
            cursor: 78,
            maxCursor: 100,
            targetSeat: 0,
            players: [],
            doraIndicators: ["9p"],
            targetHand: ["1m", "2m", "3m"],
            discards: { 0: [], 1: [], 2: [], 3: [] },
            calls: { 0: [], 1: [], 2: [], 3: [] },
            riichiTiles: { 0: [], 1: [], 2: [], 3: [] },
            currentEventText: "南二局 2本场",
          } as const,
        },
      }),
    );

    expect(profile.category).toBe("placement_endgame");
    expect(profile.priorityOrder[0]).toBe("placement");
  });

  it("classifies riichi defense before dora tie-breaks", () => {
    const profile = classifyAnalysisErrorProfile(
      makeBaseSource({
        intent: "compare_candidate_discards",
        analysisPackage: {
          safety: {
            riichiSeats: [1],
            candidateHints: [],
          },
          candidateComparisons: [],
          engine: { status: "available", topRecommendations: [], warnings: [] },
          tileEfficiency: {
            status: "ready",
            tileCount: 3,
            shanten: 2,
            standardShanten: 2,
            sevenPairsShanten: 5,
            thirteenOrphansShanten: 12,
            topDiscards: [],
          },
        } satisfies ProfileAnalysisPackage,
      }),
    );

    expect(profile.category).toBe("defense_priority");
    expect(profile.priorityOrder[0]).toBe("safety");
  });

  it("keeps riichi defense ahead of automatic placement pressure", () => {
    const profile = classifyAnalysisErrorProfile(
      makeBaseSource({
        intent: "discard_choice",
        context: {
          question: "这里为什么这么切？",
          snapshot: {
            source: { id: "sample", region: "cn" },
            round: { id: "south-1", title: "南一局", windRound: 1, roundNumber: 0, honba: 1, riichiSticks: 0, dealer: "东家", danger: "high" },
            cursor: 80,
            maxCursor: 100,
            targetSeat: 0,
            players: [],
            doraIndicators: ["9p"],
            targetHand: ["1m", "2m", "3m"],
            discards: { 0: [], 1: [], 2: [], 3: [] },
            calls: { 0: [], 1: [], 2: [], 3: [] },
            riichiTiles: { 0: [], 1: [5], 2: [], 3: [] },
            currentEventText: "南一局 1本场",
          } as const,
          decisionContext: {
            applies: true,
            mode: "placement",
            tableWind: "南",
            tableWindLabel: "南场",
            roundLabel: "南一局",
            honba: 1,
            riichiSticks: 0,
            targetRank: 4,
            targetScore: 18000,
            leaderScore: 32000,
            gapToLeader: 14000,
            gapToThird: 4000,
            gapToFourth: 0,
            scoreSummary: "第1名32,000点，自己18,000点",
            requiredFacts: ["当前第4名", "南场", "1本场"],
            notes: ["当前名次偏后时，需要检查追分和打点。"],
          },
        },
        analysisPackage: {
          safety: {
            riichiSeats: [1],
            candidateHints: [],
          },
          candidateComparisons: [],
          engine: { status: "available", topRecommendations: [], warnings: [] },
          tileEfficiency: {
            status: "ready",
            tileCount: 3,
            shanten: 2,
            standardShanten: 2,
            sevenPairsShanten: 5,
            thirteenOrphansShanten: 12,
            topDiscards: [],
          },
        } satisfies ProfileAnalysisPackage,
      }),
    );

    expect(profile.category).toBe("defense_priority");
    expect(profile.priorityOrder[0]).toBe("safety");
  });

  it("classifies same-efficiency white-vs-green questions as future-dora tie-breaks", () => {
    const profile = classifyAnalysisErrorProfile(
      makeBaseSource({
        intent: "compare_candidate_discards",
        toolPlan: { intent: "compare_candidate_discards", tools: [], focusTiles: ["5z", "6z"], answerMode: "explain", userCorrection: false },
        knowledgeCases: [
          {
            id: "same-efficiency-white-green-dragon-dora-potential",
            intent: "compare_candidate_discards",
            triggerTiles: ["5z", "6z"],
            ruleTags: ["dora"],
            positiveExplanation: "same-efficiency tie-break",
            negativeClaims: [],
            requiredFacts: [],
          } satisfies ProfileKnowledgeCase,
        ],
        analysisPackage: {
          candidateComparisons: [
            {
              left: "6z",
              right: "5z",
              sameEfficiency: true,
              sameSafety: true,
              mortalRanks: { "6z": 1, "5z": 2 },
              preferredKeepTile: "5z",
              preferredDiscardTile: "6z",
              decidingFactors: [{ type: "future-dora-potential", strength: "weak", summary: "same-efficiency tie-break" }],
            },
          ],
          safety: { riichiSeats: [], candidateHints: [] },
          engine: { status: "available", topRecommendations: [], warnings: [] },
          tileEfficiency: {
            status: "ready",
            tileCount: 14,
            shanten: 3,
            standardShanten: 3,
            sevenPairsShanten: 4,
            thirteenOrphansShanten: 10,
            topDiscards: [],
          },
        } satisfies ProfileAnalysisPackage,
      }),
    );

    expect(profile.category).toBe("future_dora_tiebreak");
    expect(profile.priorityOrder[0]).toBe("efficiency");
  });
});
