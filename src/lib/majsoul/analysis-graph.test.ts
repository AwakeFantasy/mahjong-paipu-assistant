import { describe, expect, it } from "vitest";

import { runCurrentHandAnalysisGraph, validateAnalysisAnswer } from "./analysis-graph";
import type { AnalysisContext, AnalysisEngineResult } from "./types";

const baseContext: AnalysisContext = {
  mode: "current-hand",
  question: "为什么这里推荐切发财而不是切白板？",
  visibleSummary: ["东一局，光标 1/2"],
  visibleEvents: [],
  snapshot: {
    source: { id: "sample", region: "cn" },
    round: { id: "east-1", title: "东一局", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "东家", danger: "low" },
    cursor: 1,
    maxCursor: 2,
    targetSeat: 0,
    players: [{ seat: 0, wind: "E", name: "A", score: "25,000", startScore: 25000, style: "目标" }],
    doraIndicators: ["9p"],
    targetHand: ["1m", "7m", "8m", "9m", "3p", "6p", "7p", "1s", "2s", "3z", "3z", "5z", "6z", "5m"],
    discards: { 0: [], 1: [], 2: [], 3: [] },
    calls: { 0: [], 1: [], 2: [], 3: [] },
    riichiTiles: { 0: [], 1: [], 2: [], 3: [] },
    currentEventText: "东1局 0本场",
  },
};

const baseEngine: AnalysisEngineResult = {
  status: "available",
  recommendations: [
    { action: "discard", tile: "6z", rank: 1, probability: 0.38, tags: [] },
    { action: "discard", tile: "5z", rank: 2, probability: 0.27, tags: [] },
  ],
  warnings: [],
};

const riichiContext: AnalysisContext = {
  ...baseContext,
  question: "这里为什么推荐切4索？",
  snapshot: {
    ...baseContext.snapshot,
    cursor: 89,
    maxCursor: 109,
    targetSeat: 3,
    targetHand: ["2m", "3m", "4m", "5m", "0m", "2s", "4s", "6s", "7s", "8s", "3m"],
    drawnTile: "3m",
    discards: {
      0: ["2z", "5z", "6z", "3z", "3z", "1z", "3p", "1s", "7s", "4p", "9s"],
      1: ["1p", "9m", "9p", "1m", "9s", "7s", "1s", "2m", "2s", "9m", "9s"],
      2: ["2z", "4z", "3z", "5z", "1s", "6s", "6p", "6p", "4s", "4p"],
      3: ["1z", "5z", "8p", "8m", "4p", "4z", "4m", "2p", "3p", "2z"],
    },
    calls: {
      0: [],
      1: [],
      2: [],
      3: [{ seat: 3, callType: "pon", tiles: ["7z", "7z", "7z"], froms: [3, 3, 1], eventIndex: 56 }],
    },
    riichiTiles: { 0: [], 1: [], 2: [6], 3: [] },
    currentEventText: "N 摸 3万",
  },
};

const riichiEngine: AnalysisEngineResult = {
  status: "available",
  recommendations: [
    { action: "discard", tile: "4s", rank: 1, probability: 0.46, tags: [] },
    { action: "discard", tile: "3m", rank: 2, probability: 0.16, tags: [] },
  ],
  warnings: [],
};

const placementContext: AnalysisContext = {
  ...baseContext,
  question: "现在是南场二本场，分差很近，这手为什么不能只看牌效，要考虑避4和打点？",
  snapshot: {
    ...baseContext.snapshot,
    round: { ...baseContext.snapshot.round, title: "南二局 2本场", windRound: 1, roundNumber: 1, honba: 2, riichiSticks: 1, danger: "mid" },
    cursor: 78,
    maxCursor: 100,
    targetHand: ["1m", "2m", "3m", "4m", "6p", "7p", "8p", "2s", "3s", "4s", "5z", "6z", "7z"],
    drawnTile: "5m",
    players: [
      { seat: 0, wind: "E", name: "A", score: "28,900", startScore: 25000, style: "目标" },
      { seat: 1, wind: "S", name: "B", score: "31,200", startScore: 25000, style: "目标" },
      { seat: 2, wind: "W", name: "C", score: "24,700", startScore: 25000, style: "目标" },
      { seat: 3, wind: "N", name: "D", score: "15,200", startScore: 25000, style: "目标" },
    ],
  },
};

