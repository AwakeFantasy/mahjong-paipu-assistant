import { canFactorDriveConclusion } from "./analysis-factors";
import { compareRouteFactors } from "./route-factors";
import { buildTileSafetyHintFromSnapshot } from "./safety-hints";
import { formatTileName } from "./tile-format";
import type { AnalysisEngineResult, CandidateComparison, DoraAnalysis, DoraTileFact, RoundEvent, RouteFactorAnalysis, VisibleAnalysisSnapshot } from "./types";
import type { TileEfficiencyAnalysis } from "./tile-efficiency";

const WIND_ORDER = ["1z", "2z", "3z", "4z"];
const DRAGON_ORDER = ["5z", "6z", "7z"];
const COPIES_PER_TILE = 4;

type DecisionFactor = CandidateComparison["decidingFactors"][number];

export function nextDoraTile(indicator: string) {
  const tile = normalizeTile(indicator);
  const suitMatch = /^([1-9])([mps])$/.exec(tile);

  if (suitMatch) {
    const rank = Number(suitMatch[1]);
    const suit = suitMatch[2];
    return `${rank === 9 ? 1 : rank + 1}${suit}`;
  }

  return nextInCycle(tile, WIND_ORDER) ?? nextInCycle(tile, DRAGON_ORDER) ?? tile;
}

export function previousDoraIndicator(tile: string) {
  const normalized = normalizeTile(tile);
  const suitMatch = /^([1-9])([mps])$/.exec(normalized);

  if (suitMatch) {
    const rank = Number(suitMatch[1]);
    const suit = suitMatch[2];
    return `${rank === 1 ? 9 : rank - 1}${suit}`;
  }

  return previousInCycle(normalized, WIND_ORDER) ?? previousInCycle(normalized, DRAGON_ORDER) ?? normalized;
}

export function buildDoraAnalysis(snapshot: VisibleAnalysisSnapshot, candidateTiles: string[] = []): DoraAnalysis {
  const visibleCounts = countVisibleTiles(snapshot);
  const currentDoraTiles = snapshot.doraIndicators.map(nextDoraTile);
  const uniqueCandidates = [...new Set(candidateTiles.map(normalizeTile).filter(isTileCode))];

  return {
    doraIndicators: snapshot.doraIndicators.map(normalizeTile),
    currentDoraTiles,
    visibleCounts: Object.fromEntries([...visibleCounts.entries()].sort(([left], [right]) => tileSortKey(left) - tileSortKey(right))),
    candidateFacts: uniqueCandidates.map((tile) => buildDoraTileFact(tile, currentDoraTiles, visibleCounts)),
    notes: [
      "宝牌指示牌的下一张才是宝牌；三元牌循环顺序是白 -> 发 -> 中 -> 白。",
      "未来宝牌潜力只是弱因子；只有牌效、形状、安全都接近时，才适合拿来做补充理由。",
    ],
  };
}

