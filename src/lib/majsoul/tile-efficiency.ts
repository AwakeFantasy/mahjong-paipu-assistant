import syanten from "syanten";

type HaiArr = syanten.HaiArr;

export type TileEfficiencyWait = {
  tile: string;
  theoretical: number;
  visible: number;
  remaining: number;
};

export type TileEfficiencyDiscard = {
  discard: string;
  shantenAfterDiscard: number;
  theoreticalWaitCount: number;
  visibleWaitCount: number;
  waitCount: number;
  waits: TileEfficiencyWait[];
};

export type TileEfficiencyAnalysis = {
  status: "empty" | "unsupported" | "ready";
  tileCount: number;
  shanten: number;
  standardShanten: number;
  sevenPairsShanten: number;
  thirteenOrphansShanten: number;
  theoreticalWaitCount: number;
  visibleWaitCount: number;
  waits: TileEfficiencyWait[];
  discardOptions: TileEfficiencyDiscard[];
  message?: string;
};

type HairiResult = {
  now?: number;
  wait?: Record<string, number>;
  [discard: string]: unknown;
};

const supportedTileCounts = new Set([1, 2, 4, 5, 7, 8, 10, 11, 13, 14]);

export function analyzeTileEfficiency(tiles: string[], visibleTiles: string[] = []): TileEfficiencyAnalysis {
  const normalizedTiles = tiles.map(normalizeRedFive).filter(isSupportedTile);
  const visibleCounts = countTiles(visibleTiles);
  const tileCount = normalizedTiles.length;

  if (!tileCount) {
    return makeUnavailable("empty", tileCount, "读取牌谱并停到目标手牌后显示牌效。");
  }

  if (!supportedTileCounts.has(tileCount)) {
    return makeUnavailable("unsupported", tileCount, `当前手牌 ${tileCount} 张，暂不适合做向听/受入计算。`);
  }

  const counts = toHaiArr(normalizedTiles);
  const shanten = syanten(counts);
  const standardShanten = syanten.syanten(counts);
  const sevenPairsShanten = syanten.syanten7(counts);
  const thirteenOrphansShanten = syanten.syanten13(counts);
  const hairi = syanten.hairi(counts) as HairiResult;
  const waits = normalizeWaits(hairi.wait, visibleCounts);
  const theoreticalWaitCount = waits.reduce((sum, wait) => sum + wait.theoretical, 0);
  const visibleWaitCount = waits.reduce((sum, wait) => sum + wait.visible, 0);
  const discardOptions = tileCount % 3 === 2 ? buildDiscardOptions(normalizedTiles, hairi, visibleCounts) : [];

  return {
    status: "ready",
    tileCount,
    shanten,
    standardShanten,
    sevenPairsShanten,
    thirteenOrphansShanten,
    theoreticalWaitCount,
    visibleWaitCount,
    waits,
    discardOptions,
  };
}

function buildDiscardOptions(tiles: string[], hairi: HairiResult, visibleCounts: Map<string, number>): TileEfficiencyDiscard[] {
  const uniqueDiscards = [...new Set(tiles)];

  return uniqueDiscards
    .map((discard) => {
      const waits = normalizeWaits(toWaitRecord(hairi[discard]), visibleCounts, discard);
      const afterDiscard = removeOneTile(tiles, discard);

      return {
        discard,
        shantenAfterDiscard: syanten(toHaiArr(afterDiscard)),
        theoreticalWaitCount: waits.reduce((sum, wait) => sum + wait.theoretical, 0),
        visibleWaitCount: waits.reduce((sum, wait) => sum + wait.visible, 0),
        waitCount: waits.reduce((sum, wait) => sum + wait.remaining, 0),
        waits,
      };
    })
    .filter((option) => option.waits.length || Number.isFinite(option.shantenAfterDiscard))
    .sort((left, right) => left.shantenAfterDiscard - right.shantenAfterDiscard || right.waitCount - left.waitCount || tileSortKey(left.discard) - tileSortKey(right.discard));
}

function normalizeWaits(waitRecord: Record<string, number> | undefined, visibleCounts: Map<string, number>, extraVisibleTile?: string): TileEfficiencyWait[] {
  return Object.entries(waitRecord ?? {})
    .map(([tile, theoretical]) => {
      const visible = Math.min(theoretical, (visibleCounts.get(tile) ?? 0) + (extraVisibleTile === tile ? 1 : 0));

      return {
        tile,
        theoretical,
        visible,
        remaining: Math.max(0, theoretical - visible),
      };
    })
    .filter((wait) => Number.isFinite(wait.remaining) && wait.remaining > 0)
    .sort((left, right) => right.remaining - left.remaining || tileSortKey(left.tile) - tileSortKey(right.tile));
}

function countTiles(tiles: string[]) {
  const counts = new Map<string, number>();

  for (const tile of tiles) {
    const normalized = normalizeRedFive(tile);
    if (!isSupportedTile(normalized)) {
      continue;
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return counts;
}

function toWaitRecord(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number");
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function toHaiArr(tiles: string[]): HaiArr {
  const counts: HaiArr = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ];

  for (const tile of tiles) {
    const parsed = parseTile(tile);
    if (!parsed) {
      continue;
    }

    counts[parsed.suitIndex][parsed.rankIndex] += 1;
  }

  return counts;
}

function removeOneTile(tiles: string[], discard: string) {
  const index = tiles.indexOf(discard);
  if (index < 0) {
    return tiles;
  }

  return tiles.slice(0, index).concat(tiles.slice(index + 1));
}

function normalizeRedFive(tile: string) {
  return /^0[mps]$/.test(tile) ? `5${tile[1]}` : tile;
}

function isSupportedTile(tile: string) {
  return /^[1-9][mps]$/.test(tile) || /^[1-7]z$/.test(tile);
}

function parseTile(tile: string) {
  const match = /^([1-9])([mpsz])$/.exec(tile);
  if (!match) {
    return null;
  }

  const [, rankRaw, suit] = match;
  const rank = Number(rankRaw);

  if (suit === "z") {
    if (rank < 1 || rank > 7) {
      return null;
    }

    return { suitIndex: 3 as const, rankIndex: rank - 1 };
  }

  const suitIndex = suit === "m" ? 0 : suit === "p" ? 1 : 2;
  return { suitIndex, rankIndex: rank - 1 };
}

function tileSortKey(tile: string) {
  const parsed = parseTile(tile);
  return parsed ? parsed.suitIndex * 10 + parsed.rankIndex : 999;
}

function makeUnavailable(status: "empty" | "unsupported", tileCount: number, message: string): TileEfficiencyAnalysis {
  return {
    status,
    tileCount,
    shanten: -2,
    standardShanten: -2,
    sevenPairsShanten: -2,
    thirteenOrphansShanten: -2,
    theoreticalWaitCount: 0,
    visibleWaitCount: 0,
    waits: [],
    discardOptions: [],
    message,
  };
}
