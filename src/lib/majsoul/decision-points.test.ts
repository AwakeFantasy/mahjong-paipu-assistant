import { describe, expect, it } from "vitest";

import { buildDecisionPoints, compareDecisionDifference, toEngineOverlay } from "./decision-points";
import type { Round } from "./types";

const round: Round = {
  id: "east-1",
  title: "东一局",
  windRound: 0,
  roundNumber: 0,
  honba: 0,
  riichiSticks: 0,
  dealer: "东家",
  result: "进行中",
  scoreDelta: "0",
  focus: "测试",
  danger: "low",
  startScores: [25000, 25000, 25000, 25000],
  doraIndicators: ["1m"],
  initialHands: { 0: ["1m", "2m", "3m"], 1: [], 2: [], 3: [] },
  discards: { 0: [], 1: [], 2: [], 3: [] },
  calls: [],
  events: [
    { type: "draw", seat: 0, tile: "4m" },
    { type: "discard", seat: 0, tile: "1m", moqie: false, riichi: false },
    { type: "draw", seat: 1, tile: "9p" },
    { type: "discard", seat: 1, tile: "9p", moqie: true, riichi: false },
    { type: "draw", seat: 0, tile: "5p" },
    { type: "discard", seat: 0, tile: "2m", moqie: false, riichi: false },
  ],
};

