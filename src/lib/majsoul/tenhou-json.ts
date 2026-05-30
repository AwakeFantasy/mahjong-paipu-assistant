import { AnalyzeError, type PaipuSource, type RawMjsoulGame, type RawMjsoulRecord } from "./types";

export type TenhouJsonLog = {
  log?: unknown;
  name?: unknown;
  rule?: unknown;
  title?: unknown;
};

type ConvertState = {
  names: string[];
  currentScores?: number[];
  finalScores?: number[];
};

type SeatRoundData = {
  initial: string[];
  draws: unknown[];
  discards: unknown[];
  drawIndex: number;
  discardIndex: number;
  lastDrawn?: string;
  lastDiscard?: string;
};

export function parseTenhouJsonGame(source: PaipuSource, payload: unknown): RawMjsoulGame {
  if (!isRecord(payload) || !Array.isArray(payload.log)) {
    throw new AnalyzeError("PARSE_FAILED", "tenhou.net/6 JSON 中没有可读取的 log 数据。", 502);
  }

  const state: ConvertState = {
    names: readNames(payload.name),
  };
  const records = payload.log.flatMap((round, index) => convertRound(source, round, index, state));
  const finalScores = state.finalScores ?? state.currentScores ?? [];

  return {
    head: {
      config: {
        mode: {
          mode: 1,
          detail_rule: {
            init_point: 25000,
          },
        },
      },
      accounts: state.names.map((name, seat) => ({ seat, nickname: name || `P${seat + 1}` })),
      result: {
        players: finalScores.map((score, seat) => ({ seat, total_point: score })),
      },
    },
    records,
  };
}

function convertRound(source: PaipuSource, value: unknown, index: number, state: ConvertState): RawMjsoulRecord[] {
  if (!Array.isArray(value) || value.length < 17) {
    throw new AnalyzeError("PARSE_FAILED", `tenhou.net/6 JSON 第 ${index + 1} 局格式不完整。`, 502);
  }

  const roundInfo = readNumberArray(value[0]);
  const scores = readNumberArray(value[1]);
  const doraIndicators = readNumberArray(value[2]).map(tenhouJsonTileToLocal);
  const roundIndex = roundInfo[0] ?? index;
  const honba = roundInfo[1] ?? 0;
  const riichiSticks = roundInfo[2] ?? 0;
  const seats = [0, 1, 2, 3].map((seat) => readSeatRoundData(value, seat));
  const records: RawMjsoulRecord[] = [
    {
      name: "RecordNewRound",
      data: {
        chang: Math.floor(roundIndex / 4),
        ju: roundIndex % 4,
        ben: honba,
        liqibang: riichiSticks,
        dora: doraIndicators[0] ?? "",
        doras: doraIndicators,
        scores,
        tiles0: seats[0].initial,
        tiles1: seats[1].initial,
        tiles2: seats[2].initial,
        tiles3: seats[3].initial,
      },
    },
  ];

  state.currentScores = scores;
  appendRoundEvents(records, seats, roundIndex % 4);
  appendRoundResult(records, value[16], seats, state);

  void source;
  return records;
}

function readSeatRoundData(round: unknown[], seat: number): SeatRoundData {
  const base = 4 + seat * 3;

  return {
    initial: readNumberArray(round[base]).map(tenhouJsonTileToLocal),
    draws: Array.isArray(round[base + 1]) ? (round[base + 1] as unknown[]) : [],
    discards: Array.isArray(round[base + 2]) ? (round[base + 2] as unknown[]) : [],
    drawIndex: 0,
    discardIndex: 0,
  };
}

function appendRoundEvents(records: RawMjsoulRecord[], seats: SeatRoundData[], dealer: number) {
  let seat = dealer;
  let guard = 0;

  while (guard < 1000 && hasRemainingTurnData(seats)) {
    guard += 1;
    const data = seats[seat];
    const draw = data.draws[data.drawIndex++];

    if (draw !== undefined) {
      appendDrawOrCall(records, data, seat, draw);
    }

    const discard = data.discards[data.discardIndex++];
    if (discard !== undefined) {
      appendDiscard(records, data, seat, discard);
    }

    seat = (seat + 1) % 4;
  }

  if (guard >= 1000) {
    throw new AnalyzeError("PARSE_FAILED", "tenhou.net/6 JSON 事件顺序解析超出安全上限。", 502);
  }
}

function appendDrawOrCall(records: RawMjsoulRecord[], data: SeatRoundData, seat: number, value: unknown) {
  if (typeof value === "string") {
    records.push(parseMeldString(value, seat));
    data.lastDrawn = undefined;
    return;
  }

  const tile = tenhouJsonTileToLocal(Number(value));
  data.lastDrawn = tile;
  records.push({
    name: "RecordDealTile",
    data: { seat, tile },
  });
}

function appendDiscard(records: RawMjsoulRecord[], data: SeatRoundData, seat: number, value: unknown) {
  const parsed = parseDiscardValue(value, data.lastDrawn);

  if (!parsed.tile) {
    return;
  }

  records.push({
    name: "RecordDiscardTile",
    data: {
      seat,
      tile: parsed.tile,
      moqie: parsed.moqie,
      is_liqi: parsed.riichi,
    },
  });

  data.lastDiscard = parsed.tile;
  data.lastDrawn = undefined;
}

