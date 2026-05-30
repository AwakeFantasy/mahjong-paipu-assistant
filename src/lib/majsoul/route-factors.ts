import { formatTileName, formatTileNames } from "./tile-format";
import type { RouteFactor, RouteFactorAnalysis, RouteFactorKind, RouteFactorStrength } from "./types";

type AnalyzeRouteFactorsInput = {
  tiles: string[];
  candidateDiscards: string[];
  seatWind?: "E" | "S" | "W" | "N";
  roundWind?: "E" | "S" | "W" | "N";
};

const WIND_TO_TILE: Record<"E" | "S" | "W" | "N", string> = {
  E: "1z",
  S: "2z",
  W: "3z",
  N: "4z",
};

const ROUTE_LABELS: Record<RouteFactorKind, string> = {
  tanyao: "断幺路线",
  yakuhai: "役牌路线",
  honitsu: "混一色路线",
  chiitoi: "七对子路线",
};

const STRENGTH_SCORE: Record<RouteFactorStrength, number> = {
  weak: 1,
  medium: 2,
  strong: 3,
};

export function analyzeRouteFactors({ tiles, candidateDiscards, seatWind = "E", roundWind = "E" }: AnalyzeRouteFactorsInput): RouteFactorAnalysis[] {
  const normalizedTiles = tiles.map(normalizeTile).filter(isTileCode);
  const candidates = [...new Set(candidateDiscards.map(normalizeTile).filter(isTileCode))];
  const yakuhaiTiles = new Set(["5z", "6z", "7z", WIND_TO_TILE[seatWind], WIND_TO_TILE[roundWind]]);

  return candidates.map((discard) => {
    const afterDiscard = removeOne(normalizedTiles, discard);
    const routes = [
      analyzeTanyao(afterDiscard, discard),
      analyzeYakuhai(afterDiscard, normalizedTiles, discard, yakuhaiTiles),
      analyzeHonitsu(afterDiscard, normalizedTiles, discard),
      analyzeChiitoi(afterDiscard, normalizedTiles, discard),
    ].filter((route): route is RouteFactor => Boolean(route));

    return { discard, routes };
  });
}

export function compareRouteFactors(left: RouteFactorAnalysis | undefined, right: RouteFactorAnalysis | undefined) {
  if (!left || !right) {
    return null;
  }

  const leftScore = scoreRoutes(left.routes);
  const rightScore = scoreRoutes(right.routes);
  const diff = Math.abs(leftScore - rightScore);

  if (diff < 1) {
    return null;
  }

  const better = leftScore > rightScore ? left : right;
  const worse = better === left ? right : left;
  const route = pickBestDifferentialRoute(better.routes, worse.routes);

  if (!route) {
    return null;
  }

  return {
    preferredDiscardTile: better.discard,
    preferredKeepTile: worse.discard,
    strength: diff >= 4 ? "medium" as const : "weak" as const,
    summary: `只看牌型路线，切 ${formatTileName(better.discard)} 后更保留${ROUTE_LABELS[route.route]}：${route.evidence.join("；")}。`,
  };
}

export function summarizeRouteFactorAnalysis(item: RouteFactorAnalysis) {
  if (!item.routes.length) {
    return `切 ${formatTileName(item.discard)} 后没有识别到稳定牌型路线。`;
  }

  return `切 ${formatTileName(item.discard)} 后：${item.routes.map((route) => `${ROUTE_LABELS[route.route]} ${route.strength}（${route.evidence.join("；")}）`).join("；")}`;
}

function analyzeTanyao(tiles: string[], discard: string): RouteFactor | null {
  const simpleCount = tiles.filter(isSimple).length;
  const terminalHonorCount = tiles.length - simpleCount;

  if (simpleCount < 8 || terminalHonorCount > 4) {
    return null;
  }

  return {
    route: "tanyao",
    strength: terminalHonorCount <= 2 ? "medium" : "weak",
    evidence: [`中张 ${simpleCount} 枚`, `幺九/字牌 ${terminalHonorCount} 枚`],
    lostByDiscard: isSimple(discard) ? `切掉 ${formatTileName(discard)} 会少一枚中张` : undefined,
  };
}