function counterfactualFactor(state: Awaited<ReturnType<typeof runCurrentHandAnalysisGraph>>, left: string, right: string, id: string) {
  return state.analysisPackage?.candidateComparisons
    ?.find((item) => [item.left, item.right].includes(left) && [item.left, item.right].includes(right))
    ?.counterfactualSummary?.factors.find((factor) => factor.id === id);
}

describe("current hand analysis graph", () => {
  it("classifies correction intent and retrieves the white-vs-green dora case", async () => {
    const state = await runCurrentHandAnalysisGraph(
      {
        ...baseContext,
        question: "这个地方其实是因为白板发财牌效相同，但白板的未来宝牌潜力更高，所以先切发财更合理。",
      },
      baseEngine,
    );

    expect(state.toolPlan).toMatchObject({ intent: "user_correction", userCorrection: true });
    expect(state.analysisPackage?.knowledgeCases?.map((item) => item.id)).toContain("same-efficiency-white-green-dragon-dora-potential");
    expect(state.analysisPackage?.doraAnalysis?.candidateFacts.find((fact) => fact.tile === "5z")).toMatchObject({ indicator: "7z" });
  });

  it("keeps the white-vs-green comparison on the candidate-comparison path", async () => {
    const state = await runCurrentHandAnalysisGraph(baseContext, baseEngine);
    const comparison = state.analysisPackage?.candidateComparisons?.find((item) => item.left === "6z" && item.right === "5z");

    expect(state.toolPlan).toMatchObject({ intent: "compare_candidate_discards", userCorrection: false });
    expect(state.directAnswer?.conclusion).toContain("发财");
    expect(comparison?.sameSafety).toBe(true);
    expect(comparison?.decidingFactors.map((factor) => factor.type)).not.toContain("safety");
    expect(state.analysisPackage?.evidenceCatalog?.map((item) => item.kind)).toContain("routeFactor");
    expect(state.analysisPackage?.tableInference?.applies).toBe(true);
    expect(state.analysisPackage?.tableInference?.reason).toContain("解释边界");
  });

  it("prioritizes riichi defense when the recommendation is the genbutsu", async () => {
    const state = await runCurrentHandAnalysisGraph(riichiContext, riichiEngine);
    const comparison = state.analysisPackage?.candidateComparisons?.find((item) => item.left === "4s" && item.right === "3m");

    expect(comparison?.sameSafety).toBe(false);
    expect(comparison?.preferredDiscardTile).toBe("4s");
    expect(comparison?.decidingFactors.map((factor) => factor.type)).toContain("safety");
    expect(JSON.stringify(state.directAnswer)).toContain("防守");
  });

  it("prefers placement-aware answers when the round context matters", async () => {
    const state = await runCurrentHandAnalysisGraph(placementContext, baseEngine);

    expect(state.analysisPackage?.decisionContext?.applies).toBe(true);
    expect(state.analysisPackage?.decisionContext?.requiredFacts.join(" ")).toContain("本场");
    expect(state.directAnswer?.reasons.join(" ")).toContain("分差");
  });

  it("brings score context into ordinary questions when the target is fourth", async () => {
    const state = await runCurrentHandAnalysisGraph(
      {
        ...baseContext,
        question: "这里为什么这么切？",
        snapshot: {
          ...baseContext.snapshot,
          players: [
            { seat: 0, wind: "E", name: "A", score: "18,000", startScore: 25000, style: "目标" },
            { seat: 1, wind: "S", name: "B", score: "32,000", startScore: 25000, style: "" },
            { seat: 2, wind: "W", name: "C", score: "28,000", startScore: 25000, style: "" },
            { seat: 3, wind: "N", name: "D", score: "22,000", startScore: 25000, style: "" },
          ],
        },
      },
      baseEngine,
    );

    expect(state.analysisPackage?.decisionContext?.applies).toBe(true);
    expect(state.analysisPackage?.decisionContext?.requiredFacts.join(" ")).toContain("第4名");
    expect(state.directAnswer?.reasons.join(" ")).toContain("第4名");
  });

  it("keeps safety-first comparisons grounded when dora points the other way", async () => {
    const state = await runCurrentHandAnalysisGraph(
      {
        mode: "current-hand",
        question: "为什么这里推荐切6索而不是7索？有什么差别吗？",
        visibleSummary: ["东1局，光标 105/109"],
        visibleEvents: [
          { type: "discard", seat: 2, tile: "7s", moqie: false, riichi: false },
          { type: "discard", seat: 1, tile: "4s", moqie: false, riichi: true },
          { type: "discard", seat: 1, tile: "6s", moqie: false, riichi: false },
        ],
        snapshot: {
          source: { id: "sample", region: "cn" },
          round: { id: "east-1", title: "东1局", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "东家", danger: "low" },
          cursor: 105,
          maxCursor: 109,
          targetSeat: 0,
          players: [{ seat: 0, wind: "E", name: "A", score: "25,000", startScore: 25000, style: "目标" }],
          doraIndicators: ["1m"],
          targetHand: ["2m", "3m", "3m", "4m", "5m", "6s", "7s", "8s", "2p", "3p", "4p"],
          discards: { 0: [], 1: ["9p", "4s", "6s"], 2: ["7s"], 3: [] },
          calls: { 0: [], 1: [], 2: [], 3: [] },
          riichiTiles: { 0: [], 1: [1], 2: [], 3: [] },
          currentEventText: "东1局 0本场",
        },
      },
      {
        status: "available",
        recommendations: [
          { action: "discard", tile: "6s", rank: 1, probability: 0.48, tags: [] },
          { action: "discard", tile: "7s", rank: 3, probability: 0.16, tags: [] },
        ],
        warnings: [],
      },
    );

    expect(state.directAnswer?.reasons.join(" ")).toContain("安全");
    expect(counterfactualFactor(state, "6s", "7s", "safety")).toMatchObject({ preferredDiscardTile: "6s", relationToEngine: "supports" });
    expect(counterfactualFactor(state, "6s", "7s", "dora")).toMatchObject({ preferredDiscardTile: "7s", relationToEngine: "opposes" });
    expect(counterfactualFactor(state, "6s", "7s", "safety")).toMatchObject({ label: "只看安全", strength: "strong" });
    expect(state.analysisPackage?.candidateComparisons?.find((item) => [item.left, item.right].includes("6s") && [item.left, item.right].includes("7s"))?.counterfactualSummary?.boundary).toBeUndefined();
    expect(state.directAnswer?.conclusion).toContain("切6索");
    expect(state.analysisPackage?.tableInference?.applies).toBe(true);
  });

  it("marks tile efficiency as supporting the Mortal order", async () => {
    const state = await runCurrentHandAnalysisGraph(
      {
        mode: "current-hand",
        question: "为什么这里推荐切5筒而不是1万？",
        visibleSummary: ["东1局，光标 2/2"],
        visibleEvents: [],
        snapshot: {
          source: { id: "sample", region: "cn" },
          round: { id: "east-1", title: "东1局", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "东家", danger: "low" },
          cursor: 2,
          maxCursor: 2,
          targetSeat: 0,
          players: [{ seat: 0, wind: "E", name: "A", score: "25,000", startScore: 25000, style: "目标" }],
          doraIndicators: ["9s"],
          targetHand: ["1m", "2m", "3m", "4m", "6m", "7p", "8p", "9p", "2s", "3s", "4s", "5z", "6z", "5p"],
          discards: { 0: [], 1: [], 2: [], 3: [] },
          calls: { 0: [], 1: [], 2: [], 3: [] },
          riichiTiles: { 0: [], 1: [], 2: [], 3: [] },
          currentEventText: "E 摸 5筒",
        },
      },
      {
        status: "available",
        recommendations: [
          { action: "discard", tile: "5p", rank: 1, probability: 0.41, tags: [] },
          { action: "discard", tile: "1m", rank: 2, probability: 0.31, tags: [] },
        ],
        warnings: [],
      },
    );

    expect(counterfactualFactor(state, "5p", "1m", "efficiency")).toMatchObject({ preferredDiscardTile: "5p", relationToEngine: "supports" });
    expect(state.directAnswer?.reasons.join(" ")).toContain("只看牌效");
  });

  it("opens table inference when local efficiency and safety both contradict the engine", async () => {
    const state = await runCurrentHandAnalysisGraph(
      {
        mode: "current-hand",
        question: "为什么这里推荐切1万而不是5筒？",
        visibleSummary: ["东1局，光标 2/2"],
        visibleEvents: [
          { type: "discard", seat: 1, tile: "5p", moqie: false, riichi: true },
          { type: "draw", seat: 0, tile: "5p" },
        ],
        snapshot: {
          source: { id: "sample", region: "cn" },
          round: { id: "east-1", title: "东1局", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "东家", danger: "mid" },
          cursor: 2,
          maxCursor: 2,
          targetSeat: 0,
          players: [{ seat: 0, wind: "E", name: "A", score: "25,000", startScore: 25000, style: "目标" }],
          doraIndicators: ["4p"],
          targetHand: ["1m", "2m", "3m", "4m", "6m", "7p", "8p", "9p", "2s", "3s", "4s", "5z", "6z", "5p"],
          discards: { 0: [], 1: ["5p"], 2: [], 3: [] },
          calls: { 0: [], 1: [], 2: [], 3: [] },
          riichiTiles: { 0: [], 1: [0], 2: [], 3: [] },
          currentEventText: "E 摸 5筒",
        },
      },
      {
        status: "available",
        recommendations: [
          { action: "discard", tile: "1m", rank: 1, probability: 0.41, tags: [] },
          { action: "discard", tile: "5p", rank: 2, probability: 0.31, tags: [] },
        ],
        warnings: [],
      },
    );
    const comparison = state.analysisPackage?.candidateComparisons?.find((item) => item.left === "1m" && item.right === "5p");

    expect(comparison?.preferredDiscardTile).toBe("1m");
    expect(comparison?.decidingFactors.find((factor) => factor.type === "efficiency")?.preferredDiscardTile).toBe("5p");
    expect(comparison?.decidingFactors.find((factor) => factor.type === "safety")?.preferredDiscardTile).toBe("5p");
    expect(counterfactualFactor(state, "1m", "5p", "safety")).toMatchObject({ preferredDiscardTile: "5p", relationToEngine: "opposes" });
    expect(state.analysisPackage?.tableInference?.applies).toBe(true);
    expect(state.analysisPackage?.tableInference?.reason).toContain("解释边界");
  });

  it("marks route factors as supporting the Mortal order only when routes differ", async () => {
    const state = await runCurrentHandAnalysisGraph(
      {
        ...baseContext,
        question: "为什么这里推荐切2万而不是1万？",
        snapshot: {
          ...baseContext.snapshot,
          doraIndicators: ["9p"],
          targetHand: ["1m", "1m", "3m", "3m", "5p", "5p", "7s", "7s", "2m", "4m", "6p", "8s", "5z", "6z"],
        },
      },
      {
        status: "available",
        recommendations: [
          { action: "discard", tile: "2m", rank: 1, tags: [] },
          { action: "discard", tile: "1m", rank: 2, tags: [] },
        ],
        warnings: [],
      },
    );

    expect(counterfactualFactor(state, "2m", "1m", "route")).toMatchObject({ preferredDiscardTile: "2m", relationToEngine: "supports" });
    expect(state.directAnswer?.reasons.join(" ")).toContain("只看牌型路线");
  });

  it("uses the explanation boundary instead of guessing when local factors cannot explain the order", async () => {
    const state = await runCurrentHandAnalysisGraph(
      {
        mode: "current-hand",
        question: "为什么这里推荐切6索而不是7索？",
        visibleSummary: ["东1局，光标 1/2"],
        visibleEvents: [],
        snapshot: {
          source: { id: "sample", region: "cn" },
          round: { id: "east-1", title: "东1局", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "东家", danger: "low" },
          cursor: 1,
          maxCursor: 2,
          targetSeat: 0,
          players: [{ seat: 0, wind: "E", name: "A", score: "25,000", startScore: 25000, style: "目标" }],
          doraIndicators: ["1m"],
          targetHand: ["2m", "3m", "3m", "4m", "5m", "6s", "7s", "8s", "2p", "3p", "4p"],
          discards: { 0: [], 1: [], 2: [], 3: [] },
          calls: { 0: [], 1: [], 2: [], 3: [] },
          riichiTiles: { 0: [], 1: [], 2: [], 3: [] },
          currentEventText: "东1局 0本场",
        },
      },
      {
        status: "available",
        recommendations: [
          { action: "discard", tile: "6s", rank: 1, probability: 0.41, tags: [] },
          { action: "discard", tile: "7s", rank: 2, probability: 0.31, tags: [] },
        ],
        warnings: [],
      },
    );
    const summary = state.analysisPackage?.candidateComparisons?.find((item) => [item.left, item.right].includes("6s") && [item.left, item.right].includes("7s"))?.counterfactualSummary;

    expect(summary?.factors.every((factor) => factor.relationToEngine !== "supports")).toBe(true);
    expect(state.directAnswer?.reasons.join(" ")).toContain("当前系统不硬猜");
    expect(state.directAnswer?.reasons.join(" ")).not.toContain("可能次因");
  });

  it("falls back when the LLM answer contradicts local shanten facts", async () => {
    const state = await runCurrentHandAnalysisGraph(riichiContext, riichiEngine);
    const validation = validateAnalysisAnswer(
      {
        conclusion: "切4索后0向听，听3索。",
        reasons: ["切4索后0向听，听3索。", "4索对立直家是现物。"],
        risks: [],
        suggestedQuestions: [],
        evidence: [],
      },
      state,
    );

    expect(validation.warnings.join(" ")).toContain("牌效/向听");
    expect(JSON.stringify(validation.structured)).toContain("3万");
  });

  it("falls back when the LLM reverses the preferred discard direction", async () => {
    const state = await runCurrentHandAnalysisGraph(
      {
        mode: "current-hand",
        question: "为什么这里mortal推荐切6索比7索更好？",
        visibleSummary: ["东1局，光标 105/109"],
        visibleEvents: [
          { type: "discard", seat: 2, tile: "7s", moqie: false, riichi: false },
          { type: "discard", seat: 1, tile: "4s", moqie: false, riichi: true },
          { type: "discard", seat: 1, tile: "6s", moqie: false, riichi: false },
        ],
        snapshot: {
          source: { id: "sample", region: "cn" },
          round: { id: "east-1", title: "东1局", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "东家", danger: "low" },
          cursor: 105,
          maxCursor: 109,
          targetSeat: 0,
          players: [{ seat: 0, wind: "E", name: "A", score: "25,000", startScore: 25000, style: "目标" }],
          doraIndicators: ["1m"],
          targetHand: ["2m", "3m", "3m", "4m", "5m", "6s", "7s", "8s", "2p", "3p", "4p"],
          discards: { 0: [], 1: ["9p", "4s", "6s"], 2: ["7s"], 3: [] },
          calls: { 0: [], 1: [], 2: [], 3: [] },
          riichiTiles: { 0: [], 1: [1], 2: [], 3: [] },
          currentEventText: "东1局 0本场",
        },
      },
      {
        status: "available",
        recommendations: [
          { action: "discard", tile: "6s", rank: 1, probability: 0.48, tags: [] },
          { action: "discard", tile: "7s", rank: 3, probability: 0.16, tags: [] },
        ],
        warnings: [],
      },
    );

    const validation = validateAnalysisAnswer(
      {
        conclusion: "更推荐切 7索，保留 6索。",
        reasons: ["6索 的未来宝牌潜力略高，因此同牌效下更倾向保留 6索、先切 7索。"],
        risks: [],
        suggestedQuestions: [],
        evidence: [],
      },
      state,
    );

    expect(validation.warnings.join(" ")).toContain("取舍方向");
    expect(validation.structured).toBe(state.directAnswer);
    expect(validation.structured?.conclusion).toContain("更推荐切6索");
  });
});
