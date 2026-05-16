import { describe, expect, it } from "vitest";

import { buildPlaybackState, sortTilesForHand } from "./playback";
import type { Round } from "./types";

const round: Round = {
  id: "east-1",
  title: "东1局 0本场",
  windRound: 0,
  roundNumber: 0,
  honba: 0,
  riichiSticks: 0,
  dealer: "东家",
  result: "西家 荣和 8000",
  scoreDelta: "-8,000",
  focus: "测试局",
  danger: "low",
  startScores: [25000, 25000, 25000, 25000],
  endScores: [17000, 25000, 33000, 25000],
  doraIndicators: ["4p"],
  initialHands: {
    0: ["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "1z", "2z", "3z", "4z"],
    1: ["1p"],
    2: ["1s"],
    3: ["5m"],
  },
  discards: { 0: [], 1: [], 2: [], 3: [] },
  calls: [],
  events: [
    { type: "draw", seat: 0, tile: "5m", leftTileCount: 69 },
    { type: "discard", seat: 0, tile: "5m", moqie: true, riichi: true },
    { type: "discard", seat: 1, tile: "9p", moqie: false, riichi: false },
    { type: "draw", seat: 0, tile: "0p", leftTileCount: 68 },
    { type: "discard", seat: 0, tile: "5p", moqie: false, riichi: false },
    { type: "call", seat: 2, callType: "碰", tiles: ["9p", "9p", "9p"], froms: [1, 2, 2] },
    { type: "kan", seat: 0, callType: "暗杠", tiles: ["1z", "1z", "1z", "1z"] },
    { type: "agari", seat: 2, zimo: false, tile: "9p", title: "断幺", point: 8000 },
  ],
};

describe("buildPlaybackState", () => {
  it("returns the initial hand and empty visible state at cursor zero", () => {
    const playback = buildPlaybackState(round, 0, 0);

    expect(playback).toMatchObject({
      cursor: 0,
      maxCursor: round.events.length,
      visibleCount: 0,
      discards: { 0: [], 1: [], 2: [], 3: [] },
      calls: { 0: [], 1: [], 2: [], 3: [] },
      riichiTiles: { 0: [], 1: [], 2: [], 3: [] },
    });
    expect(playback.currentEvent).toBeUndefined();
    expect(playback.previousEvent).toBeUndefined();
    expect(playback.targetHand).toEqual(round.initialHands[0]);
    expect(playback.scores).toEqual({ 0: 25000, 1: 25000, 2: 25000, 3: 25000 });
    expect(playback.riichiSticks).toBe(0);
  });

  it("adds a target draw to hand and exposes the drawn tile", () => {
    const playback = buildPlaybackState(round, 0, 1);

    expect(playback.targetHand).toContain("5m");
    expect(playback.drawnTile).toBe("5m");
    expect(playback.remainingTiles).toBe(69);
    expect(playback.currentEvent).toMatchObject({ type: "draw", seat: 0, tile: "5m" });
  });

  it("exposes the dealer initial extra tile as drawn at the new-round cursor", () => {
    const dealerRound: Round = {
      ...round,
      roundNumber: 0,
      initialHands: {
        ...round.initialHands,
        0: [...round.initialHands[0], "6z"],
      },
      events: [
        { type: "new-round", seat: 0, label: "east-1" },
        { type: "discard", seat: 0, tile: "1m", moqie: false, riichi: false },
      ],
    };
    const playback = buildPlaybackState(dealerRound, 0, 1);

    expect(playback.currentEvent).toMatchObject({ type: "new-round", seat: 0 });
    expect(playback.drawnTile).toBe("6z");
    expect(playback.targetHand.at(-1)).toBe("6z");
  });

  it("removes the target player's first discard and records its river and riichi index", () => {
    const playback = buildPlaybackState(round, 0, 2);

    expect(playback.discards[0]).toEqual(["5m"]);
    expect(playback.targetHand).not.toContain("5m");
    expect(playback.targetHand).toHaveLength(round.initialHands[0].length);
    expect(playback.drawnTile).toBeUndefined();
    expect(playback.riichiTiles[0]).toEqual([0]);
    expect(playback.riichiSticks).toBe(1);
  });

  it("tracks riichi deposits during playback and clears them after a win", () => {
    const depositRound: Round = {
      ...round,
      riichiSticks: 1,
      events: [
        { type: "discard", seat: 1, tile: "1m", moqie: false, riichi: true },
        { type: "discard", seat: 2, tile: "2m", moqie: false, riichi: true },
        { type: "agari", seat: 0, zimo: false, tile: "2m", title: "立直", point: 8000 },
      ],
    };

    expect(buildPlaybackState(depositRound, 0, 0).riichiSticks).toBe(1);
    expect(buildPlaybackState(depositRound, 0, 1).riichiSticks).toBe(2);
    expect(buildPlaybackState(depositRound, 0, 2).riichiSticks).toBe(3);
    expect(buildPlaybackState(depositRound, 0, 3).riichiSticks).toBe(0);
  });

  it("does not mutate target hand when another player discards", () => {
    const beforeOtherDiscard = buildPlaybackState(round, 0, 2);
    const afterOtherDiscard = buildPlaybackState(round, 0, 3);

    expect(afterOtherDiscard.discards[1]).toEqual(["9p"]);
    expect(afterOtherDiscard.targetHand).toEqual(beforeOtherDiscard.targetHand);
  });

  it("tracks every player's visible hand through draws and discards", () => {
    const playbackRound: Round = {
      ...round,
      initialHands: {
        ...round.initialHands,
        1: ["1p", "2p", "3p"],
      },
      events: [
        { type: "draw", seat: 1, tile: "4p", leftTileCount: 69 },
        { type: "discard", seat: 1, tile: "2p", moqie: false, riichi: false },
      ],
    };

    expect(buildPlaybackState(playbackRound, 0, 1).hands[1]).toEqual(["1p", "2p", "3p", "4p"]);
    expect(buildPlaybackState(playbackRound, 0, 2).hands[1]).toEqual(["1p", "3p", "4p"]);
  });

  it("falls back between red five and regular five when removing a target discard", () => {
    const fallbackRound: Round = {
      ...round,
      initialHands: {
        ...round.initialHands,
        0: round.initialHands[0].filter((tile) => tile !== "5p"),
      },
    };
    const playback = buildPlaybackState(fallbackRound, 0, 5);

    expect(playback.discards[0]).toEqual(["5m", "5p"]);
    expect(playback.targetHand).not.toContain("0p");
    expect(playback.targetHand).not.toContain("5p");
    expect(playback.targetHand).toHaveLength(fallbackRound.initialHands[0].length);
  });

  it("groups calls by seat and preserves tiles, froms, and event indices", () => {
    const playback = buildPlaybackState(round, 0, 7);

    expect(playback.calls[2]).toEqual([
      { seat: 2, callType: "碰", tiles: ["9p", "9p", "9p"], froms: [1, 2, 2], eventIndex: 5 },
    ]);
    expect(playback.calls[0]).toEqual([{ seat: 0, callType: "暗杠", tiles: ["1z", "1z", "1z", "1z"], eventIndex: 6 }]);
    expect(playback.hands[2]).toEqual(["1s"]);
    expect(playback.hands[0]).not.toContain("1z");
  });

  it("removes the claimed discard from the source player's river after a call", () => {
    const playback = buildPlaybackState(round, 0, 6);

    expect(playback.discards[1]).toEqual([]);
    expect(playback.calls[2]).toEqual([
      { seat: 2, callType: "碰", tiles: ["9p", "9p", "9p"], froms: [1, 2, 2], eventIndex: 5 },
    ]);
  });

  it("keeps later riichi indexes aligned when a called discard is removed", () => {
    const callAfterRiichiRound: Round = {
      ...round,
      initialHands: {
        ...round.initialHands,
        2: ["2m", "3m"],
      },
      events: [
        { type: "discard", seat: 1, tile: "1m", moqie: false, riichi: true },
        { type: "discard", seat: 1, tile: "4m", moqie: false, riichi: false },
        { type: "call", seat: 2, callType: "吃", tiles: ["2m", "3m", "4m"], froms: [2, 2, 1] },
      ],
    };
    const playback = buildPlaybackState(callAfterRiichiRound, 0, 3);

    expect(playback.discards[1]).toEqual(["1m"]);
    expect(playback.riichiTiles[1]).toEqual([0]);
  });

  it("sets round result after agari", () => {
    const playback = buildPlaybackState(round, 0, 8);

    expect(playback.roundResult).toBe("荣和 断幺 8000");
    expect(playback.scores).toEqual({ 0: 17000, 1: 25000, 2: 33000, 3: 25000 });
  });

  it("updates visible dora indicators as kan/draw events reveal new indicators", () => {
    const doraRound: Round = {
      ...round,
      doraIndicators: ["4p"],
      events: [
        { type: "draw", seat: 0, tile: "5m", leftTileCount: 69 },
        { type: "kan", seat: 0, callType: "暗杠", tiles: ["1z", "1z", "1z", "1z"], doraIndicators: ["4p", "7s"] },
        { type: "draw", seat: 0, tile: "2m", leftTileCount: 68, doraIndicators: ["4p", "7s"] },
      ],
    };

    expect(buildPlaybackState(doraRound, 0, 0).doraIndicators).toEqual(["4p"]);
    expect(buildPlaybackState(doraRound, 0, 1).doraIndicators).toEqual(["4p"]);
    expect(buildPlaybackState(doraRound, 0, 2).doraIndicators).toEqual(["4p", "7s"]);
    expect(buildPlaybackState(doraRound, 0, 3).doraIndicators).toEqual(["4p", "7s"]);
  });

  it("infers extra dora indicators from paishan when kan records do not carry doras", () => {
    const tiles = Array.from({ length: 136 }, () => "1m");
    tiles[131] = "4p";
    tiles[129] = "7s";
    tiles[132] = "6z";
    const doraRound: Round = {
      ...round,
      doraIndicators: ["4p"],
      wall: { source: "paishan", tiles, rawLength: 272, complete: true },
      events: [
        { type: "draw", seat: 0, tile: "5m", leftTileCount: 69 },
        { type: "call", seat: 1, callType: "明杠", tiles: ["2p", "2p", "2p", "2p"], froms: [1, 1, 1, 0] },
      ],
    };

    expect(buildPlaybackState(doraRound, 0, 1).doraIndicators).toEqual(["4p"]);
    expect(buildPlaybackState(doraRound, 0, 2).doraIndicators).toEqual(["4p", "7s"]);
  });

  it("does not lose paishan-inferred dora indicators when later records carry fewer doras", () => {
    const tiles = Array.from({ length: 136 }, () => "1m");
    tiles[131] = "4p";
    tiles[129] = "7s";
    tiles[132] = "6z";
    const doraRound: Round = {
      ...round,
      doraIndicators: ["4p"],
      wall: { source: "paishan", tiles, rawLength: 272, complete: true },
      events: [
        { type: "call", seat: 1, callType: "明杠", tiles: ["2p", "2p", "2p", "2p"], froms: [1, 1, 1, 0] },
        { type: "draw", seat: 1, tile: "3m", leftTileCount: 68, doraIndicators: ["4p"] },
      ],
    };

    expect(buildPlaybackState(doraRound, 0, 1).doraIndicators).toEqual(["4p", "7s"]);
    expect(buildPlaybackState(doraRound, 0, 2).doraIndicators).toEqual(["4p", "7s"]);
  });

  it("skips ura and rinshan tiles when inferring kan dora from paishan", () => {
    const tiles = Array.from({ length: 136 }, () => "1m");
    tiles[131] = "3p";
    tiles[130] = "9p";
    tiles[129] = "8s";
    tiles[128] = "8s";
    tiles[132] = "0m";
    tiles[133] = "3m";
    tiles[134] = "6s";
    tiles[135] = "6z";
    const doraRound: Round = {
      ...round,
      doraIndicators: ["3p"],
      wall: { source: "paishan", tiles, rawLength: 272, complete: true },
      events: [{ type: "kan", seat: 1, callType: "明杠", tiles: ["2p", "2p", "2p", "2p"] }],
    };

    expect(buildPlaybackState(doraRound, 0, 1).doraIndicators).toEqual(["3p", "8s"]);
  });

  it("clamps cursor below zero and beyond the event count", () => {
    expect(buildPlaybackState(round, 0, -10).cursor).toBe(0);

    const playback = buildPlaybackState(round, 0, 99);

    expect(playback.cursor).toBe(round.events.length);
    expect(playback.visibleCount).toBe(round.events.length);
  });

  it("keeps target hand sorted through draw, discard, and call playback", () => {
    const playbackRound: Round = {
      ...round,
      initialHands: {
        ...round.initialHands,
        0: ["9s", "1z", "3m", "1m", "7z", "5p", "2m", "3z", "7z", "4p", "7z", "6s", "2p"],
      },
      events: [
        { type: "draw", seat: 0, tile: "8m", leftTileCount: 69 },
        { type: "discard", seat: 0, tile: "9s", moqie: false, riichi: false },
        { type: "call", seat: 0, callType: "碰", tiles: ["7z", "7z", "7z"], froms: [1, 0, 0] },
      ],
    };

    expect(buildPlaybackState(playbackRound, 0, 1).targetHand).toEqual([
      "1m",
      "2m",
      "3m",
      "2p",
      "4p",
      "5p",
      "6s",
      "9s",
      "1z",
      "3z",
      "7z",
      "7z",
      "7z",
      "8m",
    ]);

    expect(buildPlaybackState(playbackRound, 0, 2).targetHand).toEqual([
      "1m",
      "2m",
      "3m",
      "8m",
      "2p",
      "4p",
      "5p",
      "6s",
      "1z",
      "3z",
      "7z",
      "7z",
      "7z",
    ]);

    expect(buildPlaybackState(playbackRound, 0, 3).targetHand).toEqual([
      "1m",
      "2m",
      "3m",
      "8m",
      "2p",
      "4p",
      "5p",
      "6s",
      "1z",
      "3z",
      "7z",
    ]);
  });
});

describe("sortTilesForHand", () => {
  it("sorts mixed suits as m, p, s, z with numbers ascending", () => {
    expect(sortTilesForHand(["9s", "1p", "3m", "2s", "1m", "9p", "4z", "2m"])).toEqual([
      "1m",
      "2m",
      "3m",
      "1p",
      "9p",
      "2s",
      "9s",
      "4z",
    ]);
  });

  it("sorts honors from east through red dragon", () => {
    expect(sortTilesForHand(["7z", "5z", "2z", "1z", "6z", "4z", "3z"])).toEqual([
      "1z",
      "2z",
      "3z",
      "4z",
      "5z",
      "6z",
      "7z",
    ]);
  });

  it("keeps duplicates stable and red fives distinguishable next to regular fives", () => {
    expect(sortTilesForHand(["6p", "5m", "0m", "5m", "4m", "0p", "5p", "bad"])).toEqual([
      "4m",
      "5m",
      "0m",
      "5m",
      "0p",
      "5p",
      "6p",
      "bad",
    ]);
  });

  it("sorts only the hand body when the current drawn tile is separate", () => {
    expect(sortTilesForHand(["9s", "1m", "3p", "2m"], "2m")).toEqual(["1m", "3p", "9s", "2m"]);
  });
});