describe("decision points", () => {
  it("derives target draw decision points from real events", () => {
    const points = buildDecisionPoints({ sourceId: "sample", round, targetSeat: 0 });

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      roundId: "east-1",
      cursor: 1,
      seat: 0,
      kind: "draw",
      drawnTile: "4m",
      actualAction: "discard",
      actualTile: "1m",
      actualEventCursor: 2,
      snapshotKey: "sample:east-1:1/6:seat0",
    });
  });

  it("derives the dealer initial discard when the round starts with fourteen tiles", () => {
    const dealerRound: Round = {
      ...round,
      roundNumber: 0,
      initialHands: { 0: ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "1s", "2s", "3s", "4s", "5s"], 1: [], 2: [], 3: [] },
      events: [
        { type: "new-round", seat: 0, label: "east-1" },
        { type: "discard", seat: 0, tile: "1m", moqie: false, riichi: false },
      ],
    };

    const points = buildDecisionPoints({ sourceId: "sample", round: dealerRound, targetSeat: 0 });

    expect(points).toEqual([
      expect.objectContaining({
        cursor: 1,
        kind: "draw",
        drawnTile: "5s",
        actualAction: "discard",
        actualTile: "1m",
      }),
    ]);
  });

  it("derives reaction points for call and pass opportunities", () => {
    const reactionRound: Round = {
      ...round,
      initialHands: { 0: ["1m", "1m", "2m", "3m"], 1: [], 2: [], 3: [] },
      events: [
        { type: "discard", seat: 3, tile: "4m", moqie: false, riichi: false },
        { type: "call", seat: 0, callType: "吃", tiles: ["2m", "3m", "4m"], froms: [0, 0, 3] },
        { type: "discard", seat: 1, tile: "1m", moqie: false, riichi: false },
      ],
    };

    const points = buildDecisionPoints({ sourceId: "sample", round: reactionRound, targetSeat: 0 });

    expect(points).toEqual([
      expect.objectContaining({ kind: "reaction", cursor: 1, actualAction: "chi", reactionTile: "4m" }),
      expect.objectContaining({ kind: "reaction", cursor: 3, actualAction: "pass", reactionTile: "1m" }),
    ]);
  });

  it("derives reaction points for Chinese kan and ron opportunities", () => {
    const reactionRound: Round = {
      ...round,
      initialHands: { 0: ["7z", "7z", "7z"], 1: [], 2: [], 3: [] },
      events: [
        { type: "discard", seat: 2, tile: "7z", moqie: false, riichi: false },
        { type: "kan", seat: 0, callType: "\u6760", tiles: ["7z", "7z", "7z", "7z"] },
        { type: "discard", seat: 1, tile: "3p", moqie: false, riichi: false },
        { type: "agari", seat: 0, zimo: false, tile: "3p", title: "\u8363\u548c", point: 8000 },
      ],
    };

    const points = buildDecisionPoints({ sourceId: "sample", round: reactionRound, targetSeat: 0 });

    expect(points).toEqual([
      expect.objectContaining({ kind: "reaction", cursor: 1, actualAction: "kan", reactionTile: "7z" }),
      expect.objectContaining({ kind: "reaction", cursor: 3, actualAction: "win", reactionTile: "3p" }),
    ]);
  });

  it("does not create call/pass reaction points after the target has riichi", () => {
    const riichiRound: Round = {
      ...round,
      initialHands: { 0: ["1m", "1m", "2m", "3m"], 1: [], 2: [], 3: [] },
      events: [
        { type: "draw", seat: 0, tile: "4m" },
        { type: "discard", seat: 0, tile: "4m", moqie: true, riichi: true },
        { type: "discard", seat: 1, tile: "1m", moqie: false, riichi: false },
      ],
    };

    const points = buildDecisionPoints({ sourceId: "sample", round: riichiRound, targetSeat: 0 });

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ kind: "draw", actualAction: "riichi" });
  });

  it("detects kakan as a draw decision after a previous pon", () => {
    const kakanRound: Round = {
      ...round,
      initialHands: { 0: ["5z", "5z", "1m", "2m", "3m"], 1: [], 2: [], 3: [] },
      events: [
        { type: "discard", seat: 1, tile: "5z", moqie: false, riichi: false },
        { type: "call", seat: 0, callType: "\u78b0", tiles: ["5z", "5z", "5z"], froms: [1, 0, 0] },
        { type: "discard", seat: 0, tile: "1m", moqie: false, riichi: false },
        { type: "draw", seat: 0, tile: "5z" },
        { type: "kan", seat: 0, callType: "\u52a0\u6760", tiles: ["5z"] },
        { type: "draw", seat: 0, tile: "9m" },
      ],
    };

    const points = buildDecisionPoints({ sourceId: "sample", round: kakanRound, targetSeat: 0 });

    expect(points).toEqual([
      expect.objectContaining({ kind: "reaction", cursor: 1, actualAction: "pon", reactionTile: "5z" }),
      expect.objectContaining({ kind: "draw", cursor: 4, drawnTile: "5z", actualAction: "kan", actualTile: "5z" }),
    ]);
  });

  it("compares actual discard with top Mortal recommendation", () => {
    const [point] = buildDecisionPoints({ sourceId: "sample", round, targetSeat: 0 });
    const overlay = toEngineOverlay(point.snapshotKey, {
      status: "available",
      recommendations: [{ action: "discard", tile: "2m", rank: 1, score: 0.8, tags: [] }],
      warnings: [],
    });

    expect(compareDecisionDifference(point, overlay)).toMatchObject({
      status: "different",
      topRecommendation: { tile: "2m" },
    });
  });

  it("marks different action types as differences instead of not-comparable", () => {
    const [discardPoint] = buildDecisionPoints({ sourceId: "sample", round, targetSeat: 0 });
    const discardVsKan = toEngineOverlay(discardPoint.snapshotKey, {
      status: "available",
      recommendations: [{ action: "kan", tile: "1m", rank: 1, tags: ["kan_select"] }],
      warnings: [],
    });

    expect(compareDecisionDifference(discardPoint, discardVsKan)).toMatchObject({
      status: "different",
      topRecommendation: { action: "kan" },
    });

    const kanRound: Round = {
      ...round,
      initialHands: { 0: ["5z", "5z", "5z", "1m"], 1: [], 2: [], 3: [] },
      events: [
        { type: "draw", seat: 0, tile: "5z" },
        { type: "kan", seat: 0, callType: "\u6697\u6760", tiles: ["5z", "5z", "5z", "5z"] },
      ],
    };
    const [kanPoint] = buildDecisionPoints({ sourceId: "sample", round: kanRound, targetSeat: 0 });
    const kanVsDiscard = toEngineOverlay(kanPoint.snapshotKey, {
      status: "available",
      recommendations: [{ action: "discard", tile: "1m", rank: 1, tags: [] }],
      warnings: [],
    });

    expect(compareDecisionDifference(kanPoint, kanVsDiscard)).toMatchObject({
      status: "different",
      topRecommendation: { action: "discard" },
    });
  });

  it("treats red five and normal five as comparable", () => {
    const [point] = buildDecisionPoints({
      sourceId: "sample",
      targetSeat: 0,
      round: {
        ...round,
        events: [
          { type: "draw", seat: 0, tile: "0p" },
          { type: "discard", seat: 0, tile: "0p", moqie: true, riichi: false },
        ],
      },
    });
    const overlay = toEngineOverlay(point.snapshotKey, {
      status: "available",
      recommendations: [{ action: "discard", tile: "5p", rank: 1, tags: [] }],
      warnings: [],
    });

    expect(compareDecisionDifference(point, overlay).status).toBe("same");
  });

  it("compares riichi decisions instead of marking them not-comparable", () => {
    const [point] = buildDecisionPoints({
      sourceId: "sample",
      targetSeat: 0,
      round: {
        ...round,
        events: [
          { type: "draw", seat: 0, tile: "5p" },
          { type: "discard", seat: 0, tile: "5p", moqie: true, riichi: true },
        ],
      },
    });

    expect(point.actualAction).toBe("riichi");

    const sameOverlay = toEngineOverlay(point.snapshotKey, {
      status: "available",
      recommendations: [{ action: "riichi", rank: 1, tags: [] }],
      warnings: [],
    });
    const differentOverlay = toEngineOverlay(point.snapshotKey, {
      status: "available",
      recommendations: [{ action: "discard", tile: "5p", rank: 1, tags: [] }],
      warnings: [],
    });

    expect(compareDecisionDifference(point, sameOverlay).status).toBe("same");
    expect(compareDecisionDifference(point, differentOverlay).status).toBe("different");
  });
});
