import { describe, expect, it, vi } from "vitest";

import { normalizeMjsoulGame } from "./normalize";
import type { PaipuSource, RawMjsoulGame } from "./types";

const source: PaipuSource = {
  id: "240101-11111111-2222-4333-8444-555555555555",
  url: "https://game.maj-soul.com/1/?paipu=240101-11111111-2222-4333-8444-555555555555",
  region: "cn",
  targetSeat: 1,
};

const fixture: RawMjsoulGame = {
  head: {
    config: {
      mode: {
        detail_rule: {
          init_point: 25000,
        },
      },
    },
    accounts: [
      { seat: 0, nickname: "East", account_id: 100 },
      { seat: 1, nickname: "South", account_id: 101 },
      { seat: 2, nickname: "West", account_id: 102 },
      { seat: 3, nickname: "North", account_id: 103 },
    ],
    result: {
      players: [
        { seat: 0, total_point: 22000 },
        { seat: 1, total_point: 32000 },
        { seat: 2, total_point: 23000 },
        { seat: 3, total_point: 23000 },
      ],
    },
  },
  records: [
    {
      name: "RecordNewRound",
      data: {
        chang: 0,
        ju: 0,
        ben: 0,
        dora: "4p",
        doras: ["4p"],
        paishan: "1m2m3p4s1z",
        md5: "wall-md5",
        scores: [25000, 25000, 25000, 25000],
        liqibang: 0,
        tiles0: ["1m", "2m"],
        tiles1: ["3p", "4p"],
        tiles2: ["5s", "6s"],
        tiles3: ["E", "S"],
      },
    },
    { name: "RecordDealTile", data: { seat: 1, tile: "5p", left_tile_count: 69 } },
    { name: "RecordDiscardTile", data: { seat: 1, tile: "1m", moqie: false, is_liqi: true } },
    { name: "RecordAnGangAddGang", data: { seat: 1, type: 3, tiles: "5p", doras: ["4p", "7s"] } },
    { name: "RecordDealTile", data: { seat: 1, tile: "6p", left_tile_count: 68, doras: ["4p", "7s"] } },
    {
      name: "RecordHule",
      data: {
        delta_scores: [-3000, 9000, -3000, -3000],
        hules: [{ seat: 1, zimo: true, hu_tile: "5p", title: "立直自摸", point_sum: 9000 }],
      },
    },
  ],
};

