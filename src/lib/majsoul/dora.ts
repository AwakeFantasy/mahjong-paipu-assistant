import type { Round, RoundEvent } from "./types";

const MAX_DORA_INDICATORS = 5;
const RINSHAN_TILE_COUNT = 4;

export function doraIndicatorsForKanCount(round: Round, kanCount: number) {
  const visibleCount = Math.max(1, Math.min(MAX_DORA_INDICATORS, kanCount + 1));
  const fromWall = inferDoraIndicatorsFromWall(round, visibleCount);

  if (fromWall.length >= visibleCount) {
    return fromWall;
  }

  return round.doraIndicators;
}

export function keepMostVisibleDoraIndicators(current: string[], candidate: string[]) {
  return candidate.length >= current.length ? candidate : current;
}

export function isKanEvent(event: RoundEvent) {
  return event.type === "kan" || (event.type === "call" && event.callType.includes("杠"));
}

function inferDoraIndicatorsFromWall(round: Round, visibleCount: number) {
  const wall = round.wall?.tiles;

  if (!wall?.length || !round.doraIndicators.length) {
    return [];
  }

  const sequence = selectDoraIndexSequence(round);
  return sequence.slice(0, visibleCount).map((index) => wall[index]).filter(Boolean);
}

function selectDoraIndexSequence(round: Round) {
  const wall = round.wall?.tiles ?? [];
  const firstIndicator = round.doraIndicators[0];
  const firstIndicatorIndex = findFirstDoraIndicatorIndex(wall, firstIndicator);

  return Array.from({ length: MAX_DORA_INDICATORS }, (_, index) => firstIndicatorIndex - index * 2);
}

function findFirstDoraIndicatorIndex(wall: string[], firstIndicator: string | undefined) {
  const maxIndicatorIndex = Math.max(0, wall.length - RINSHAN_TILE_COUNT - 1);

  for (let index = maxIndicatorIndex; index >= 0; index -= 1) {
    if (wall[index] === firstIndicator) {
      return index;
    }
  }

  return maxIndicatorIndex;
}
