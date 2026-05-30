import { describe, expect, it } from "vitest";

import { normalizeMjsoulGame } from "./normalize";
import { parseTenhouJsonGame } from "./tenhou-json";
import type { PaipuSource } from "./types";

const source: PaipuSource = {
  id: "ch35u1e9nc70954ah9n0",
  url: "ch35u1e9nc70954ah9n0",
  region: "riichi-city",
  provider: "riichi-city",
  targetSeat: 0,
};

const payload = {
  name: ["A", "B", "C", "D"],
  rule: { aka: 1, disp: "4-Player South" },
  log: [
    [
      [0, 0, 0],
      [25000, 25000, 25000, 25000],
      [41],
      [],
      [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24],
      [25],
      ["r25"],
      [21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 34],
      [35],
      [60],
      [31, 32, 33, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44],
      ["4646p46"],
      [47],
      [41, 42, 43, 44, 45, 46, 47, 11, 12, 13, 14, 15, 16],
      [17],
      [17],
      ["和了", [1000, -1000, 0, 0], [0, 1, 1, "1000点", "立直(1飜)"]],
    ],
  ],
};

describe("parseTenhouJsonGame", () => {
  it("converts tenhou.net/6 json into the shared raw game shape", () => {
    const game = parseTenhouJsonGame(source, payload);

    expect(game.head?.accounts).toEqual([
      { seat: 0, nickname: "A" },
      { seat: 1, nickname: "B" },
      { seat: 2, nickname: "C" },
      { seat: 3, nickname: "D" },
    ]);
    expect(game.records.map((record) => record.name)).toContain("RecordChiPengGang");
    expect(game.records.map((record) => record.name)).toContain("RecordHule");
  });

  it("reuses the existing normalize/playback contract", () => {
    const result = normalizeMjsoulGame(source, parseTenhouJsonGame(source, payload));

    expect(result.players.map((player) => player.name)).toEqual(["A", "B", "C", "D"]);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].doraIndicators).toEqual(["1z"]);
    expect(result.rounds[0].events.some((event) => event.type === "discard" && event.riichi)).toBe(true);
    expect(result.rounds[0].events.some((event) => event.type === "call")).toBe(true);
    expect(result.rounds[0].events.some((event) => event.type === "agari")).toBe(true);
  });
});