export function buildCandidateComparisons({
  engine,
  tileEfficiency,
  doraAnalysis,
  snapshot,
  visibleEvents,
  routeFactors,
}: {
  engine: AnalysisEngineResult;
  tileEfficiency: TileEfficiencyAnalysis;
  doraAnalysis: DoraAnalysis;
  snapshot?: VisibleAnalysisSnapshot;
  visibleEvents?: RoundEvent[];
  routeFactors?: RouteFactorAnalysis[];
}): CandidateComparison[] {
  const candidateTiles = [
    ...new Set(
      [
        ...engine.recommendations.map((item) => item.tile).filter((tile): tile is string => Boolean(tile)),
        ...tileEfficiency.discardOptions.slice(0, 4).map((item) => item.discard),
      ].map(normalizeTile),
    ),
  ];

  const comparisons: CandidateComparison[] = [];

  for (let leftIndex = 0; leftIndex < candidateTiles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidateTiles.length; rightIndex += 1) {
      const left = candidateTiles[leftIndex];
      const right = candidateTiles[rightIndex];
      const leftEfficiency = findEfficiency(left, tileEfficiency);
      const rightEfficiency = findEfficiency(right, tileEfficiency);
      const sameEfficiency = hasSameEfficiency(leftEfficiency, rightEfficiency);
      const efficiencyFactor = buildEfficiencyFactor(left, right, leftEfficiency, rightEfficiency, sameEfficiency);
      const engineFactor = buildEngineComparisonFactor(left, right, engine);
      const doraFactor = buildDoraComparisonFactor(
        doraAnalysis.candidateFacts.find((fact) => fact.tile === left),
        doraAnalysis.candidateFacts.find((fact) => fact.tile === right),
      );
      const safetyFactor = buildSafetyComparisonFactor(left, right, snapshot, visibleEvents);
      const routeFactor = buildRouteComparisonFactor(
        routeFactors?.find((item) => item.discard === left),
        routeFactors?.find((item) => item.discard === right),
      );
      const factors = [efficiencyFactor, safetyFactor?.factor, engineFactor?.factor, doraFactor?.factor, routeFactor?.factor].filter((factor): factor is DecisionFactor => Boolean(factor));

      if (!factors.length) {
        continue;
      }

      const preferredComparison =
        engineFactor ??
        safetyFactor ??
        (doraFactor && canFactorDriveConclusion({ candidate: doraFactor.factor, factors, sameEfficiency }) ? doraFactor : undefined) ??
        (routeFactor && canFactorDriveConclusion({ candidate: routeFactor.factor, factors, sameEfficiency }) ? routeFactor : undefined);

      comparisons.push({
        left,
        right,
        sameEfficiency,
        sameSafety: safetyFactor ? false : true,
        mortalRanks: {
          [left]: findEngineRank(left, engine),
          [right]: findEngineRank(right, engine),
        },
        preferredKeepTile: preferredComparison?.preferredKeepTile,
        preferredDiscardTile: preferredComparison?.preferredDiscardTile,
        decidingFactors: factors,
      });
    }
  }

  return comparisons.slice(0, 6);
}

function buildEngineComparisonFactor(left: string, right: string, engine: AnalysisEngineResult) {
  const leftRank = findEngineRank(left, engine);
  const rightRank = findEngineRank(right, engine);

  if (!leftRank || !rightRank || leftRank === rightRank) {
    return null;
  }

  const preferredDiscardTile = leftRank < rightRank ? left : right;
  const preferredKeepTile = preferredDiscardTile === left ? right : left;

  return {
    preferredKeepTile,
    preferredDiscardTile,
    factor: {
      type: "engine" as const,
      strength: "strong" as const,
      preferredKeepTile,
      preferredDiscardTile,
      summary: `当前推荐排序更偏向先切 ${formatTileName(preferredDiscardTile)}，而不是切 ${formatTileName(preferredKeepTile)}。`,
    },
  };
}

function hasSameEfficiency(left: ReturnType<typeof findEfficiency>, right: ReturnType<typeof findEfficiency>) {
  return Boolean(
    left &&
      right &&
      left.shantenAfterDiscard === right.shantenAfterDiscard &&
      left.waitCount === right.waitCount &&
      sameWaitSet(left.waits.map((wait) => wait.tile), right.waits.map((wait) => wait.tile)),
  );
}