function analyzeYakuhai(tiles: string[], beforeTiles: string[], discard: string, yakuhaiTiles: Set<string>): RouteFactor | null {
  const counts = countTiles(tiles);
  const beforeCount = countTiles(beforeTiles).get(discard) ?? 0;
  const candidates = [...yakuhaiTiles]
    .map((tile) => ({ tile, count: counts.get(tile) ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || tileSortKey(left.tile) - tileSortKey(right.tile));
  const best = candidates[0];

  if (!best) {
    return null;
  }

  return {
    route: "yakuhai",
    strength: best.count >= 2 ? "strong" : "weak",
    evidence: [`保留 ${formatTileName(best.tile)} ${best.count} 枚`],
    lostByDiscard: yakuhaiTiles.has(discard) && beforeCount > (counts.get(discard) ?? 0) ? `切 ${formatTileName(discard)} 会削弱役牌保留` : undefined,
  };
}

function analyzeHonitsu(tiles: string[], beforeTiles: string[], discard: string): RouteFactor | null {
  const suitCounts = countSuits(tiles);
  const honorCount = tiles.filter(isHonor).length;
  const dominant = (["m", "p", "s"] as const)
    .map((suit) => ({ suit, count: suitCounts[suit] }))
    .sort((left, right) => right.count - left.count)[0];
  const offSuitCount = tiles.filter((tile) => !isHonor(tile) && tileSuit(tile) !== dominant.suit).length;

  if (dominant.count < 5 || honorCount < 1 || offSuitCount > 3) {
    return null;
  }

  const beforeDominantCount = beforeTiles.filter((tile) => tileSuit(tile) === dominant.suit).length;
  const discardedDominant = tileSuit(discard) === dominant.suit && beforeDominantCount > dominant.count;

  return {
    route: "honitsu",
    strength: offSuitCount <= 1 && dominant.count + honorCount >= 10 ? "strong" : "medium",
    evidence: [`${formatSuitName(dominant.suit)} ${dominant.count} 枚`, `字牌 ${honorCount} 枚`, `异色 ${offSuitCount} 枚`],
    lostByDiscard: discardedDominant ? `切 ${formatTileName(discard)} 会减少主色牌` : undefined,
  };
}

function analyzeChiitoi(tiles: string[], beforeTiles: string[], discard: string): RouteFactor | null {
  const counts = countTiles(tiles);
  const pairCount = [...counts.values()].filter((count) => count >= 2).length;

  if (pairCount < 3) {
    return null;
  }

  const beforeDiscardCount = countTiles(beforeTiles).get(discard) ?? 0;

  return {
    route: "chiitoi",
    strength: pairCount >= 5 ? "strong" : pairCount >= 4 ? "medium" : "weak",
    evidence: [`对子 ${pairCount} 组`, `手牌 ${formatTileNames(tiles)}`],
    lostByDiscard: beforeDiscardCount >= 2 ? `切 ${formatTileName(discard)} 会拆对子` : undefined,
  };
}

function scoreRoutes(routes: RouteFactor[]) {
  return routes.reduce((total, route) => total + STRENGTH_SCORE[route.strength] + (route.lostByDiscard ? -1 : 0), 0);
}

function pickBestDifferentialRoute(betterRoutes: RouteFactor[], worseRoutes: RouteFactor[]) {
  const worseByKind = new Map(worseRoutes.map((route) => [route.route, route]));
  const scored = betterRoutes
    .map((route) => {
      const worse = worseByKind.get(route.route);
      const diff = routeScore(route) - (worse ? routeScore(worse) : 0);
      return { route, diff };
    })
    .filter((item) => item.diff > 0)
    .sort((left, right) => right.diff - left.diff || routeScore(right.route) - routeScore(left.route));

  return scored[0]?.route ?? [...betterRoutes].sort((left, right) => routeScore(right) - routeScore(left))[0];
}

function routeScore(route: RouteFactor) {
  return STRENGTH_SCORE[route.strength] + (route.lostByDiscard ? -1 : 0);
}

function removeOne(tiles: string[], discard: string) {
  const copy = [...tiles];
  const index = copy.indexOf(discard);
  if (index >= 0) {
    copy.splice(index, 1);
  }
  return copy;
}

function countTiles(tiles: string[]) {
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

function countSuits(tiles: string[]) {
  return {
    m: tiles.filter((tile) => tileSuit(tile) === "m").length,
    p: tiles.filter((tile) => tileSuit(tile) === "p").length,
    s: tiles.filter((tile) => tileSuit(tile) === "s").length,
  };
}

function normalizeTile(tile: string) {
  const trimmed = tile.trim().toLowerCase();
  const redFive = /^0([mps])$/.exec(trimmed) ?? /^5([mps])r$/.exec(trimmed);
  return redFive ? `5${redFive[1]}` : trimmed;
}

function isTileCode(tile: string) {
  return /^[1-9][mps]$/.test(tile) || /^[1-7]z$/.test(tile);
}

function tileSuit(tile: string) {
  return /^([1-9])([mps])$/.exec(tile)?.[2] as "m" | "p" | "s" | undefined;
}

function isHonor(tile: string) {
  return /^[1-7]z$/.test(tile);
}

function isSimple(tile: string) {
  const match = /^([2-8])[mps]$/.exec(tile);
  return Boolean(match);
}

function tileSortKey(tile: string) {
  const match = /^([1-9])([mpsz])$/.exec(tile);
  if (!match) {
    return 999;
  }

  const rank = Number(match[1]);
  const suitIndex = match[2] === "m" ? 0 : match[2] === "p" ? 1 : match[2] === "s" ? 2 : 3;
  return suitIndex * 10 + rank;
}

function formatSuitName(suit: "m" | "p" | "s") {
  return suit === "m" ? "万子" : suit === "p" ? "筒子" : "索子";
}
