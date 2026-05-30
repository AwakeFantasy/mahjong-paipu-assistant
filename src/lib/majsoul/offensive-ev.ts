import { analyzeTileEfficiency, type TileEfficiencyDiscard, type TileEfficiencyWait } from "./tile-efficiency";

export type OffensiveEvScoreMeld = {
  type: "chi" | "pon" | "kan" | "shouminkan" | "ankan";
  tiles: string[];
  opened?: boolean;
};

export type OffensiveEvScoreRequest = {
  kind: "ron" | "tsumo";
  isTsumo?: boolean;
  tiles: string[];
  winTile: string;
  melds?: OffensiveEvScoreMeld[];
  doraIndicators?: string[];
  roundWind?: "E" | "S" | "W" | "N";
  seatWind?: "E" | "S" | "W" | "N";
  allowRiichi?: boolean;
  hasOpenTanyao?: boolean;
  hasAkaDora?: boolean;
};

export type OffensiveEvScoreResponse = {
  valid: boolean;
  point: number;
  total?: number;
};

export type OffensiveEvScoreFn = (request: OffensiveEvScoreRequest) => Promise<OffensiveEvScoreResponse | null>;

export type OffensiveEvBranch = {
  draw: string;
  remaining: number;
  tenpaiWaitCount: number;
  averageScore: number;
  bestDiscard?: string;
};

export type OffensiveEvOption = {
  discard: string;
  shantenAfterDiscard: number;
  ukeire: number;
  waitCount: number;
  averageScore: number;
  offensiveEv: number;
  waits: string[];
  furitenWaits: string[];
  branches: OffensiveEvBranch[];
  notes: string[];
};

export type OffensiveEvAnalysis = {
  status: "empty" | "unsupported" | "ready";
  options: OffensiveEvOption[];
  message?: string;
};

export type OffensiveEvInput = {
  tiles: string[];
  visibleTiles?: string[];
  doraIndicators?: string[];
  openMeldCount?: number;
  ownDiscards?: string[];
  ownCalls?: Array<{ callType: string; tiles: string[] }>;
  roundWind?: "E" | "S" | "W" | "N";
  seatWind?: "E" | "S" | "W" | "N";
  maxDepth?: number;
  beamWidth?: number;
  scoreWinningHand?: OffensiveEvScoreFn;
};

type SearchConfig = {
  maxDepth: number;
  beamWidth: number;
  drawBranchLimit: number;
  deepRootLimit: number;
};

type SearchContext = {
  visibleTiles: string[];
  doraIndicators: string[];
  doraTiles: string[];
  openMeldCount: number;
  ownDiscards: Set<string>;
  scoreMelds: OffensiveEvScoreMeld[];
  scoreWinningHand?: OffensiveEvScoreFn;
  isOpenHand: boolean;
  roundWind: "E" | "S" | "W" | "N";
  seatWind: "E" | "S" | "W" | "N";
  config: SearchConfig;
  memo: Map<string, Promise<SearchResult>>;
};

type SearchResult = {
  value: number;
  waitCount: number;
  averageScore: number;
  furitenWaits: string[];
  branches: OffensiveEvBranch[];
};

type TenpaiEvaluation = {
  value: number;
  waitCount: number;
  averageScore: number;
  furitenWaits: string[];
  usedRuleScorer: boolean;
};

