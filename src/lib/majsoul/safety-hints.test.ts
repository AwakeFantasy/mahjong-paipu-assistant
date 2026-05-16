import { describe, expect, it } from "vitest";

import type { PlaybackState } from "./playback";
import { buildTileSafetyHint } from "./safety-hints";

describe("buildTileSafetyHint", () => {
  it("marks tiles discarded by an opponent riichi player as genbutsu", () => {
    const hint = buildTileSafetyHint({
      tile: "3m",
      playback: makePlayback({
        discards: {
          0: [],
          1: ["7p", "3m"],
          2: [],
          3: [],
        },
        riichiTiles: {
          0: [],
          1: [1],
          2: [],
          3: [],
        },
      }),
      targetHand: ["1m", "2m"],
      targetSeat: 0,
    });

    expect(hint?.tone).toBe("safe");
    expect(hint?.labels.some((label) => label.includes("现物"))).toBe(true);
  });

  it("counts visible tiles for wall hints", () => {
    const hint = buildTileSafetyHint({
      tile: "9s",
      playback: makePlayback({
        discards: {
          0: ["9s"],
          1: ["9s"],
          2: ["9s"],
          3: [],
        },
      }),
      targetHand: ["9s"],
      targetSeat: 0,
    });

    expect(hint?.labels).toContain("四枚可见");
  });
});

function makePlayback(overrides: Partial<PlaybackState>): PlaybackState {
  return {
    cursor: 0,
    maxCursor: 0,
    visibleCount: 0,
    discards: { 0: [], 1: [], 2: [], 3: [] },
    calls: { 0: [], 1: [], 2: [], 3: [] },
    hands: { 0: [], 1: [], 2: [], 3: [] },
    targetHand: [],
    doraIndicators: [],
    scores: { 0: 25000, 1: 25000, 2: 25000, 3: 25000 },
    riichiTiles: { 0: [], 1: [], 2: [], 3: [] },
    ...overrides,
  };
}
