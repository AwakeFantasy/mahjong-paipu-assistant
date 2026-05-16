import {
  AnalyzeError,
  type Analysis,
  type AnalyzeSuccess,
  type PaipuSource,
  type Player,
  type RawMjsoulGame,
  type RawMjsoulRecord,
  type Round,
} from "./types";
import type { DebugCollector } from "./debug";
import { doraIndicatorsForKanCount, isKanEvent, keepMostVisibleDoraIndicators } from "./dora";

const WINDS = ["E", "S", "W", "N"] as const;
const WIND_NAMES = ["东家", "南家", "西家", "北家"] as const;
const ROUND_WINDS = ["东", "南", "西", "北"] as const;
const UNSUPPORTED_RULE_FLAGS = [
  "guyi_mode",
  "dora3_mode",
  "begin_open_mode",
  "jiuchao_mode",
  "muyu_mode",
  "open_hand",
  "xuezhandaodi",
  "huansanzhang",
  "chuanma",
];

type RawHead = Record<string, unknown>;
type MutableRound = Round & {
  terminalDeltaScores?: number[];
};

export function normalizeMjsoulGame(
  source: PaipuSource,
  game: RawMjsoulGame,
  requestedRoundId?: string,
  debug?: DebugCollector,
): AnalyzeSuccess {
  const targetSeat = source.targetSeat ?? 0;
  const accounts = readAccounts(game.head);

  assertSupportedGame(game.head, accounts, debug);

  const rounds = buildRounds(game.records, targetSeat);
  const players = buildPlayers(game.head, accounts, rounds);
  const selectedRound = rounds.find((round) => round.id === requestedRoundId) ?? rounds[0] ?? null;
  const analysis = buildAnalysis(source, players, rounds, targetSeat);
  debug?.setNormalize({
    rounds: rounds.length,
    eventCount: rounds.reduce((sum, round) => sum + round.events.length, 0),
    doraChanges: summarizeDoraChanges(rounds),
    walls: summarizeWalls(rounds),
  });

  return {
    source,
    players,
    rounds,
    selectedRound,
    targetSeat,
    analysis,
  };
}

function assertSupportedGame(
  head: RawHead | undefined,
  accounts: Array<Record<string, unknown>>,
  debug?: DebugCollector,
) {
  if (accounts.length !== 4) {
    debug?.setNormalize({ rounds: 0, eventCount: 0, unsupportedReason: "not-four-player" });
    throw new AnalyzeError("UNSUPPORTED_GAME", "v1 暂时只支持四麻牌谱。", 422);
  }

  const detailRule = readDetailRule(head);
  const unsupportedFlag = UNSUPPORTED_RULE_FLAGS.find((flag) => Number(detailRule[flag] ?? 0) > 0);

  if (unsupportedFlag) {
    debug?.setNormalize({ rounds: 0, eventCount: 0, unsupportedReason: unsupportedFlag });
    throw new AnalyzeError("UNSUPPORTED_GAME", "v1 暂时只支持普通规则牌谱，特殊规则牌谱暂不支持。", 422);
  }
}

function buildPlayers(head: RawHead | undefined, accounts: Array<Record<string, unknown>>, rounds: Round[]): Player[] {
  const firstRoundScores = rounds[0]?.startScores ?? [];
  const finalScores = readFinalScores(head);
  const initPoint = Number(readDetailRule(head).init_point ?? 25000);

  return [0, 1, 2, 3].map((seat) => {
    const account = accounts.find((item) => Number(item.seat) === seat) ?? {};
    const startScore = firstRoundScores[seat] ?? initPoint;
    const finalScore = finalScores[seat];

    return {
      seat: seat as 0 | 1 | 2 | 3,
      wind: WINDS[seat],
      name: String(account.nickname ?? WIND_NAMES[seat]),
      accountId: readOptionalNumber(account.account_id),
      rank: formatRank(account.level),
      startScore,
      finalScore,
      score: formatScore(finalScore ?? startScore),
      style: "对局玩家",
    };
  });
}