export async function analyzeOffensiveEv({
  tiles,
  visibleTiles = [],
  doraIndicators = [],
  openMeldCount = 0,
  ownDiscards = [],
  ownCalls = [],
  roundWind = "E",
  seatWind = "E",
  maxDepth = 2,
  beamWidth = 3,
  scoreWinningHand,
}: OffensiveEvInput): Promise<OffensiveEvAnalysis> {
  const baseEfficiency = analyzeTileEfficiency(tiles, visibleTiles);

  if (baseEfficiency.status !== "ready") {
    return {
      status: baseEfficiency.status,
      options: [],
      message: baseEfficiency.message,
    };
  }

  if (!baseEfficiency.discardOptions.length) {
    return {
      status: "unsupported",
      options: [],
      message: "Current hand shape has no discard options for offensive EV.",
    };
  }

  const doraTiles = doraIndicators.map(nextDoraTile).filter((tile): tile is string => Boolean(tile));
  const normalizedTiles = tiles.map(normalizeTile).filter(Boolean);
  const scoreMelds = ownCalls.map(toScoreMeld).filter((item): item is OffensiveEvScoreMeld => Boolean(item));
  const isOpenHand = scoreMelds.some((meld) => meld.opened !== false) || openMeldCount > 0;
  const config: SearchConfig = {
    maxDepth: clampInteger(maxDepth, 0, 4),
    beamWidth: clampInteger(beamWidth, 1, 6),
    drawBranchLimit: 1,
    deepRootLimit: 3,
  };
  const searchContext: SearchContext = {
    visibleTiles,
    doraIndicators,
    doraTiles,
    openMeldCount: Math.max(openMeldCount, scoreMelds.length),
    ownDiscards: new Set(ownDiscards.map(normalizeTile)),
    scoreMelds,
    scoreWinningHand,
    isOpenHand,
    roundWind,
    seatWind,
    config,
    memo: new Map(),
  };

  const options = (await Promise.all(baseEfficiency.discardOptions
    .map((option, index) => buildEvOption({
      option,
      tiles: normalizedTiles,
      searchContext,
      deepSearch: index < config.deepRootLimit,
    }))))
    .sort(compareOffensiveEvOptions);

  return {
    status: "ready",
    options,
  };
}

function compareOffensiveEvOptions(left: OffensiveEvOption, right: OffensiveEvOption) {
  const leftComparable = isComparableEvOption(left);
  const rightComparable = isComparableEvOption(right);

  if (leftComparable !== rightComparable) {
    return Number(rightComparable) - Number(leftComparable);
  }

  if (leftComparable && rightComparable) {
    return right.offensiveEv - left.offensiveEv || left.shantenAfterDiscard - right.shantenAfterDiscard || right.ukeire - left.ukeire || tileSortKey(left.discard) - tileSortKey(right.discard);
  }

  return left.shantenAfterDiscard - right.shantenAfterDiscard || right.ukeire - left.ukeire || right.averageScore - left.averageScore || tileSortKey(left.discard) - tileSortKey(right.discard);
}

function isComparableEvOption(option: Pick<OffensiveEvOption, "shantenAfterDiscard">) {
  return option.shantenAfterDiscard <= 1;
}

async function buildEvOption({
  option,
  tiles,
  searchContext,
  deepSearch,
}: {
  option: TileEfficiencyDiscard;
  tiles: string[];
  searchContext: SearchContext;
  deepSearch: boolean;
}): Promise<OffensiveEvOption> {
  const afterDiscard = removeOneTile(tiles, option.discard);
  const baseScore = estimateAverageScore({
    tiles: afterDiscard,
    waits: option.waits,
    doraTiles: searchContext.doraTiles,
    openMeldCount: searchContext.openMeldCount,
  });

  if (option.shantenAfterDiscard === 0) {
    const evaluated = await evaluateTenpaiValue(afterDiscard, option.waits, searchContext);

    return {
      discard: option.discard,
      shantenAfterDiscard: option.shantenAfterDiscard,
      ukeire: option.waitCount,
      waitCount: evaluated.waitCount,
      averageScore: evaluated.averageScore,
      offensiveEv: evaluated.value,
      waits: option.waits.map((wait) => wait.tile),
      furitenWaits: evaluated.furitenWaits,
      branches: [],
      notes: buildNotes(option, evaluated.averageScore, searchContext, evaluated),
    };
  }

  if (deepSearch && option.shantenAfterDiscard > 0 && searchContext.config.maxDepth > 0) {
    const result = await searchAfterDiscard(afterDiscard, Math.min(searchContext.config.maxDepth, option.shantenAfterDiscard), searchContext);
    const shallowValue = estimateDistantValue({ shanten: option.shantenAfterDiscard, ukeire: option.waitCount, averageScore: baseScore, tiles: afterDiscard });
    const offensiveEv = result.value || shallowValue;

    return {
      discard: option.discard,
      shantenAfterDiscard: option.shantenAfterDiscard,
      ukeire: option.waitCount,
      waitCount: result.waitCount,
      averageScore: result.averageScore || Math.round(baseScore * Math.max(0.2, 1 / (option.shantenAfterDiscard + 2))),
      offensiveEv,
      waits: option.waits.map((wait) => wait.tile),
      furitenWaits: result.furitenWaits,
      branches: result.branches.slice(0, 6),
      notes: buildNotes(option, result.averageScore, searchContext, result),
    };
  }

  return {
    discard: option.discard,
    shantenAfterDiscard: option.shantenAfterDiscard,
    ukeire: option.waitCount,
    waitCount: 0,
    averageScore: Math.round(baseScore * Math.max(0.2, 1 / (option.shantenAfterDiscard + 2))),
    offensiveEv: estimateDistantValue({ shanten: option.shantenAfterDiscard, ukeire: option.waitCount, averageScore: baseScore, tiles: afterDiscard }),
    waits: option.waits.map((wait) => wait.tile),
    furitenWaits: [],
    branches: [],
    notes: [option.shantenAfterDiscard > 1 ? "Shallow estimate; deep search is reserved for top tile-efficiency candidates." : "Shallow estimate for non-beam candidate."],
  };
}