function buildEfficiencyFactor(
  left: string,
  right: string,
  leftEfficiency: ReturnType<typeof findEfficiency>,
  rightEfficiency: ReturnType<typeof findEfficiency>,
  sameEfficiency: boolean,
): DecisionFactor | null {
  if (!leftEfficiency || !rightEfficiency) {
    return null;
  }

  if (sameEfficiency) {
    return {
      type: "efficiency",
      strength: "strong",
      summary: `${formatTileName(left)} 与 ${formatTileName(right)} 的向听和受入相同。`,
    };
  }

  if (leftEfficiency.shantenAfterDiscard !== rightEfficiency.shantenAfterDiscard) {
    const better = leftEfficiency.shantenAfterDiscard < rightEfficiency.shantenAfterDiscard ? leftEfficiency : rightEfficiency;
    const worse = better === leftEfficiency ? rightEfficiency : leftEfficiency;
    return {
      type: "efficiency",
      strength: "strong",
      preferredKeepTile: worse.discard,
      preferredDiscardTile: better.discard,
      summary: `牌效差异明显：切 ${formatTileName(better.discard)} 后是 ${formatShanten(better.shantenAfterDiscard)}，优于切 ${formatTileName(worse.discard)} 后的 ${formatShanten(worse.shantenAfterDiscard)}。`,
    };
  }

  const waitDiff = Math.abs(leftEfficiency.waitCount - rightEfficiency.waitCount);
  if (waitDiff >= 2) {
    const better = leftEfficiency.waitCount > rightEfficiency.waitCount ? leftEfficiency : rightEfficiency;
    const worse = better === leftEfficiency ? rightEfficiency : leftEfficiency;
    return {
      type: "efficiency",
      strength: "strong",
      preferredKeepTile: worse.discard,
      preferredDiscardTile: better.discard,
      summary: `牌效差异明显：切 ${formatTileName(better.discard)} 后受入 ${better.waitCount} 枚，多于切 ${formatTileName(worse.discard)} 后的 ${worse.waitCount} 枚。`,
    };
  }

  return {
    type: "efficiency",
    strength: "medium",
    summary: `两者牌效接近：切 ${formatTileName(left)} 后受入 ${leftEfficiency.waitCount} 枚，切 ${formatTileName(right)} 后受入 ${rightEfficiency.waitCount} 枚。`,
  };
}

function buildDoraTileFact(tile: string, currentDoraTiles: string[], visibleCounts: Map<string, number>): DoraTileFact {
  const indicator = previousDoraIndicator(tile);
  const visibleIndicatorCount = visibleCounts.get(indicator) ?? 0;
  const currentDoraCount = currentDoraTiles.filter((item) => item === tile).length;

  return {
    tile,
    indicator,
    visibleIndicatorCount,
    remainingIndicatorCount: Math.max(0, COPIES_PER_TILE - visibleIndicatorCount),
    currentDoraCount,
    labels: [
      currentDoraCount ? `当前宝牌 ${currentDoraCount} 枚` : "当前不是宝牌",
      `成为未来宝牌需要 ${formatTileName(indicator)} 作为指示牌，${formatTileName(indicator)} 已见 ${visibleIndicatorCount} 枚`,
    ],
  };
}

function buildDoraComparisonFactor(left: DoraTileFact | undefined, right: DoraTileFact | undefined) {
  if (!left || !right) {
    return null;
  }

  if (left.currentDoraCount !== right.currentDoraCount) {
    const keep = left.currentDoraCount > right.currentDoraCount ? left : right;
    const discard = keep === left ? right : left;
    return {
      preferredKeepTile: keep.tile,
      preferredDiscardTile: discard.tile,
      factor: {
      type: "current-dora" as const,
      strength: "strong" as const,
      preferredKeepTile: keep.tile,
      preferredDiscardTile: discard.tile,
      summary: `${formatTileName(keep.tile)} 当前宝牌价值高于 ${formatTileName(discard.tile)}。`,
    },
  };
  }

  if (left.remainingIndicatorCount === right.remainingIndicatorCount) {
    return null;
  }

  const keep = left.remainingIndicatorCount > right.remainingIndicatorCount ? left : right;
  const discard = keep === left ? right : left;

  return {
    preferredKeepTile: keep.tile,
    preferredDiscardTile: discard.tile,
    factor: {
      type: "future-dora-potential" as const,
      strength: "weak" as const,
      preferredKeepTile: keep.tile,
      preferredDiscardTile: discard.tile,
      summary: `${formatTileName(keep.tile)} 的未来宝牌潜力略高，因此同牌效下更倾向保留 ${formatTileName(keep.tile)}、先切 ${formatTileName(discard.tile)}。`,
    },
  };
}