function parseDiscardValue(value: unknown, lastDrawn: string | undefined) {
  if (typeof value === "string" && value.startsWith("r")) {
    return { tile: tenhouJsonTileToLocal(Number(value.slice(1))), moqie: false, riichi: true };
  }

  const number = Number(value);

  if (number === 60) {
    return { tile: lastDrawn ?? "", moqie: true, riichi: false };
  }

  return { tile: tenhouJsonTileToLocal(number), moqie: false, riichi: false };
}

function parseMeldString(value: string, seat: number): RawMjsoulRecord {
  const markerIndex = value.search(/[cpmk]/i);

  if (markerIndex < 0) {
    throw new AnalyzeError("PARSE_FAILED", `无法识别 tenhou.net/6 副露 ${value}。`, 502);
  }

  const marker = value[markerIndex].toLowerCase();
  const tiles = splitMeldTiles(value.slice(0, markerIndex) + value.slice(markerIndex + 1)).map(tenhouJsonTileToLocal);
  const froms = tiles.map((_, index) => (index === tiles.length - 1 ? (seat + 3) % 4 : seat));

  if (marker === "k") {
    return { name: "RecordAnGangAddGang", data: { seat, type: 2, tiles: tiles[0] ?? "" } };
  }

  if (marker === "m") {
    return { name: "RecordAnGangAddGang", data: { seat, type: 0, tiles: tiles[0] ?? "" } };
  }

  return {
    name: "RecordChiPengGang",
    data: {
      seat,
      type: marker === "c" ? 0 : 1,
      tiles,
      froms,
    },
  };
}

function splitMeldTiles(value: string) {
  const matches = value.match(/\d{2}/g) ?? [];

  if (!matches.length) {
    throw new AnalyzeError("PARSE_FAILED", `无法识别 tenhou.net/6 副露牌 ${value}。`, 502);
  }

  return matches.map(Number);
}

function appendRoundResult(records: RawMjsoulRecord[], value: unknown, seats: SeatRoundData[], state: ConvertState) {
  if (!Array.isArray(value) || typeof value[0] !== "string") {
    return;
  }

  const label = value[0];
  const deltaScores = readNumberArray(value[1]);
  const endScores = state.currentScores?.map((score, seat) => score + (deltaScores[seat] ?? 0)) ?? [];

  if (endScores.length) {
    state.currentScores = endScores;
    state.finalScores = endScores;
  }

  if (label === "和了") {
    const huleInfo = Array.isArray(value[2]) ? value[2] : [];
    const winner = readSeat(huleInfo[0]);
    const from = readSeat(huleInfo[1]);
    const title = huleInfo.find((item) => typeof item === "string" && item.includes("点"));

    records.push({
      name: "RecordHule",
      data: {
        scores: endScores,
        delta_scores: deltaScores,
        hules: [
          {
            seat: winner,
            zimo: winner === from,
            hu_tile: findWinningTile(seats, winner, from),
            title: typeof title === "string" ? title : "和了",
            point_sum: parsePoint(title),
          },
        ],
      },
    });
    return;
  }

  records.push({
    name: "RecordNoTile",
    data: {
      players: [0, 1, 2, 3].map((seat) => ({ tingpai: (deltaScores[seat] ?? 0) > 0 })),
      scores: [{ scores: endScores, delta_scores: deltaScores }],
    },
  });
}

function findWinningTile(seats: SeatRoundData[], winner: number, from: number) {
  if (winner === from) {
    return seats[winner]?.lastDrawn ?? "";
  }

  return seats[from]?.lastDiscard ?? "";
}

function readNames(value: unknown) {
  const names = Array.isArray(value) ? value.map(String) : [];
  return [0, 1, 2, 3].map((seat) => names[seat] ?? `P${seat + 1}`);
}

function readNumberArray(value: unknown) {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

function readSeat(value: unknown): 0 | 1 | 2 | 3 {
  const seat = Number(value);
  return seat === 0 || seat === 1 || seat === 2 || seat === 3 ? seat : 0;
}

function hasRemainingTurnData(seats: SeatRoundData[]) {
  return seats.some((seat) => seat.drawIndex < seat.draws.length || seat.discardIndex < seat.discards.length);
}

function tenhouJsonTileToLocal(value: number) {
  if (!Number.isFinite(value)) {
    return "";
  }

  if (value >= 11 && value <= 19) return `${value - 10}m`;
  if (value >= 21 && value <= 29) return `${value - 20}p`;
  if (value >= 31 && value <= 39) return `${value - 30}s`;
  if (value >= 41 && value <= 47) return `${value - 40}z`;
  if (value === 51) return "0m";
  if (value === 52) return "0p";
  if (value === 53) return "0s";

  throw new AnalyzeError("PARSE_FAILED", `无法识别 tenhou.net/6 牌编号 ${value}。`, 502);
}

function parsePoint(value: unknown) {
  if (typeof value !== "string") {
    return 0;
  }

  const matches = value.match(/\d+/g);
  return matches?.length ? Number(matches.at(-1)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