function buildRounds(records: RawMjsoulRecord[], targetSeat: number): Round[] {
  const rounds: MutableRound[] = [];
  let current: MutableRound | null = null;

  for (const record of records) {
    if (isRecordName(record.name, "NewRound")) {
      if (current) {
        finalizeOpenRound(current, targetSeat);
        rounds.push(current);
      }

      current = createRound(record.data, targetSeat);
      continue;
    }

    if (!current) {
      continue;
    }

    appendRecord(current, record, targetSeat);

    if (isTerminalRecord(record.name)) {
      finalizeOpenRound(current, targetSeat);
      rounds.push(current);
      current = null;
    }
  }

  if (current) {
    finalizeOpenRound(current, targetSeat);
    rounds.push(current);
  }

  if (rounds.length === 0) {
    throw new AnalyzeError("PARSE_FAILED", "牌谱中没有可读取的局数据。", 502);
  }

  return rounds;
}

function createRound(data: Record<string, unknown>, targetSeat: number): MutableRound {
  const windRound = Number(data.chang ?? 0);
  const roundNumber = Number(data.ju ?? 0);
  const honba = Number(data.ben ?? 0);
  const safeTargetSeat = toSeatIndex(targetSeat);
  const title = `${ROUND_WINDS[windRound] ?? "?"}${roundNumber + 1}局 ${honba} 本场`;
  const scores = readNumberArray(data.scores);
  const doraIndicators = readStringArray(data.doras).length ? readStringArray(data.doras) : [String(data.dora ?? "")].filter(Boolean);
  const actionTiles = readStringArray(data.tiles);
  const initialHands = {
    0: readStringArray(data.tiles0),
    1: readStringArray(data.tiles1),
    2: readStringArray(data.tiles2),
    3: readStringArray(data.tiles3),
  };

  if (actionTiles.length && !initialHands[safeTargetSeat].length) {
    initialHands[safeTargetSeat] = actionTiles;
  }
  const wall = parseRoundWall(data.paishan, data.md5);

  return {
    id: `${windRound}-${roundNumber}-${honba}`,
    title,
    windRound,
    roundNumber,
    honba,
    riichiSticks: Number(data.liqibang ?? 0),
    dealer: WIND_NAMES[roundNumber] ?? "东家",
    result: "进行记录",
    scoreDelta: "0",
    focus: `起始点数 ${formatScore(scores[targetSeat] ?? 0)}，宝牌指示 ${String(data.dora ?? readStringArray(data.doras)[0] ?? "-")}。`,
    danger: "low",
    startScores: scores,
    endScores: scores,
    doraIndicators,
    initialHands,
    discards: { 0: [], 1: [], 2: [], 3: [] },
    calls: [],
    events: [{ type: "new-round", seat: roundNumber, label: title }],
    ...(wall ? { wall } : {}),
  };
}

