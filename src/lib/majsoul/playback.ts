import type { Round, RoundEvent } from "./types";
import { doraIndicatorsForKanCount, isKanEvent, keepMostVisibleDoraIndicators } from "./dora";

export type PlaybackSeat = 0 | 1 | 2 | 3;

export type PlaybackCall = {
  seat: PlaybackSeat;
  callType: string;
  tiles: string[];
  froms?: number[];
  eventIndex: number;
};

export type PlaybackState = {
  cursor: number;
  maxCursor: number;
  visibleCount: number;
  currentEvent?: RoundEvent;
  previousEvent?: RoundEvent;
  discards: Record<PlaybackSeat, string[]>;
  calls: Record<PlaybackSeat, PlaybackCall[]>;
  hands: Record<PlaybackSeat, string[]>;
  targetHand: string[];
  drawnTile?: string;
  doraIndicators: string[];
  remainingTiles?: number;
  scores: Record<PlaybackSeat, number>;
  riichiSticks: number;
  riichiTiles: Record<PlaybackSeat, number[]>;
  roundResult?: string;
};

const TILE_SUIT_ORDER: Record<string, number> = {
  m: 0,
  p: 1,
  s: 2,
  z: 3,
};

export function buildPlaybackState(round: Round, targetSeat: PlaybackSeat, cursor: number): PlaybackState {
  const visibleCount = clampCursor(cursor, round.events.length);
  const visibleEvents = round.events.slice(0, visibleCount);
  const discards = emptySeatRecord<string[]>();
  const calls = emptySeatRecord<PlaybackCall[]>();
  const riichiTiles = emptySeatRecord<number[]>();
  const hands = {
    0: [...(round.initialHands[0] ?? [])],
    1: [...(round.initialHands[1] ?? [])],
    2: [...(round.initialHands[2] ?? [])],
    3: [...(round.initialHands[3] ?? [])],
  };
  let doraIndicators = [...round.doraIndicators];
  let kanCount = 0;
  const drawnTiles = emptySeatRecord<string[]>();
  let remainingTiles: number | undefined;
  let scores = scoresFromArray(round.startScores);
  let riichiSticks = round.riichiSticks;
  let roundResult: string | undefined;

  visibleEvents.forEach((event, eventIndex) => {
    if ("doraIndicators" in event && event.doraIndicators?.length) {
      doraIndicators = keepMostVisibleDoraIndicators(doraIndicators, event.doraIndicators);
    }

    if (isKanEvent(event)) {
      kanCount += 1;
      doraIndicators = keepMostVisibleDoraIndicators(doraIndicators, doraIndicatorsForKanCount(round, kanCount));
    }

    if (event.type === "draw") {
      remainingTiles = event.leftTileCount ?? remainingTiles;
      const seat = toPlaybackSeat(event.seat);
      hands[seat].push(event.tile);
      drawnTiles[seat] = [event.tile];
      return;
    }

    if (event.type === "discard") {
      const seat = toPlaybackSeat(event.seat);
      discards[seat].push(event.tile);

      if (event.riichi) {
        riichiTiles[seat].push(discards[seat].length - 1);
        riichiSticks += 1;
      }

      removeTile(hands[seat], event.tile);
      drawnTiles[seat] = [];
      return;
    }

    if (event.type === "call" || event.type === "kan") {
      const seat = toPlaybackSeat(event.seat);
      calls[seat].push({
        seat,
        callType: event.callType,
        tiles: [...event.tiles],
        froms: event.type === "call" ? [...event.froms] : undefined,
        eventIndex,
      });

      for (const [tileIndex, tile] of event.tiles.entries()) {
        const from = event.type === "call" ? event.froms[tileIndex] : seat;
        if (from === seat || from === undefined) {
          removeTile(hands[seat], tile);
        }
      }
      if (event.type === "call") {
        removeClaimedDiscard(discards, riichiTiles, event);
      }
      drawnTiles[seat] = [];
      return;
    }

    if (event.type === "agari") {
      roundResult = `${event.zimo ? "自摸" : "荣和"} ${event.title} ${event.point || ""}`.trim();
      scores = scoresFromArray(round.endScores ?? round.startScores);
      riichiSticks = 0;
      return;
    }

    if (event.type === "ryukyoku") {
      roundResult = event.label;
      scores = scoresFromArray(round.endScores ?? round.startScores);
    }
  });

  const currentEvent = visibleEvents.at(-1);
  const previousEvent = visibleEvents.at(-2);
  if (currentEvent?.type === "new-round") {
    const seat = toPlaybackSeat(currentEvent.seat);
    if (seat === targetSeat && hands[seat].length % 3 === 2) {
      drawnTiles[seat] = [hands[seat].at(-1) ?? ""].filter(Boolean);
    }
  }

  return {
    cursor: visibleCount,
    maxCursor: round.events.length,
    visibleCount,
    currentEvent,
    previousEvent,
    discards,
    calls,
    hands: {
      0: sortTilesForHand(hands[0], drawnTiles[0][0]),
      1: sortTilesForHand(hands[1], drawnTiles[1][0]),
      2: sortTilesForHand(hands[2], drawnTiles[2][0]),
      3: sortTilesForHand(hands[3], drawnTiles[3][0]),
    },
    targetHand: sortTilesForHand(hands[targetSeat], drawnTiles[targetSeat][0]),
    drawnTile: drawnTiles[targetSeat][0],
    doraIndicators,
    remainingTiles,
    scores,
    riichiSticks,
    riichiTiles,
    roundResult,
  };
}