describe("normalizeMjsoulGame", () => {
  it("normalizes players, rounds, events, and target analysis", () => {
    const result = normalizeMjsoulGame(source, fixture);

    expect(result.players[1]).toMatchObject({ name: "South", seat: 1, startScore: 25000, finalScore: 32000 });
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0]).toMatchObject({
      title: "东1局 0 本场",
      result: "南家 自摸 立直自摸 9000",
      scoreDelta: "+9,000",
      endScores: [22000, 34000, 22000, 22000],
      doraIndicators: ["4p"],
      wall: {
        source: "paishan",
        tiles: ["1m", "2m", "3p", "4s", "1z"],
        rawLength: 10,
        complete: true,
        md5: "wall-md5",
      },
    });
    expect(result.rounds[0].events.some((event) => event.type === "discard" && event.riichi)).toBe(true);
    expect(result.rounds[0].events).toContainEqual({
      type: "kan",
      seat: 1,
      callType: "暗杠",
      tiles: ["5p"],
      doraIndicators: ["4p", "7s"],
    });
    expect(result.rounds[0].events).toContainEqual({
      type: "draw",
      seat: 1,
      tile: "6p",
      leftTileCount: 68,
      doraIndicators: ["4p", "7s"],
    });
    expect(result.analysis.summary).toContain("共 1 局");
  });

  it("adds sanitized dora change and wall summaries to debug normalize data", () => {
    const debug = {
      setNormalize: vi.fn(),
    } as unknown as Parameters<typeof normalizeMjsoulGame>[3];

    normalizeMjsoulGame(source, fixture, undefined, debug);

    expect(debug.setNormalize).toHaveBeenCalledWith(
      expect.objectContaining({
        doraChanges: [
          {
            roundId: "0-0-0",
            roundTitle: "东1局 0 本场",
            eventIndex: 0,
            record: "RecordNewRound",
            source: "record",
            doraIndicators: ["4p"],
          },
          {
            roundId: "0-0-0",
            roundTitle: "东1局 0 本场",
            eventIndex: 3,
            record: "RecordAnGangAddGang",
            source: "record",
            doraIndicators: ["4p", "7s"],
          },
        ],
        walls: [
          {
            roundId: "0-0-0",
            roundTitle: "东1局 0 本场",
            source: "paishan",
            rawLength: 10,
            tileCount: 5,
            complete: true,
            hasMd5: true,
          },
        ],
      }),
    );
  });

  it("summarizes paishan-inferred dora changes for kan records without doras", () => {
    const paishanTiles = Array.from({ length: 136 }, () => "1m");
    paishanTiles[131] = "4p";
    paishanTiles[129] = "7s";
    paishanTiles[132] = "6z";
    const debug = {
      setNormalize: vi.fn(),
    } as unknown as Parameters<typeof normalizeMjsoulGame>[3];
    const gameWithoutRecordDoras: RawMjsoulGame = {
      ...fixture,
      records: [
        {
          name: "RecordNewRound",
          data: {
            ...(fixture.records[0]?.data ?? {}),
            dora: "4p",
            doras: ["4p"],
            paishan: paishanTiles.join(""),
          },
        },
        { name: "RecordChiPengGang", data: { seat: 2, type: 2, tiles: ["2p", "2p", "2p", "2p"], froms: [2, 2, 2, 1] } },
        { name: "RecordNoTile", data: { players: [{ tingpai: true }], scores: [{ delta_scores: [0, 0, 0, 0] }] } },
      ],
    };

    normalizeMjsoulGame(source, gameWithoutRecordDoras, undefined, debug);

    expect(debug.setNormalize).toHaveBeenCalledWith(
      expect.objectContaining({
        doraChanges: [
          {
            roundId: "0-0-0",
            roundTitle: "东1局 0 本场",
            eventIndex: 0,
            record: "RecordNewRound",
            source: "record",
            doraIndicators: ["4p"],
          },
          {
            roundId: "0-0-0",
            roundTitle: "东1局 0 本场",
            eventIndex: 1,
            record: "paishan",
            source: "paishan",
            doraIndicators: ["4p", "7s"],
          },
        ],
      }),
    );
  });

  it("does not summarize a dora regression when later records carry fewer doras", () => {
    const paishanTiles = Array.from({ length: 136 }, () => "1m");
    paishanTiles[131] = "4p";
    paishanTiles[129] = "7s";
    paishanTiles[132] = "6z";
    const debug = {
      setNormalize: vi.fn(),
    } as unknown as Parameters<typeof normalizeMjsoulGame>[3];
    const gameWithShortLaterDoras: RawMjsoulGame = {
      ...fixture,
      records: [
        {
          name: "RecordNewRound",
          data: {
            ...(fixture.records[0]?.data ?? {}),
            dora: "4p",
            doras: ["4p"],
            paishan: paishanTiles.join(""),
          },
        },
        { name: "RecordChiPengGang", data: { seat: 2, type: 2, tiles: ["2p", "2p", "2p", "2p"], froms: [2, 2, 2, 1] } },
        { name: "RecordDealTile", data: { seat: 2, tile: "3m", left_tile_count: 68, doras: ["4p"] } },
        { name: "RecordNoTile", data: { players: [{ tingpai: true }], scores: [{ delta_scores: [0, 0, 0, 0] }] } },
      ],
    };

    normalizeMjsoulGame(source, gameWithShortLaterDoras, undefined, debug);

    expect(debug.setNormalize).toHaveBeenCalledWith(
      expect.objectContaining({
        doraChanges: [
          expect.objectContaining({ eventIndex: 0, doraIndicators: ["4p"] }),
          expect.objectContaining({ eventIndex: 1, record: "paishan", doraIndicators: ["4p", "7s"] }),
        ],
      }),
    );
  });

  it("rejects three-player logs", () => {
    const threePlayer = {
      ...fixture,
      head: {
        ...fixture.head,
        accounts: fixture.head?.accounts?.slice(0, 3),
      },
    };

    expect(() => normalizeMjsoulGame(source, threePlayer)).toThrow("四麻");
  });

  it("prefers terminal direct scores over recomputed deltas", () => {
    const directScoreGame: RawMjsoulGame = {
      ...fixture,
      records: [
        fixture.records[0],
        {
          name: "RecordHule",
          data: {
            scores: [18000, 35000, 24000, 23000],
            delta_scores: [-1000, 1000, 0, 0],
            hules: [{ seat: 1, zimo: false, hu_tile: "5p", title: "荣和", point_sum: 1000 }],
          },
        },
      ],
    };

    const result = normalizeMjsoulGame(source, directScoreGame);

    expect(result.rounds[0].endScores).toEqual([18000, 35000, 24000, 23000]);
    expect(result.rounds[0].scoreDelta).toBe("+1,000");
  });

  it("keeps reading later rounds when a negative score is not marked gameend", () => {
    const bustOutGame: RawMjsoulGame = {
      ...fixture,
      records: [
        {
          name: "RecordNewRound",
          data: {
            ...(fixture.records[0]?.data ?? {}),
            scores: [1000, 25000, 37000, 37000],
          },
        },
        {
          name: "RecordHule",
          data: {
            scores: [-1000, 27000, 37000, 37000],
            hules: [{ seat: 1, zimo: false, hu_tile: "5p", title: "荣和", point_sum: 2000 }],
          },
        },
        {
          name: "RecordNewRound",
          data: {
            ...(fixture.records[0]?.data ?? {}),
            chang: 0,
            ju: 1,
            scores: [25000, 25000, 25000, 25000],
          },
        },
        { name: "RecordNoTile", data: { players: [{ tingpai: true }], scores: [{ delta_scores: [0, 0, 0, 0] }] } },
      ],
    };

    const result = normalizeMjsoulGame(source, bustOutGame);

    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].endScores).toEqual([-1000, 27000, 37000, 37000]);
  });

  it("keeps reading later rounds when records continue after gameend", () => {
    const gameEndGame: RawMjsoulGame = {
      ...fixture,
      records: [
        {
          name: "RecordNewRound",
          data: {
            ...(fixture.records[0]?.data ?? {}),
            scores: [1000, 25000, 37000, 37000],
          },
        },
        {
          name: "RecordHule",
          data: {
            gameend: { scores: [-1000, 27000, 37000, 37000] },
            scores: [-1000, 27000, 37000, 37000],
            hules: [{ seat: 1, zimo: false, hu_tile: "5p", title: "荣和", point_sum: 2000 }],
          },
        },
        {
          name: "RecordNewRound",
          data: {
            ...(fixture.records[0]?.data ?? {}),
            chang: 0,
            ju: 1,
            scores: [25000, 25000, 25000, 25000],
          },
        },
        { name: "RecordNoTile", data: { players: [{ tingpai: true }], scores: [{ delta_scores: [0, 0, 0, 0] }] } },
      ],
    };

    const result = normalizeMjsoulGame(source, gameEndGame);

    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].endScores).toEqual([-1000, 27000, 37000, 37000]);
  });

  it("keeps reading later rounds when gameend is a false-like encoded value", () => {
    const encodedFalseGameEndGame: RawMjsoulGame = {
      ...fixture,
      records: [
        {
          name: "RecordNewRound",
          data: {
            ...(fixture.records[0]?.data ?? {}),
            scores: [25000, 25000, 25000, 25000],
          },
        },
        {
          name: "RecordHule",
          data: {
            gameend: "false",
            scores: [24000, 26000, 25000, 25000],
            hules: [{ seat: 1, zimo: false, hu_tile: "5p", title: "荣和", point_sum: 1000 }],
          },
        },
        {
          name: "RecordNewRound",
          data: {
            ...(fixture.records[0]?.data ?? {}),
            chang: 0,
            ju: 1,
            scores: [24000, 26000, 25000, 25000],
          },
        },
        { name: "RecordNoTile", data: { gameend: "0", players: [{ tingpai: true }], scores: [{ delta_scores: [0, 0, 0, 0] }] } },
      ],
    };

    const result = normalizeMjsoulGame(source, encodedFalseGameEndGame);

    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].title).toBe("东1局 0 本场");
    expect(result.rounds[1].title).toBe("东2局 0 本场");
  });

  it("splits action-based v2 records into multiple rounds", () => {
    const actionGame: RawMjsoulGame = {
      ...fixture,
      records: [
        {
          name: "ActionNewRound",
          data: {
            chang: 0,
            ju: 0,
            ben: 0,
            dora: "4p",
            scores: [25000, 25000, 25000, 25000],
            tiles: ["1m", "2m", "3m"],
          },
        },
        {
          name: "ActionHule",
          data: {
            scores: [24000, 26000, 25000, 25000],
            hules: [{ seat: 1, zimo: false, hu_tile: "1m", title: "荣和", point_sum: 1000 }],
          },
        },
        {
          name: "ActionNewRound",
          data: {
            chang: 0,
            ju: 1,
            ben: 0,
            dora: "8s",
            scores: [24000, 26000, 25000, 25000],
            tiles: ["4m", "5m", "6m"],
          },
        },
        { name: "ActionNoTile", data: { gameend: false, players: [{ tingpai: true }], scores: [{ delta_scores: [0, 0, 0, 0] }] } },
      ],
    };

    const result = normalizeMjsoulGame(source, actionGame);

    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].result).toBe("南家 荣和 荣和 1000");
    expect(result.rounds[0].initialHands[source.targetSeat ?? 0]).toEqual(["1m", "2m", "3m"]);
    expect(result.rounds[1].title).toBe("东2局 0 本场");
  });
});