async function searchAfterDiscard(tiles: string[], depth: number, context: SearchContext): Promise<SearchResult> {
  const normalizedTiles = tiles.map(normalizeTile).sort(tileSortCompare);
  const cacheKey = `${normalizedTiles.join("")}|${depth}`;
  const cached = context.memo.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = searchAfterDiscardUncached(normalizedTiles, depth, context);
  context.memo.set(cacheKey, promise);
  return promise;
}

async function searchAfterDiscardUncached(normalizedTiles: string[], depth: number, context: SearchContext): Promise<SearchResult> {
  const efficiency = analyzeTileEfficiency(normalizedTiles, context.visibleTiles);
  if (efficiency.status !== "ready") {
    return { value: 0, waitCount: 0, averageScore: 0, furitenWaits: [], branches: [] };
  }

  if (efficiency.shanten === 0) {
    const evaluated = await evaluateTenpaiValue(normalizedTiles, efficiency.waits, context);
    return { value: evaluated.value, waitCount: evaluated.waitCount, averageScore: evaluated.averageScore, furitenWaits: evaluated.furitenWaits, branches: [] };
  }

  if (depth <= 0 || !efficiency.waits.length) {
    const baseScore = estimateAverageScore({
      tiles: normalizedTiles,
      waits: efficiency.waits,
      doraTiles: context.doraTiles,
      openMeldCount: context.openMeldCount,
    });
    const waitCount = sumRemaining(efficiency.waits);
    return {
      value: estimateDistantValue({ shanten: efficiency.shanten, ukeire: waitCount, averageScore: baseScore, tiles: normalizedTiles }),
      waitCount: 0,
      averageScore: baseScore,
      furitenWaits: [],
      branches: [],
    };
  }

  const drawBranches = efficiency.waits.slice(0, context.config.drawBranchLimit);
  let weightedValue = 0;
  let weightedWaits = 0;
  let weightedScore = 0;
  let totalDraws = 0;
  const branches: OffensiveEvBranch[] = [];
  const furitenWaits = new Set<string>();

  for (const draw of drawBranches) {
    const afterDraw = [...normalizedTiles, draw.tile];
    const afterDrawEfficiency = analyzeTileEfficiency(afterDraw, context.visibleTiles);
    const bestShanten = afterDrawEfficiency.discardOptions[0]?.shantenAfterDiscard;
    const candidates = afterDrawEfficiency.discardOptions
      .filter((candidate) => bestShanten === undefined || candidate.shantenAfterDiscard === bestShanten)
      .slice(0, context.config.beamWidth);
    const best = (await Promise.all(candidates
      .map(async (candidate) => {
        const child =
          depth > 2
            ? await searchAfterDiscard(removeOneTile(afterDraw, candidate.discard), depth - 1, context)
            : await estimateCandidateAfterDraw(afterDraw, candidate, context);
        return { candidate, child };
      })))
      .sort((left, right) => right.child.value - left.child.value || left.candidate.shantenAfterDiscard - right.candidate.shantenAfterDiscard || right.candidate.waitCount - left.candidate.waitCount)[0];

    if (!best) {
      continue;
    }

    totalDraws += draw.remaining;
    weightedValue += draw.remaining * best.child.value;
    weightedWaits += draw.remaining * best.child.waitCount;
    weightedScore += draw.remaining * best.child.averageScore;
    best.child.furitenWaits.forEach((tile) => furitenWaits.add(tile));
    branches.push({
      draw: draw.tile,
      remaining: draw.remaining,
      tenpaiWaitCount: best.child.waitCount,
      averageScore: best.child.averageScore,
      bestDiscard: best.candidate.discard,
    });
  }

  const result = {
    value: totalDraws ? Math.round(weightedValue / Math.max(1, 18 - depth * 4)) : 0,
    waitCount: totalDraws ? Math.round(weightedWaits / totalDraws) : 0,
    averageScore: totalDraws ? Math.round(weightedScore / totalDraws) : 0,
    furitenWaits: [...furitenWaits],
    branches,
  };
  return result;
}

