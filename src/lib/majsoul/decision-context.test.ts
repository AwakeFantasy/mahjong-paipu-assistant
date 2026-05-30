import { describe, expect, it } from "vitest";

import { buildDecisionContext } from "./decision-context";
import type { VisibleAnalysisSnapshot } from "./types";

function makeSnapshot(overrides: Partial<VisibleAnalysisSnapshot> = {}): VisibleAnalysisSnapshot {
  return {
    source: { id: "sample", region: "cn" },
    round: { id: "east-1", title: "东一局", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "东家", danger: "low" },
    cursor: 20,
    maxCursor: 100,
    targetSeat: 0,
    players: [
      { seat: 0, wind: "E", name: "A", score: "25,000", startScore: 25000, style: "目标" },
      { seat: 1, wind: "S", name: "B", score: "27,000", startScore: 25000, style: "" },
      { seat: 2, wind: "W", name: "C", score: "26,000", startScore: 25000, style: "" },
      { seat: 3, wind: "N", name: "D", score: "22,000", startScore: 25000, style: "" },
    ],
    doraIndicators: ["9p"],
    targetHand: ["1m", "2m", "3m"],
    discards: { 0: [], 1: [], 2: [], 3: [] },
    calls: { 0: [], 1: [], 2: [], 3: [] },
    riichiTiles: { 0: [], 1: [], 2: [], 3: [] },
    currentEventText: "东一局 0本场",
    ...overrides,
  };
}

describe("decision context", () => {
  it("applies placement context automatically for fourth place", () => {
    const context = buildDecisionContext(
      makeSnapshot({
        players: [
          { seat: 0, wind: "E", name: "A", score: "18,000", startScore: 25000, style: "目标" },
          { seat: 1, wind: "S", name: "B", score: "32,000", startScore: 25000, style: "" },
          { seat: 2, wind: "W", name: "C", score: "28,000", startScore: 25000, style: "" },
          { seat: 3, wind: "N", name: "D", score: "22,000", startScore: 25000, style: "" },
        ],
      }),
      "这里为什么这么切？",
    );

    expect(context.applies).toBe(true);
    expect(context.mode).toBe("placement");
    expect(context.requiredFacts.join(" ")).toContain("第4名");
    expect(context.notes.join(" ")).toContain("追分");
  });

  it("does not over-trigger placement for early third place with a clear fourth-place buffer", () => {
    const context = buildDecisionContext(
      makeSnapshot({
        players: [
          { seat: 0, wind: "E", name: "A", score: "25,000", startScore: 25000, style: "目标" },
          { seat: 1, wind: "S", name: "B", score: "31,000", startScore: 25000, style: "" },
          { seat: 2, wind: "W", name: "C", score: "29,000", startScore: 25000, style: "" },
          { seat: 3, wind: "N", name: "D", score: "15,000", startScore: 25000, style: "" },
        ],
      }),
      "这里为什么这么切？",
    );

    expect(context.targetRank).toBe(3);
    expect(context.applies).toBe(false);
  });

  it("applies placement context for third place in south round", () => {
    const context = buildDecisionContext(
      makeSnapshot({
        round: { id: "south-1", title: "南一局", windRound: 1, roundNumber: 0, honba: 1, riichiSticks: 1, dealer: "东家", danger: "mid" },
      }),
      "这里为什么这么切？",
    );

    expect(context.applies).toBe(true);
    expect(context.mode).toBe("placement");
    expect(context.requiredFacts.join(" ")).toContain("第3名");
    expect(context.requiredFacts.join(" ")).toContain("避4");
  });
});
