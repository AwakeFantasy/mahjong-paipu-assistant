import { describe, expect, it } from "vitest";

import { buildCandidateComparisons, buildDoraAnalysis, nextDoraTile, previousDoraIndicator } from "./dora-analysis";
import { analyzeRouteFactors } from "./route-factors";
import type { AnalysisEngineResult, VisibleAnalysisSnapshot } from "./types";
import type { TileEfficiencyAnalysis } from "./tile-efficiency";

const snapshot: VisibleAnalysisSnapshot = {
  source: { id: "sample", region: "cn" },
  round: { id: "east-1", title: "东一局", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "东家", danger: "low" },
  cursor: 1,
  maxCursor: 2,
  targetSeat: 0,
  players: [{ seat: 0, wind: "E", name: "E seat 0", score: "25,000", startScore: 25000, style: "目标" }],
  doraIndicators: ["9p"],
  targetHand: ["5z", "6z", "1m", "2m", "3m"],
  discards: { 0: [], 1: [], 2: [], 3: [] },
  calls: { 0: [], 1: [], 2: [], 3: [] },
  riichiTiles: { 0: [], 1: [], 2: [], 3: [] },
  currentEventText: "起手状态",
};

describe("dora analysis", () => {
  it("follows number, wind, and dragon dora cycles", () => {
    expect(nextDoraTile("9m")).toBe("1m");
    expect(nextDoraTile("4z")).toBe("1z");
    expect(nextDoraTile("5z")).toBe("6z");
    expect(nextDoraTile("7z")).toBe("5z");
    expect(previousDoraIndicator("5z")).toBe("7z");
    expect(previousDoraIndicator("6z")).toBe("5z");
  });

  it("compares white and green dragon future dora potential", () => {
    const dora = buildDoraAnalysis(snapshot, ["5z", "6z"]);
    const white = dora.candidateFacts.find((fact) => fact.tile === "5z");
    const green = dora.candidateFacts.find((fact) => fact.tile === "6z");

    expect(white).toMatchObject({ indicator: "7z", visibleIndicatorCount: 0, remainingIndicatorCount: 4 });
    expect(green).toMatchObject({ indicator: "5z", visibleIndicatorCount: 1, remainingIndicatorCount: 3 });
  });

  it("builds same-efficiency candidate comparison with dora deciding factor", () => {
    const dora = buildDoraAnalysis(snapshot, ["5z", "6z"]);
    const engine: AnalysisEngineResult = {
      status: "available",
      recommendations: [
        { action: "discard", tile: "6z", rank: 1, tags: [] },
        { action: "discard", tile: "5z", rank: 2, tags: [] },
      ],
      warnings: [],
    };
    const tileEfficiency: TileEfficiencyAnalysis = {
      status: "ready",
      tileCount: 14,
      shanten: 3,
      standardShanten: 3,
      sevenPairsShanten: 4,
      thirteenOrphansShanten: 10,
      theoreticalWaitCount: 56,
      visibleWaitCount: 0,
      waits: [],
      discardOptions: [
        { discard: "6z", shantenAfterDiscard: 3, theoreticalWaitCount: 56, visibleWaitCount: 0, waitCount: 56, waits: [{ tile: "2m", theoretical: 4, visible: 0, remaining: 4 }] },
        { discard: "5z", shantenAfterDiscard: 3, theoreticalWaitCount: 56, visibleWaitCount: 0, waitCount: 56, waits: [{ tile: "2m", theoretical: 4, visible: 0, remaining: 4 }] },
      ],
    };

    const [comparison] = buildCandidateComparisons({ engine, tileEfficiency, doraAnalysis: dora });

    expect(comparison).toMatchObject({
      left: "6z",
      right: "5z",
      sameEfficiency: true,
      preferredKeepTile: "5z",
      preferredDiscardTile: "6z",
    });
    expect(comparison.decidingFactors.map((item) => item.type)).toContain("future-dora-potential");
  });

  it("keeps future dora potential weak when ordinary number tiles have a stronger efficiency gap", () => {
    const numberSnapshot = {
      ...snapshot,
      doraIndicators: ["4p"],
      targetHand: ["5m", "5m", "7m", "7m", "8m", "3p", "5p", "8p", "9p", "9p", "2s", "4s", "6s", "4p"],
    };
    const dora = buildDoraAnalysis(numberSnapshot, ["8p", "9p"]);
    const engine: AnalysisEngineResult = {
      status: "available",
      recommendations: [
        { action: "discard", tile: "9p", rank: 1, probability: 0.57, tags: [] },
        { action: "discard", tile: "8p", rank: 3, probability: 0.08, tags: [] },
      ],
      warnings: [],
    };
    const tileEfficiency: TileEfficiencyAnalysis = {
      status: "ready",
      tileCount: 14,
      shanten: 2,
      standardShanten: 2,
      sevenPairsShanten: 3,
      thirteenOrphansShanten: 10,
      theoreticalWaitCount: 24,
      visibleWaitCount: 0,
      waits: [],
      discardOptions: [
        { discard: "9p", shantenAfterDiscard: 2, theoreticalWaitCount: 24, visibleWaitCount: 0, waitCount: 24, waits: [{ tile: "7p", theoretical: 4, visible: 0, remaining: 4 }] },
        { discard: "8p", shantenAfterDiscard: 2, theoreticalWaitCount: 22, visibleWaitCount: 0, waitCount: 22, waits: [{ tile: "6m", theoretical: 4, visible: 0, remaining: 4 }] },
      ],
    };

    const comparisons = buildCandidateComparisons({ engine, tileEfficiency, doraAnalysis: dora });
    const comparison = comparisons.find((item) => [item.left, item.right].includes("8p") && [item.left, item.right].includes("9p"));

    expect(comparison?.decidingFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "efficiency", strength: "strong" }),
        expect.objectContaining({ type: "future-dora-potential", strength: "weak" }),
      ]),
    );
    expect(comparison?.preferredDiscardTile).toBe("9p");
  });

  it("lets riichi safety dominate weak future dora potential", () => {
    const riichiSnapshot: VisibleAnalysisSnapshot = {
      ...snapshot,
      targetSeat: 0,
      doraIndicators: ["1m"],
      targetHand: ["6s", "7s", "2m", "3m", "4m"],
      discards: {
        0: [],
        1: ["4s", "6s"],
        2: ["7s"],
        3: [],
      },
      riichiTiles: { 0: [], 1: [0], 2: [], 3: [] },
    };
    const dora = buildDoraAnalysis(riichiSnapshot, ["6s", "7s"]);
    const engine: AnalysisEngineResult = {
      status: "available",
      recommendations: [
        { action: "discard", tile: "6s", rank: 1, tags: [] },
        { action: "discard", tile: "7s", rank: 3, tags: [] },
      ],
      warnings: [],
    };
    const tileEfficiency: TileEfficiencyAnalysis = {
      status: "ready",
      tileCount: 14,
      shanten: 2,
      standardShanten: 2,
      sevenPairsShanten: 4,
      thirteenOrphansShanten: 10,
      theoreticalWaitCount: 0,
      visibleWaitCount: 0,
      waits: [],
      discardOptions: [
        { discard: "6s", shantenAfterDiscard: 2, theoreticalWaitCount: 0, visibleWaitCount: 0, waitCount: 0, waits: [] },
        { discard: "7s", shantenAfterDiscard: 2, theoreticalWaitCount: 0, visibleWaitCount: 0, waitCount: 0, waits: [] },
      ],
    };

    const comparisons = buildCandidateComparisons({
      engine,
      tileEfficiency,
      doraAnalysis: dora,
      snapshot: riichiSnapshot,
      visibleEvents: [
        { type: "discard", seat: 2, tile: "7s", moqie: false, riichi: false },
        { type: "discard", seat: 1, tile: "4s", moqie: false, riichi: true },
        { type: "discard", seat: 1, tile: "6s", moqie: false, riichi: false },
      ],
    });
    const comparison = comparisons.find((item) => [item.left, item.right].includes("6s") && [item.left, item.right].includes("7s"));

    expect(comparison?.preferredDiscardTile).toBe("6s");
    expect(comparison?.decidingFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "safety", strength: "strong" }),
      ]),
    );
  });

  it("adds route-factor evidence when efficiency is close", () => {
    const routeSnapshot = {
      ...snapshot,
      doraIndicators: ["9p"],
      targetHand: ["1m", "1m", "3m", "3m", "5p", "5p", "7s", "7s", "2m", "4m", "6p", "8s", "5z", "6z"],
    };
    const engine: AnalysisEngineResult = {
      status: "available",
      recommendations: [
        { action: "discard", tile: "2m", rank: 1, tags: [] },
        { action: "discard", tile: "1m", rank: 2, tags: [] },
      ],
      warnings: [],
    };
    const tileEfficiency: TileEfficiencyAnalysis = {
      status: "ready",
      tileCount: 14,
      shanten: 2,
      standardShanten: 2,
      sevenPairsShanten: 1,
      thirteenOrphansShanten: 10,
      theoreticalWaitCount: 0,
      visibleWaitCount: 0,
      waits: [],
      discardOptions: [
        { discard: "2m", shantenAfterDiscard: 1, theoreticalWaitCount: 8, visibleWaitCount: 8, waitCount: 8, waits: [{ tile: "6z", theoretical: 4, visible: 0, remaining: 4 }] },
        { discard: "1m", shantenAfterDiscard: 1, theoreticalWaitCount: 8, visibleWaitCount: 8, waitCount: 8, waits: [{ tile: "6z", theoretical: 4, visible: 0, remaining: 4 }] },
      ],
    };
    const dora = buildDoraAnalysis(routeSnapshot, ["2m", "1m"]);
    const routeFactors = analyzeRouteFactors({ tiles: routeSnapshot.targetHand, candidateDiscards: ["2m", "1m"] });

    const [comparison] = buildCandidateComparisons({ engine, tileEfficiency, doraAnalysis: dora, routeFactors });

    expect(comparison.decidingFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "route-factor", preferredDiscardTile: "2m", preferredKeepTile: "1m" }),
      ]),
    );
  });
});