async function estimateCandidateAfterDraw(afterDraw: string[], candidate: TileEfficiencyDiscard, context: SearchContext): Promise<SearchResult> {
  const afterDiscard = removeOneTile(afterDraw, candidate.discard);
  const averageScore = estimateAverageScore({ tiles: afterDiscard, waits: candidate.waits, doraTiles: context.doraTiles, openMeldCount: context.openMeldCount });

  if (candidate.shantenAfterDiscard === 0) {
    const evaluated = await evaluateTenpaiValue(afterDiscard, candidate.waits, context);
    return {
      value: evaluated.value,
      waitCount: evaluated.waitCount,
      averageScore: evaluated.averageScore,
      furitenWaits: evaluated.furitenWaits,
      branches: [],
    };
  }

  return {
    value: estimateDistantValue({ shanten: candidate.shantenAfterDiscard, ukeire: candidate.waitCount, averageScore, tiles: afterDiscard }),
    waitCount: candidate.waitCount,
    averageScore,
    furitenWaits: [],
    branches: [],
  };
}

async function evaluateTenpaiValue(tiles: string[], waits: TileEfficiencyWait[], context: SearchContext): Promise<TenpaiEvaluation> {
  const fallbackScore = estimateAverageScore({ tiles, waits, doraTiles: context.doraTiles, openMeldCount: context.openMeldCount });
  const waitCount = sumRemaining(waits);

  if (!waits.length || waitCount <= 0) {
    return { value: 0, waitCount: 0, averageScore: fallbackScore, furitenWaits: [], usedRuleScorer: false };
  }

  let usedRuleScorer = false;
  let weightedValue = 0;
  const furitenWaits: string[] = [];

  for (const wait of waits) {
    const furiten = context.ownDiscards.has(normalizeTile(wait.tile));
    const outcome = await scoreWaitOutcome(tiles, wait.tile, context);
    const point = outcome
      ? furiten
        ? outcome.tsumoPoint * 0.25
        : outcome.ronPoint * 0.75 + outcome.tsumoPoint * 0.25
      : fallbackScore * (furiten ? 0.25 : 1);

    if (outcome) {
      usedRuleScorer = true;
    }

    if (furiten) {
      furitenWaits.push(wait.tile);
    }

    weightedValue += wait.remaining * point;
  }

  return {
    value: Math.round(weightedValue),
    waitCount,
    averageScore: Math.round(weightedValue / waitCount),
    furitenWaits: [...new Set(furitenWaits)],
    usedRuleScorer,
  };
}

async function scoreWaitOutcome(tiles: string[], waitTile: string, context: SearchContext) {
  if (!context.scoreWinningHand) {
    return null;
  }

  const scoringTiles = [...tiles, waitTile, ...context.scoreMelds.flatMap((meld) => meld.tiles)];
  const baseRequest = {
    tiles: scoringTiles,
    winTile: waitTile,
    melds: context.scoreMelds,
    doraIndicators: context.doraIndicators,
    roundWind: context.roundWind,
    seatWind: context.seatWind,
    allowRiichi: !context.isOpenHand,
    hasOpenTanyao: true,
    hasAkaDora: true,
  };
  const [ron, tsumo] = await Promise.all([
    context.scoreWinningHand({ ...baseRequest, kind: "ron", isTsumo: false }),
    context.scoreWinningHand({ ...baseRequest, kind: "tsumo", isTsumo: true }),
  ]);

  if (ron === null && tsumo === null) {
    return null;
  }

  return {
    ronPoint: scorePoint(ron),
    tsumoPoint: scorePoint(tsumo),
    ron,
    tsumo,
  };
}

