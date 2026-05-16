import type { PlaybackSeat, PlaybackState } from "./playback";

export type TileSafetyHint = {
  tile: string;
  tone: "safe" | "caution" | "neutral";
  labels: string[];
  description: string;
};

export function buildTileSafetyHint({
  tile,
  playback,
  targetHand,
  targetSeat,
}: {
  tile: string | null | undefined;
  playback: PlaybackState | null;
  targetHand: string[];
  targetSeat: PlaybackSeat;
}): TileSafetyHint | null {
  if (!tile || !playback) {
    return null;
  }

  const normalizedTile = normalizeTile(tile);
  const visibleCounts = countVisibleTiles(playback, targetHand);
  const riichiSeats = getRiichiSeats(playback).filter((seat) => seat !== targetSeat);
  const genbutsuSeats = riichiSeats.filter((seat) => playback.discards[seat].some((discard) => normalizeTile(discard) === normalizedTile));
  const labels: string[] = [];

  if (genbutsuSeats.length) {
    labels.push(`对立直家现物 ${genbutsuSeats.map(formatSeat).join("/")}`);
  }

  const sujiLabels = buildSujiLabels(normalizedTile, playback, riichiSeats);
  labels.push(...sujiLabels);

  const visibleCount = visibleCounts.get(normalizedTile) ?? 0;
  if (visibleCount >= 4) {
    labels.push("四枚可见");
  } else if (visibleCount >= 3) {
    labels.push("三枚可见");
  } else if (normalizedTile.endsWith("z")) {
    labels.push(`字牌可见 ${visibleCount} 枚`);
  }

  if (!labels.length) {
    labels.push(riichiSeats.length ? "无明显现物信息" : "当前无人立直");
  }

  const tone = genbutsuSeats.length || visibleCount >= 4 ? "safe" : riichiSeats.length ? "caution" : "neutral";

  return {
    tile,
    tone,
    labels,
    description: `基于当前可见牌：${labels.join("，")}`,
  };
}

function countVisibleTiles(playback: PlaybackState, targetHand: string[]) {
  const counts = new Map<string, number>();
  const add = (tile: string) => counts.set(normalizeTile(tile), (counts.get(normalizeTile(tile)) ?? 0) + 1);

  targetHand.forEach(add);
  playback.doraIndicators.forEach(add);
  Object.values(playback.discards).flat().forEach(add);
  Object.values(playback.calls)
    .flat()
    .flatMap((call) => call.tiles)
    .forEach(add);

  return counts;
}

function getRiichiSeats(playback: PlaybackState) {
  return ([0, 1, 2, 3] as PlaybackSeat[]).filter((seat) => playback.riichiTiles[seat].length > 0);
}

function buildSujiLabels(tile: string, playback: PlaybackState, riichiSeats: PlaybackSeat[]) {
  const match = /^([1-9])([mps])$/.exec(tile);
  if (!match) {
    return [];
  }

  const rank = Number(match[1]);
  const suit = match[2];
  const sujiSources = sujiReferenceRanks(rank).map((sourceRank) => `${sourceRank}${suit}`);

  return riichiSeats.flatMap((seat) => {
    const discards = new Set(playback.discards[seat].map(normalizeTile));
    const matched = sujiSources.filter((source) => discards.has(source));
    return matched.length ? [`筋参考 ${formatSeat(seat)}:${matched.join("/")}`] : [];
  });
}

function sujiReferenceRanks(rank: number) {
  if (rank === 1) {
    return [4];
  }
  if (rank === 2) {
    return [5];
  }
  if (rank === 3) {
    return [6];
  }
  if (rank === 4) {
    return [1, 7];
  }
  if (rank === 5) {
    return [2, 8];
  }
  if (rank === 6) {
    return [3, 9];
  }
  if (rank === 7) {
    return [4];
  }
  if (rank === 8) {
    return [5];
  }
  if (rank === 9) {
    return [6];
  }
  return [];
}

function normalizeTile(tile: string) {
  return tile.startsWith("0") ? `5${tile.slice(1)}` : tile;
}

function formatSeat(seat: PlaybackSeat) {
  return ["东", "南", "西", "北"][seat] ?? String(seat);
}