export function sortTilesForHand(tiles: string[], drawnTile?: string): string[] {
  if (drawnTile && tiles.at(-1) === drawnTile) {
    return [...sortHandBody(tiles.slice(0, -1)), drawnTile];
  }

  return sortHandBody(tiles);
}

function clampCursor(cursor: number, maxCursor: number) {
  if (!Number.isFinite(cursor)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.trunc(cursor), maxCursor));
}

function emptySeatRecord<T extends unknown[]>(): Record<PlaybackSeat, T> {
  return {
    0: [] as unknown as T,
    1: [] as unknown as T,
    2: [] as unknown as T,
    3: [] as unknown as T,
  };
}

function scoresFromArray(scores: number[]): Record<PlaybackSeat, number> {
  return {
    0: scores[0] ?? 25000,
    1: scores[1] ?? 25000,
    2: scores[2] ?? 25000,
    3: scores[3] ?? 25000,
  };
}

function toPlaybackSeat(seat: number): PlaybackSeat {
  if (seat === 0 || seat === 1 || seat === 2 || seat === 3) {
    return seat;
  }

  return 0;
}

function removeTile(tiles: string[], tile: string) {
  const index = tiles.indexOf(tile);

  if (index >= 0) {
    tiles.splice(index, 1);
    return;
  }

  const redFiveFallback = tile.startsWith("0") ? `5${tile.slice(1)}` : tile.startsWith("5") ? `0${tile.slice(1)}` : "";
  const fallbackIndex = redFiveFallback ? tiles.indexOf(redFiveFallback) : -1;

  if (fallbackIndex >= 0) {
    tiles.splice(fallbackIndex, 1);
  }
}

function removeClaimedDiscard(discards: Record<PlaybackSeat, string[]>, riichiTiles: Record<PlaybackSeat, number[]>, event: Extract<RoundEvent, { type: "call" }>) {
  const caller = toPlaybackSeat(event.seat);
  const sourceIndex = event.froms.findIndex((from) => from !== caller && from >= 0 && from <= 3);

  if (sourceIndex < 0) {
    return;
  }

  const sourceSeat = toPlaybackSeat(event.froms[sourceIndex]);
  const claimedTile = event.tiles[sourceIndex];
  const discardIndex = findLastTileIndex(discards[sourceSeat], claimedTile);

  if (discardIndex < 0) {
    return;
  }

  discards[sourceSeat].splice(discardIndex, 1);
  riichiTiles[sourceSeat] = riichiTiles[sourceSeat]
    .filter((index) => index !== discardIndex)
    .map((index) => (index > discardIndex ? index - 1 : index));
}

function findLastTileIndex(tiles: string[], tile: string) {
  for (let index = tiles.length - 1; index >= 0; index -= 1) {
    if (tiles[index] === tile || isRedFivePair(tiles[index], tile)) {
      return index;
    }
  }

  return -1;
}

function isRedFivePair(left: string, right: string) {
  if (left.length !== 2 || right.length !== 2 || left[1] !== right[1]) {
    return false;
  }

  return (left[0] === "0" && right[0] === "5") || (left[0] === "5" && right[0] === "0");
}

function sortHandBody(tiles: string[]) {
  return tiles
    .map((tile, index) => ({ tile, index, key: tileSortKey(tile) }))
    .sort((left, right) => left.key - right.key || left.index - right.index)
    .map(({ tile }) => tile);
}

function tileSortKey(tile: string) {
  const match = /^([0-9])([mpsz])$/.exec(tile);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const [, digit, suit] = match;
  const suitOrder = TILE_SUIT_ORDER[suit];
  const rank = digit === "0" && suit !== "z" ? 5 : Number(digit);

  if (suitOrder === undefined || rank < 1 || rank > 9 || (suit === "z" && rank > 7)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return suitOrder * 10 + rank;
}