function scorePoint(result: OffensiveEvScoreResponse | null) {
  if (!result?.valid) {
    return 0;
  }

  return result.point || result.total || 0;
}

function estimateDistantValue({
  shanten,
  ukeire,
  averageScore,
  tiles,
}: {
  shanten: number;
  ukeire: number;
  averageScore: number;
  tiles: string[];
}) {
  if (shanten <= 0) {
    return Math.max(0, Math.round(ukeire * averageScore));
  }

  const pairCount = countPairs(tiles);
  const doraLikeCount = tiles.filter((tile) => /^0[mps]$|^5[mps]r$/i.test(tile)).length;
  const shapeBonus = Math.min(8, pairCount * 2 + doraLikeCount * 2 + countAdjacentSuitLinks(tiles));
  const effectiveUkeire = Math.max(1, ukeire) + shapeBonus;
  const distantPenalty = Math.max(12, (shanten + 1) * (shanten + 1) * 10);

  return Math.max(1, Math.round((effectiveUkeire * averageScore) / distantPenalty));
}

function estimateAverageScore({
  tiles,
  waits,
  doraTiles,
  openMeldCount,
}: {
  tiles: string[];
  waits: TileEfficiencyWait[];
  doraTiles: string[];
  openMeldCount: number;
}) {
  const doraCount = tiles.reduce((count, tile) => count + (doraTiles.includes(normalizeTile(tile)) ? 1 : 0), 0);
  const redFiveCount = tiles.filter((tile) => /^0[mps]$|^5[mps]r$/i.test(tile)).length;
  const waitQualityBonus = waits.length >= 2 ? 500 : waits.some((wait) => isCentralTile(wait.tile)) ? 250 : 0;
  const tanyaoBonus = tiles.length && tiles.every(isSimpleTile) ? 700 : 0;
  const closedBonus = openMeldCount ? 0 : 900;
  const pairBonus = countPairs(tiles) >= 1 ? 200 : 0;
  const terminalPenalty = waits.every((wait) => isTerminalOrHonor(wait.tile)) ? -300 : 0;

  return Math.max(1000, Math.round(1300 + closedBonus + tanyaoBonus + pairBonus + waitQualityBonus + terminalPenalty + (doraCount + redFiveCount) * 1200));
}

function buildNotes(option: TileEfficiencyDiscard, averageScore: number, context: SearchContext, evaluation?: Pick<TenpaiEvaluation | SearchResult, "furitenWaits"> & { usedRuleScorer?: boolean }) {
  const notes = [
    option.shantenAfterDiscard === 0 ? "Tenpai branch uses current waits as winning tiles." : `Beam search depth ${context.config.maxDepth}, width ${context.config.beamWidth}.`,
    `Approx average score ${averageScore}.`,
  ];

  if (evaluation?.usedRuleScorer) {
    notes.push("Rule scorer: MahjongRepository/mahjong.");
  }

  if (evaluation?.furitenWaits.length) {
    notes.push(`Self-discard furiten waits: ${evaluation.furitenWaits.join(",")}.`);
  }

  if (context.doraTiles.length) {
    notes.push(`Dora tiles considered: ${context.doraTiles.join(",")}.`);
  }

  if (context.openMeldCount) {
    notes.push("Open hand: riichi-style closed bonus is not applied.");
  }

  return notes;
}