function buildRouteComparisonFactor(left: RouteFactorAnalysis | undefined, right: RouteFactorAnalysis | undefined) {
  const routeComparison = compareRouteFactors(left, right);
  if (!routeComparison) {
    return null;
  }

  return {
    preferredKeepTile: routeComparison.preferredKeepTile,
    preferredDiscardTile: routeComparison.preferredDiscardTile,
    factor: {
      type: "route-factor" as const,
      strength: routeComparison.strength,
      preferredKeepTile: routeComparison.preferredKeepTile,
      preferredDiscardTile: routeComparison.preferredDiscardTile,
      summary: routeComparison.summary,
    },
  };
}

function buildSafetyComparisonFactor(left: string, right: string, snapshot?: VisibleAnalysisSnapshot, visibleEvents?: RoundEvent[]) {
  if (!snapshot) {
    return null;
  }

  const riichiSeats = ([0, 1, 2, 3] as const).filter((seat) => snapshot.riichiTiles[seat].length > 0 && seat !== snapshot.targetSeat);
  if (!riichiSeats.length) {
    return null;
  }

  const leftHint = buildTileSafetyHintFromSnapshot({ tile: left, snapshot, visibleEvents });
  const rightHint = buildTileSafetyHintFromSnapshot({ tile: right, snapshot, visibleEvents });
  if (!leftHint || !rightHint) {
    return null;
  }

  const leftRank = safetyRank(leftHint);
  const rightRank = safetyRank(rightHint);
  if (leftRank === rightRank) {
    return null;
  }

  const safer = leftRank > rightRank ? leftHint : rightHint;
  const riskier = safer === leftHint ? rightHint : leftHint;

  return {
    preferredKeepTile: riskier.tile,
    preferredDiscardTile: safer.tile,
    factor: {
      type: "safety" as const,
      strength: "strong" as const,
      preferredKeepTile: riskier.tile,
      preferredDiscardTile: safer.tile,
      summary: `${formatTileName(safer.tile)} 的安全线索更强：${safer.labels.join("；")}；${formatTileName(riskier.tile)} 的安全线索较弱。`,
    },
  };
}

function safetyRank(hint: NonNullable<ReturnType<typeof buildTileSafetyHintFromSnapshot>>) {
  if (hint.labels.some((label) => label.startsWith("对所有立直家现物/通过牌"))) {
    return 3;
  }

  if (hint.tone === "safe") {
    return 2;
  }

  if (hint.tone === "neutral") {
    return 1;
  }

  return 0;
}

function countVisibleTiles(snapshot: VisibleAnalysisSnapshot) {
  const counts = new Map<string, number>();
  const add = (tile: string | undefined) => {
    if (!tile) {
      return;
    }
    const normalized = normalizeTile(tile);
    if (isTileCode(normalized)) {
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  };

  snapshot.targetHand.forEach(add);
  add(snapshot.drawnTile);
  snapshot.doraIndicators.forEach(add);
  Object.values(snapshot.discards).flat().forEach(add);
  Object.values(snapshot.calls)
    .flat()
    .flatMap((call) => call.tiles)
    .forEach(add);

  return counts;
}

function nextInCycle(tile: string, cycle: string[]) {
  const index = cycle.indexOf(tile);
  return index >= 0 ? cycle[(index + 1) % cycle.length] : null;
}

function previousInCycle(tile: string, cycle: string[]) {
  const index = cycle.indexOf(tile);
  return index >= 0 ? cycle[(index + cycle.length - 1) % cycle.length] : null;
}

function findEfficiency(tile: string, analysis: TileEfficiencyAnalysis) {
  return analysis.discardOptions.find((option) => option.discard === tile);
}

function findEngineRank(tile: string, engine: AnalysisEngineResult) {
  const recommendation = engine.recommendations.find((item) => normalizeTile(item.tile ?? "") === tile);
  return recommendation?.rank ?? null;
}

function sameWaitSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((tile, index) => tile === sortedRight[index]);
}

function normalizeTile(tile: string) {
  return tile.startsWith("0") ? `5${tile.slice(1)}` : tile;
}

function isTileCode(tile: string) {
  return /^[1-9][mps]$/.test(tile) || /^[1-7]z$/.test(tile);
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

function formatShanten(value: number) {
  if (value <= 0) {
    return "听牌";
  }

  return `${value} 向听`;
}