function appendRecord(round: MutableRound, record: RawMjsoulRecord, targetSeat: number) {
  const data = record.data;

  if (isRecordName(record.name, "DealTile")) {
    const doraIndicators = readStringArray(data.doras);
    round.events.push({
      type: "draw",
      seat: Number(data.seat ?? 0),
      tile: String(data.tile ?? ""),
      leftTileCount: readOptionalNumber(data.left_tile_count),
      ...(doraIndicators.length ? { doraIndicators } : {}),
    });
    return;
  }

  if (isRecordName(record.name, "DiscardTile")) {
    const seat = Number(data.seat ?? 0);
    const tile = String(data.tile ?? "");
    round.discards[seat] = [...(round.discards[seat] ?? []), tile];
    round.events.push({
      type: "discard",
      seat,
      tile,
      moqie: Boolean(data.moqie),
      riichi: Boolean(data.is_liqi || data.is_wliqi),
    });
    return;
  }

  if (isRecordName(record.name, "ChiPengGang")) {
    const seat = Number(data.seat ?? 0);
    const callType = formatCallType(Number(data.type ?? 0));
    const tiles = readStringArray(data.tiles);
    const froms = readNumberArray(data.froms);
    round.calls.push(`${WIND_NAMES[seat] ?? seat} ${callType} ${tiles.join(" ")}`);
    round.events.push({ type: "call", seat, callType, tiles, froms });
    return;
  }

  if (isRecordName(record.name, "AnGangAddGang")) {
    const seat = Number(data.seat ?? 0);
    const callType = formatKanType(Number(data.type ?? 0));
    const tiles = [String(data.tiles ?? "")].filter(Boolean);
    const doraIndicators = readStringArray(data.doras);
    round.calls.push(`${WIND_NAMES[seat] ?? seat} ${callType} ${tiles.join(" ")}`);
    round.events.push({ type: "kan", seat, callType, tiles, ...(doraIndicators.length ? { doraIndicators } : {}) });
    return;
  }

  if (isRecordName(record.name, "Hule")) {
    const hules = Array.isArray(data.hules) ? data.hules.filter(isRecord) : [];
    round.endScores = readTerminalScores(data, round.startScores);
    round.terminalDeltaScores = readTerminalDeltaScores(data, round.startScores, round.endScores);
    round.result = hules.length
      ? hules.map((hule) => formatHule(hule)).join(" / ")
      : "和了";
    round.events.push(
      ...hules.map((hule) => ({
        type: "agari" as const,
        seat: Number(hule.seat ?? 0),
        zimo: Boolean(hule.zimo),
        tile: String(hule.hu_tile ?? ""),
        title: String(hule.title ?? "和了"),
        point: Number(hule.point_sum ?? hule.dadian ?? 0),
      })),
    );
    return;
  }

  if (isRecordName(record.name, "NoTile")) {
    const scoreInfo = readNoTileScoreInfo(data);
    round.endScores = readTerminalScores(scoreInfo ?? data, round.startScores);
    round.terminalDeltaScores = readTerminalDeltaScores(scoreInfo ?? data, round.startScores, round.endScores);
    const players = Array.isArray(data.players) ? data.players.filter(isRecord) : [];
    const tenpaiCount = players.filter((player) => Boolean(player.tingpai)).length;
    round.result = `流局 ${tenpaiCount} 人听牌`;
    round.events.push({ type: "ryukyoku", label: round.result });
    return;
  }

  if (isRecordName(record.name, "LiuJu")) {
    round.endScores = readTerminalScores(data, round.startScores);
    round.terminalDeltaScores = readTerminalDeltaScores(data, round.startScores, round.endScores);
    round.result = formatAbortiveDraw(Number(data.type ?? 0));
    round.events.push({ type: "ryukyoku", label: round.result });
  }

  void targetSeat;
}

function finalizeOpenRound(round: MutableRound, targetSeat: number) {
  const targetDelta = round.terminalDeltaScores?.[targetSeat] ?? 0;
  const riichiCount = round.events.filter((event) => event.type === "discard" && event.riichi).length;
  const targetDiscards = round.discards[targetSeat]?.length ?? 0;
  const targetCalls = round.events.filter((event) => event.type === "call" && event.seat === targetSeat).length;

  round.scoreDelta = formatDelta(targetDelta);
  round.focus =
    targetDelta > 0
      ? `目标玩家本局收入 ${formatDelta(targetDelta)}，共切出 ${targetDiscards} 张牌。`
      : targetDelta < 0
        ? `目标玩家本局损失 ${formatDelta(targetDelta)}，建议优先复盘终盘押引。`
        : `目标玩家本局点差持平，副露 ${targetCalls} 次，立直 ${riichiCount} 次。`;
  round.danger = targetDelta <= -7700 ? "high" : targetDelta < 0 || riichiCount > 1 ? "mid" : "low";

  delete round.terminalDeltaScores;
}

function readTerminalScores(data: Record<string, unknown>, startScores: number[]) {
  const directScores = readFirstFourNumbers(data.scores);

  if (directScores) {
    return directScores;
  }

  const gameEnd = isRecord(data.gameend) ? data.gameend : {};
  const gameEndScores = readFirstFourNumbers(gameEnd.scores);

  if (gameEndScores) {
    return gameEndScores;
  }

  const oldScores = readFirstFourNumbers(data.old_scores);
  const deltaScores = readFirstFourNumbers(data.delta_scores);

  if (oldScores && deltaScores) {
    return oldScores.map((score, seat) => score + deltaScores[seat]);
  }

  if (deltaScores) {
    return startScores.map((score, seat) => score + deltaScores[seat]);
  }

  return [...startScores];
}