function toScoreMeld(call: { callType: string; tiles: string[] }): OffensiveEvScoreMeld | null {
  const callType = call.callType.toLowerCase();
  const tiles = call.tiles.map(normalizeTile).filter(Boolean);

  if (tiles.length < 3) {
    return null;
  }

  if (/chi|吃/.test(callType)) {
    return { type: "chi", tiles, opened: true };
  }

  if (/pon|碰/.test(callType)) {
    return { type: "pon", tiles, opened: true };
  }

  if (/加|shouminkan|kakan/.test(callType)) {
    return { type: "shouminkan", tiles, opened: true };
  }

  if (/暗|ankan/.test(callType)) {
    return { type: "ankan", tiles, opened: false };
  }

  if (/kan|杠|槓/.test(callType)) {
    return { type: "kan", tiles, opened: true };
  }

  return null;
}

function nextDoraTile(indicator: string) {
  const tile = normalizeTile(indicator);
  const parsed = parseTile(tile);
  if (!parsed) {
    return "";
  }

  if (parsed.suit === "z") {
    if (parsed.rank <= 4) {
      return `${(parsed.rank % 4) + 1}z`;
    }

    return `${parsed.rank === 7 ? 5 : parsed.rank + 1}z`;
  }

  return `${(parsed.rank % 9) + 1}${parsed.suit}`;
}

function sumRemaining(waits: TileEfficiencyWait[]) {
  return waits.reduce((sum, wait) => sum + wait.remaining, 0);
}

function removeOneTile(tiles: string[], discard: string) {
  const normalizedDiscard = normalizeTile(discard);
  const index = tiles.findIndex((tile) => normalizeTile(tile) === normalizedDiscard);
  if (index < 0) {
    return [...tiles];
  }

  return tiles.slice(0, index).concat(tiles.slice(index + 1));
}

function countPairs(tiles: string[]) {
  const counts = new Map<string, number>();
  for (const tile of tiles.map(normalizeTile)) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }

  return [...counts.values()].filter((count) => count >= 2).length;
}

function countAdjacentSuitLinks(tiles: string[]) {
  const bySuit: Record<"m" | "p" | "s", Set<number>> = {
    m: new Set(),
    p: new Set(),
    s: new Set(),
  };

  for (const tile of tiles.map(normalizeTile)) {
    const parsed = parseTile(tile);
    if (!parsed || parsed.suit === "z") {
      continue;
    }

    bySuit[parsed.suit].add(parsed.rank);
  }

  return (["m", "p", "s"] as const).reduce((sum, suit) => {
    let links = 0;
    for (let rank = 1; rank <= 8; rank += 1) {
      if (bySuit[suit].has(rank) && bySuit[suit].has(rank + 1)) {
        links += 1;
      }
    }

    return sum + links;
  }, 0);
}

function isSimpleTile(tile: string) {
  const parsed = parseTile(normalizeTile(tile));
  return Boolean(parsed && parsed.suit !== "z" && parsed.rank >= 2 && parsed.rank <= 8);
}

function isCentralTile(tile: string) {
  const parsed = parseTile(normalizeTile(tile));
  return Boolean(parsed && parsed.suit !== "z" && parsed.rank >= 3 && parsed.rank <= 7);
}

function isTerminalOrHonor(tile: string) {
  const parsed = parseTile(normalizeTile(tile));
  return Boolean(!parsed || parsed.suit === "z" || parsed.rank === 1 || parsed.rank === 9);
}

function normalizeTile(tile: string) {
  const normalized = tile.trim().toLowerCase();
  if (/^0[mps]$/.test(normalized)) {
    return `5${normalized[1]}`;
  }

  if (/^5[mps]r$/.test(normalized)) {
    return `5${normalized[1]}`;
  }

  return normalized;
}

function parseTile(tile: string) {
  const match = /^([1-9])([mpsz])$/.exec(tile);
  if (!match) {
    return null;
  }

  const rank = Number(match[1]);
  const suit = match[2] as "m" | "p" | "s" | "z";
  if (suit === "z" && rank > 7) {
    return null;
  }

  return { rank, suit };
}

function tileSortKey(tile: string) {
  const parsed = parseTile(normalizeTile(tile));
  if (!parsed) {
    return 999;
  }

  const suitIndex = parsed.suit === "m" ? 0 : parsed.suit === "p" ? 1 : parsed.suit === "s" ? 2 : 3;
  return suitIndex * 10 + parsed.rank;
}

function tileSortCompare(left: string, right: string) {
  return tileSortKey(left) - tileSortKey(right);
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.floor(value)));
}
