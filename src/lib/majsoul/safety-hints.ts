import type { PlaybackSeat, PlaybackState } from "./playback";
import type { RoundEvent, VisibleAnalysisSnapshot } from "./types";

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
  const unsafeRiichiSeats = riichiSeats.filter((seat) => !genbutsuSeats.includes(seat));
  const labels: string[] = [];

  pushRiichiSafetyLabels(labels, riichiSeats, genbutsuSeats, unsafeRiichiSeats);
  labels.push(...buildSujiLabels(normalizedTile, playback, riichiSeats));
  pushVisibleCountLabels(labels, normalizedTile, visibleCounts.get(normalizedTile) ?? 0);

  if (!labels.length) {
    labels.push(riichiSeats.length ? "无明显现物信息" : "当前无人立直");
  }

  const visibleCount = visibleCounts.get(normalizedTile) ?? 0;
  const safeAgainstAllRiichi = Boolean(riichiSeats.length && genbutsuSeats.length === riichiSeats.length);
  const tone = safeAgainstAllRiichi || visibleCount >= 4 ? "safe" : riichiSeats.length ? "caution" : "neutral";

  return {
    tile,
    tone,
    labels,
    description: `基于当前可见牌：${labels.join("；")}`,
  };
}

export function buildTileSafetyHintFromSnapshot({
  tile,
  snapshot,
  visibleEvents,
}: {
  tile: string | null | undefined;
  snapshot: VisibleAnalysisSnapshot;
  visibleEvents?: RoundEvent[];
}): TileSafetyHint | null {
  if (!tile) {
    return null;
  }

  const normalizedTile = normalizeTile(tile);
  const visibleCounts = countVisibleSnapshotTiles(snapshot);
  const riichiSeats = ([0, 1, 2, 3] as PlaybackSeat[]).filter((seat) => snapshot.riichiTiles[seat].length > 0 && seat !== snapshot.targetSeat);
  const safeTilesByRiichiSeat = buildSafeTilesByRiichiSeat({ snapshot, visibleEvents, riichiSeats });
  const genbutsuSeats = riichiSeats.filter((seat) => safeTilesByRiichiSeat[seat]?.has(normalizedTile));
  const unsafeRiichiSeats = riichiSeats.filter((seat) => !safeTilesByRiichiSeat[seat]?.has(normalizedTile));
  const labels: string[] = [];

  pushRiichiSafetyLabels(labels, riichiSeats, genbutsuSeats, unsafeRiichiSeats);
  labels.push(...buildSujiLabels(normalizedTile, { discards: snapshot.discards }, riichiSeats));
  pushVisibleCountLabels(labels, normalizedTile, visibleCounts.get(normalizedTile) ?? 0);

  if (!labels.length) {
    labels.push(riichiSeats.length ? "无明显现物信息" : "当前无人立直");
  }

  const visibleCount = visibleCounts.get(normalizedTile) ?? 0;
  const safeAgainstAllRiichi = Boolean(riichiSeats.length && genbutsuSeats.length === riichiSeats.length);
  const tone = safeAgainstAllRiichi || visibleCount >= 4 ? "safe" : riichiSeats.length ? "caution" : "neutral";

  return {
    tile,
    tone,
    labels,
    description: `基于当前可见牌：${labels.join("；")}`,
  };
}

function pushRiichiSafetyLabels(labels: string[], riichiSeats: PlaybackSeat[], safeSeats: PlaybackSeat[], unsafeSeats: PlaybackSeat[]) {
  if (!riichiSeats.length) {
    return;
  }

  if (safeSeats.length === riichiSeats.length) {
    labels.push(`对所有立直家现物/通过牌 ${safeSeats.map(formatSeat).join("/")}`);
    return;
  }

  if (safeSeats.length) {
    labels.push(`对立直家通过牌 ${safeSeats.map(formatSeat).join("/")}`);
  }

  if (unsafeSeats.length) {
    labels.push(`对立直家非现物 ${unsafeSeats.map(formatSeat).join("/")}`);
  }
}

function pushVisibleCountLabels(labels: string[], tile: string, visibleCount: number) {
  if (visibleCount >= 4) {
    labels.push("四枚可见");
  } else if (visibleCount >= 3) {
    labels.push("三枚可见");
  } else if (tile.endsWith("z")) {
    labels.push(`字牌可见 ${visibleCount} 枚`);
  }
}

function buildSafeTilesByRiichiSeat({
  snapshot,
  visibleEvents,
  riichiSeats,
}: {
  snapshot: VisibleAnalysisSnapshot;
  visibleEvents: RoundEvent[] | undefined;
  riichiSeats: PlaybackSeat[];
}) {
  const safeTiles = Object.fromEntries(riichiSeats.map((seat) => [seat, new Set<string>()])) as Partial<Record<PlaybackSeat, Set<string>>>;

  for (const seat of riichiSeats) {
    snapshot.discards[seat].forEach((discard) => safeTiles[seat]?.add(normalizeTile(discard)));
  }

  if (!visibleEvents?.length) {
    return safeTiles;
  }

  const riichiEventIndexBySeat = new Map<PlaybackSeat, number>();
  visibleEvents.forEach((event, index) => {
    if (event.type !== "discard") {
      return;
    }

    const seat = event.seat as PlaybackSeat;
    if (event.riichi && riichiSeats.includes(seat) && !riichiEventIndexBySeat.has(seat)) {
      riichiEventIndexBySeat.set(seat, index);
    }
  });

  for (const seat of riichiSeats) {
    const riichiEventIndex = riichiEventIndexBySeat.get(seat);
    if (riichiEventIndex === undefined) {
      continue;
    }

    for (let index = riichiEventIndex; index < visibleEvents.length; index += 1) {
      const event = visibleEvents[index];
      if (event.type !== "discard") {
        continue;
      }

      const nextEvent = visibleEvents[index + 1];
      const immediatelyRonned = nextEvent?.type === "agari" && !nextEvent.zimo && normalizeTile(nextEvent.tile) === normalizeTile(event.tile);
      if (!immediatelyRonned) {
        safeTiles[seat]?.add(normalizeTile(event.tile));
      }
    }
  }

  return safeTiles;
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

function buildSujiLabels(tile: string, playback: Pick<PlaybackState, "discards">, riichiSeats: PlaybackSeat[]) {
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

function countVisibleSnapshotTiles(snapshot: VisibleAnalysisSnapshot) {
  const counts = new Map<string, number>();
  const add = (tile: string) => counts.set(normalizeTile(tile), (counts.get(normalizeTile(tile)) ?? 0) + 1);

  snapshot.targetHand.forEach(add);
  snapshot.doraIndicators.forEach(add);
  Object.values(snapshot.discards).flat().forEach(add);
  Object.values(snapshot.calls)
    .flat()
    .flatMap((call) => call.tiles)
    .forEach(add);

  return counts;
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