function readTerminalDeltaScores(data: Record<string, unknown>, startScores: number[], endScores: number[]) {
  const directDelta = readFirstFourNumbers(data.delta_scores);

  if (directDelta) {
    return directDelta;
  }

  const oldScores = readFirstFourNumbers(data.old_scores) ?? startScores;

  return endScores.map((score, seat) => score - (oldScores[seat] ?? 0));
}

function readNoTileScoreInfo(data: Record<string, unknown>) {
  if (!Array.isArray(data.scores)) {
    return undefined;
  }

  return data.scores.filter(isRecord).find((item) => readFirstFourNumbers(item.scores) || readFirstFourNumbers(item.delta_scores) || readFirstFourNumbers(item.old_scores));
}

function buildAnalysis(source: PaipuSource, players: Player[], rounds: Round[], targetSeat: number): Analysis {
  const targetPlayer = players[targetSeat];
  const finalDelta =
    targetPlayer.finalScore === undefined ? 0 : targetPlayer.finalScore - targetPlayer.startScore;
  const huleRounds = rounds.filter((round) => round.events.some((event) => event.type === "agari"));
  const lossRounds = rounds.filter((round) => parseSignedScore(round.scoreDelta) < 0);

  return {
    title: `${targetPlayer.name} 的牌谱摘要`,
    confidence: 72,
    summary: `已读取牌谱 ${source.id}，共 ${rounds.length} 局，目标玩家最终点差 ${formatDelta(finalDelta)}。当前 v1 使用真实牌谱事件生成结构化摘要，后续可继续接入 Mortal 或 LLM 做何切级复盘。`,
    keyMoments: [
      huleRounds[0] ? `${huleRounds[0].title}：${huleRounds[0].result}` : "本谱没有识别到和了局，优先检查流局与终局点差。",
      lossRounds[0] ? `${lossRounds[0].title}：目标玩家 ${lossRounds[0].scoreDelta}。` : "目标玩家没有明显失分局。",
      `全局共识别 ${rounds.reduce((sum, round) => sum + round.events.length, 0)} 个摸切/副露/结算事件。`,
    ],
    suggestions: [
      "先从失分最高的局开始复盘，结合立直后安全牌数量判断押引。",
      "对比起手牌、宝牌指示和副露时机，确认速度与打点是否匹配。",
      "下一阶段可以把每巡事件输入模型，生成更细的何切建议。",
    ],
  };
}

function readAccounts(head: RawHead | undefined) {
  return Array.isArray(head?.accounts) ? head.accounts.filter(isRecord) : [];
}

function readDetailRule(head: RawHead | undefined) {
  const config = isRecord(head?.config) ? head.config : {};
  const mode = isRecord(config.mode) ? config.mode : {};
  return isRecord(mode.detail_rule) ? mode.detail_rule : {};
}

