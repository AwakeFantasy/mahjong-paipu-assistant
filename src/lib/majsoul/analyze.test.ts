import { describe, expect, it } from "vitest";

import { analyzePaipu } from "./analyze";
import { AnalyzeError, type RawMjsoulGame } from "./types";

const game: RawMjsoulGame = {
  head: {
    config: { mode: { detail_rule: { init_point: 25000 } } },
    accounts: [
      { seat: 0, nickname: "A" },
      { seat: 1, nickname: "B" },
      { seat: 2, nickname: "C" },
      { seat: 3, nickname: "D" },
    ],
  },
  records: [
    {
      name: "RecordNewRound",
      data: {
        chang: 0,
        ju: 0,
        ben: 0,
        dora: "1m",
        scores: [25000, 25000, 25000, 25000],
        tiles0: ["1m"],
        tiles1: ["2m"],
        tiles2: ["3m"],
        tiles3: ["4m"],
      },
    },
    { name: "RecordNoTile", data: { players: [{ tingpai: true }], scores: [{ delta_scores: [1000, 1000, -1000, -1000] }] } },
  ],
};

describe("analyzePaipu", () => {
  it("uses an injected fetcher for API-level success", async () => {
    const result = await analyzePaipu(
      { url: "https://game.maj-soul.com/1/?paipu=240101-11111111-2222-4333-8444-555555555555", targetSeat: 0 },
      { fetchGame: async () => game },
    );

    expect(result.source.id).toBe("240101-11111111-2222-4333-8444-555555555555");
    expect(result.selectedRound?.result).toBe("流局 1 人听牌");
  });

  it("keeps tenhou sources on the shared analysis path", async () => {
    const result = await analyzePaipu(
      { url: "https://tenhou.net/0/?log=2016031919gm-0009-0000-490705b1", targetSeat: 0 },
      { fetchGame: async () => game },
    );

    expect(result.source).toMatchObject({
      id: "2016031919gm-0009-0000-490705b1",
      region: "tenhou",
      provider: "tenhou",
    });
    expect(result.rounds).toHaveLength(1);
  });

  it("keeps riichi city sources on the shared analysis path", async () => {
    const result = await analyzePaipu(
      { url: "ch35u1e9nc70954ah9n0@2" },
      { fetchGame: async () => game },
    );

    expect(result.source).toMatchObject({
      id: "ch35u1e9nc70954ah9n0",
      region: "riichi-city",
      provider: "riichi-city",
      targetSeat: 2,
    });
    expect(result.rounds).toHaveLength(1);
  });

  it("returns sanitized debug data when requested", async () => {
    const result = await analyzePaipu(
      {
        url: "https://game.maj-soul.com/1/?paipu=240101-11111111-2222-4333-8444-555555555555",
        targetSeat: 0,
        debug: true,
      },
      { fetchGame: async () => game },
    );
    const serialized = JSON.stringify(result.debug);

    expect(result.debug?.recordsTotal).toBe(2);
    expect(result.debug?.players).toEqual([
      { seat: 0, nickname: "A" },
      { seat: 1, nickname: "B" },
      { seat: 2, nickname: "C" },
      { seat: 3, nickname: "D" },
    ]);
    expect(serialized).not.toContain("account_id");
    expect(serialized).not.toContain("tiles0");
  });

  it("passes fetcher errors through for route error mapping", async () => {
    await expect(() =>
      analyzePaipu(
        { url: "https://game.maj-soul.com/1/?paipu=240101-11111111-2222-4333-8444-555555555555" },
        { fetchGame: async () => Promise.reject(new AnalyzeError("CONFIG_MISSING", "missing", 500)) },
      ),
    ).rejects.toMatchObject({ code: "CONFIG_MISSING", status: 500 });
  });
});