function readFinalScores(head: RawHead | undefined) {
  const result = isRecord(head?.result) ? head.result : {};
  const players = Array.isArray(result.players) ? result.players.filter(isRecord) : [];
  const scores: number[] = [];

  for (const player of players) {
    const seat = Number(player.seat);
    scores[seat] = Number(player.total_point ?? 0);
  }

  return scores;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function readNumberArray(value: unknown) {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

function readFirstFourNumbers(value: unknown) {
  const numbers = readNumberArray(value);

  return numbers.length >= 4 ? numbers.slice(0, 4) : undefined;
}

function readOptionalNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseRoundWall(value: unknown, md5Value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const matches = value.match(/[0-9][mpsz]/g) ?? [];
  const parsedLength = matches.reduce((sum, tile) => sum + tile.length, 0);
  const md5 = typeof md5Value === "string" && md5Value.length > 0 ? md5Value : undefined;

  return {
    source: "paishan" as const,
    tiles: matches,
    rawLength: value.length,
    complete: matches.length > 0 && parsedLength === value.length,
    ...(md5 ? { md5 } : {}),
  };
}

function summarizeDoraChanges(rounds: Round[]): NonNullable<NonNullable<AnalyzeSuccess["debug"]>["normalize"]>["doraChanges"] {
  return rounds.flatMap((round) => {
    const changes: NonNullable<NonNullable<AnalyzeSuccess["debug"]>["normalize"]>["doraChanges"] = [];
    let lastKey = "";
    let visibleDoraIndicators = [...round.doraIndicators];

    if (round.doraIndicators.length) {
      changes.push({
        roundId: round.id,
        roundTitle: round.title,
        eventIndex: 0,
        record: "RecordNewRound",
        source: "record",
        doraIndicators: round.doraIndicators,
      });
      lastKey = round.doraIndicators.join("|");
    }

    let kanCount = 0;
    round.events.forEach((event, eventIndex) => {
      if (isKanEvent(event)) {
        kanCount += 1;
      }

      let doraIndicators = visibleDoraIndicators;
      let source: "record" | "paishan" = "record";
      let record: "RecordDealTile" | "RecordAnGangAddGang" | "paishan" =
        event.type === "kan" ? "RecordAnGangAddGang" : "RecordDealTile";

      if ("doraIndicators" in event && event.doraIndicators?.length) {
        doraIndicators = keepMostVisibleDoraIndicators(doraIndicators, event.doraIndicators);
      }

      if (isKanEvent(event)) {
        const inferred = doraIndicatorsForKanCount(round, kanCount);

        if (inferred.length > doraIndicators.length) {
          source = "paishan";
          record = "paishan";
        }

        doraIndicators = keepMostVisibleDoraIndicators(doraIndicators, inferred);
      }

      if (!doraIndicators.length) {
        return;
      }

      const key = doraIndicators.join("|");
      if (key === lastKey) {
        return;
      }

      changes.push({
        roundId: round.id,
        roundTitle: round.title,
        eventIndex,
        record,
        source,
        doraIndicators,
      });
      visibleDoraIndicators = doraIndicators;
      lastKey = key;
    });

    return changes;
  });
}

function summarizeWalls(rounds: Round[]): NonNullable<NonNullable<AnalyzeSuccess["debug"]>["normalize"]>["walls"] {
  return rounds
    .filter((round) => round.wall)
    .map((round) => ({
      roundId: round.id,
      roundTitle: round.title,
      source: "paishan" as const,
      rawLength: round.wall?.rawLength ?? 0,
      tileCount: round.wall?.tiles.length ?? 0,
      complete: Boolean(round.wall?.complete),
      hasMd5: Boolean(round.wall?.md5),
    }));
}

function formatHule(hule: Record<string, unknown>) {
  const seat = Number(hule.seat ?? 0);
  const method = hule.zimo ? "自摸" : "荣和";
  const title = String(hule.title ?? "和了");
  const point = Number(hule.point_sum ?? hule.dadian ?? 0);
  return `${WIND_NAMES[seat] ?? seat} ${method} ${title}${point ? ` ${point}` : ""}`;
}

function formatCallType(type: number) {
  if (type === 0) return "吃";
  if (type === 1) return "碰";
  if (type === 2) return "明杠";
  return "副露";
}

function formatKanType(type: number) {
  if (type === 3) return "暗杠";
  if (type === 2) return "加杠";
  return "杠";
}

function formatAbortiveDraw(type: number) {
  const labels: Record<number, string> = {
    1: "九种九牌",
    2: "四风连打",
    3: "四杠散了",
    4: "四家立直",
    5: "三家和了",
  };
  return labels[type] ?? "途中流局";
}

function formatRank(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return `段位 ${String(value.id ?? "-")}`;
}

function formatScore(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDelta(value: number) {
  if (value > 0) {
    return `+${formatScore(value)}`;
  }

  return formatScore(value);
}

function parseSignedScore(value: string) {
  return Number(value.replaceAll(",", ""));
}

function isTerminalRecord(name: string) {
  return isRecordName(name, "Hule") || isRecordName(name, "NoTile") || isRecordName(name, "LiuJu");
}

function isRecordName(name: string, eventName: string) {
  return name === `Record${eventName}` || name === `Action${eventName}`;
}

function toSeatIndex(seat: number): 0 | 1 | 2 | 3 {
  return seat === 0 || seat === 1 || seat === 2 || seat === 3 ? seat : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
