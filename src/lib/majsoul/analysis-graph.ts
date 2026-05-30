import { buildCandidateComparisons, buildDoraAnalysis } from "./dora-analysis";
import { canFactorDriveConclusion, normalizeDecisionFactor } from "./analysis-factors";
import { classifyAnalysisErrorProfile } from "./analysis-error-profile";
import { buildDecisionContext, formatDecisionContextSummary } from "./decision-context";
import { retrieveKnowledgeCases } from "./knowledge-cases";
import { analyzeOffensiveEv, type OffensiveEvAnalysis, type OffensiveEvScoreFn } from "./offensive-ev";
import { analyzeRouteFactors, summarizeRouteFactorAnalysis } from "./route-factors";
import { buildTileSafetyHintFromSnapshot } from "./safety-hints";
import { analyzeTileEfficiency, type TileEfficiencyAnalysis, type TileEfficiencyDiscard } from "./tile-efficiency";
import { formatTileName, formatTileNames } from "./tile-format";
import type {
  AnalysisChatStructured,
  AnalysisContext,
  AnalysisEngineResult,
  AnalysisIntent,
  AnalysisEvidenceItem,
  AnalysisKnowledgeCase,
  AnalysisTableInferenceContext,
  AnalysisErrorProfile,
  AnalysisToolName,
  AnalysisToolPlan,
  CandidateComparison,
  CurrentHandAnalysisPackage,
  DoraAnalysis,
  RoundEvent,
  VisibleAnalysisSnapshot,
} from "./types";

type PreferredCandidateComparison = CandidateComparison & {
  preferredDiscardTile: string;
  preferredKeepTile: string;
};

type CandidateCounterfactualSummary = NonNullable<CandidateComparison["counterfactualSummary"]>;

function buildEvidenceCatalog({
  snapshot,
  decisionContext,
  engineTop,
  tileEfficiency,
  offensiveEv,
  routeFactors,
  candidateHints,
  candidateComparisons,
  knowledgeCases,
  tableInference,
}: {
  snapshot: AnalysisContext["snapshot"];
  decisionContext?: AnalysisContext["decisionContext"];
  engineTop: Array<{ action: string; tile?: string; label?: string }>;
  tileEfficiency: CurrentHandAnalysisPackage["tileEfficiency"] | TileEfficiencyAnalysis;
  offensiveEv?: CurrentHandAnalysisPackage["offensiveEv"] | OffensiveEvAnalysis;
  routeFactors?: CurrentHandAnalysisPackage["routeFactors"];
  candidateHints: CurrentHandAnalysisPackage["safety"]["candidateHints"];
  candidateComparisons: CandidateComparison[];
  knowledgeCases: AnalysisKnowledgeCase[];
  tableInference?: AnalysisTableInferenceContext;
}): AnalysisEvidenceItem[] {
  const efficiencyDiscards = getEvidenceEfficiencyDiscards(tileEfficiency);
  const items: AnalysisEvidenceItem[] = [
    {
      id: "snapshot:round",
      kind: "snapshot",
      text: `${snapshot.round.title}，光标 ${snapshot.cursor}/${snapshot.maxCursor}`,
    },
    {
      id: "snapshot:hand",
      kind: "snapshot",
      text: `目标手牌 ${formatTileNames(snapshot.targetHand) || "暂无"}`,
    },
    {
      id: "snapshot:dora",
      kind: "snapshot",
      text: `宝牌指示牌 ${formatTileNames(snapshot.doraIndicators) || "暂无"}`,
    },
    ...(decisionContext?.applies
      ? [
          {
            id: "decisionContext",
            kind: "decisionContext",
            text: formatDecisionContextSummary(decisionContext),
          } satisfies AnalysisEvidenceItem,
        ]
      : []),
    ...(tableInference?.applies
      ? [
          {
            id: "tableInference:visibleTable",
            kind: "tableInference",
            text: tableInference.reason,
          } satisfies AnalysisEvidenceItem,
        ]
      : []),
    ...engineTop.flatMap((recommendation) =>
      recommendation.tile
        ? [
            {
              id: `engine:${recommendation.action}:${recommendation.tile}`,
              kind: "engine",
              text: `引擎推荐 ${recommendation.label}`,
            } satisfies AnalysisEvidenceItem,
          ]
        : [],
    ),
    ...efficiencyDiscards.map(
      (option) =>
        ({
          id: `tileEfficiency:${option.discard}`,
          kind: "tileEfficiency",
          text: `切 ${formatTileName(option.discard)} 后 ${formatShanten(option.shantenAfterDiscard)}，剩余受入 ${option.waitCount} 枚`,
        }) satisfies AnalysisEvidenceItem,
    ),
    ...getEvidenceOffensiveEvDiscards(offensiveEv).map(
      (option) =>
        ({
          id: `offensiveEv:${option.discard}`,
          kind: "offensiveEv",
          text:
            option.shantenAfterDiscard <= 1
              ? `切 ${formatTileName(option.discard)} 的实验性进攻EV ${option.offensiveEv}，预计打点 ${option.averageScore}，进张 ${option.ukeire} 枚`
              : `切 ${formatTileName(option.discard)} 的远手路线参考 ${option.offensiveEv}，预计打点 ${option.averageScore}，进张 ${option.ukeire} 枚`,
        }) satisfies AnalysisEvidenceItem,
    ),
    ...(routeFactors?.topDiscards ?? []).map(
      (item) =>
        ({
          id: `routeFactor:${item.discard}`,
          kind: "routeFactor",
          text: summarizeRouteFactorAnalysis(item),
        }) satisfies AnalysisEvidenceItem,
    ),
    ...candidateHints.map(
      (hint) =>
        ({
          id: `safety:${hint.tile}`,
          kind: "safety",
          text: `${formatTileName(hint.tile)}：${hint.labels.join("、")}`,
        }) satisfies AnalysisEvidenceItem,
    ),
    ...candidateComparisons.map(
      (comparison) =>
        ({
          id: `comparison:${comparison.left}:${comparison.right}`,
          kind: "comparison",
          text: `${formatTileName(comparison.left)} vs ${formatTileName(comparison.right)}：${comparison.decidingFactors.map((factor) => factor.summary).join("；")}${comparison.counterfactualSummary ? `；反事实：${formatCounterfactualSummary(comparison.counterfactualSummary)}` : ""}`,
        }) satisfies AnalysisEvidenceItem,
    ),
    ...knowledgeCases.map(
      (item) =>
        ({
          id: `knowledgeCase:${item.id}`,
          kind: "knowledgeCase",
          text: item.positiveExplanation,
          source: item.sources?.[0]
            ? {
                title: item.sources[0].title,
                url: item.sources[0].url,
              }
            : undefined,
        }) satisfies AnalysisEvidenceItem,
    ),
  ];

  return items;
}

function getEvidenceEfficiencyDiscards(tileEfficiency: CurrentHandAnalysisPackage["tileEfficiency"] | TileEfficiencyAnalysis) {
  if ("topDiscards" in tileEfficiency) {
    return tileEfficiency.topDiscards;
  }

  return tileEfficiency.discardOptions.slice(0, 6) satisfies TileEfficiencyDiscard[];
}

function getEvidenceOffensiveEvDiscards(offensiveEv: CurrentHandAnalysisPackage["offensiveEv"] | OffensiveEvAnalysis | undefined) {
  if (!offensiveEv || offensiveEv.status !== "ready") {
    return [];
  }

  if ("topDiscards" in offensiveEv) {
    return offensiveEv.topDiscards;
  }

  return offensiveEv.options.slice(0, 6);
}

function buildCounterfactualSummary({
  comparison,
  tileEfficiency,
  offensiveEv,
  doraAnalysis,
  routeFactors,
  snapshot,
  visibleEvents,
  engineTop,
}: {
  comparison: CandidateComparison;
  tileEfficiency: TileEfficiencyAnalysis;
  offensiveEv: OffensiveEvAnalysis;
  doraAnalysis: DoraAnalysis;
  routeFactors: NonNullable<CurrentHandAnalysisPackage["routeFactors"]>["topDiscards"];
  snapshot: VisibleAnalysisSnapshot;
  visibleEvents: RoundEvent[];
  engineTop: AnalysisEngineResult["recommendations"];
}): CandidateCounterfactualSummary {
  const engineDiscard = resolveEnginePreferredDiscard(comparison, engineTop);
  const factors: CandidateCounterfactualSummary["factors"] = [
    buildEfficiencyCounterfactual(comparison, tileEfficiency, engineDiscard),
    buildSafetyCounterfactual(comparison, snapshot, visibleEvents, engineDiscard),
    buildDoraCounterfactual(comparison, doraAnalysis, engineDiscard),
    ...buildRouteCounterfactual(comparison, routeFactors, engineDiscard),
    buildOffensiveEvCounterfactual(comparison, offensiveEv, engineDiscard),
  ];
  const hasDecisiveSupport = factors.some((factor) => factor.relationToEngine === "supports" && factor.strength !== "weak");
  const hasStrongOpposition = factors.some((factor) => factor.relationToEngine === "opposes" && factor.strength === "strong");

  return {
    engineOrder: engineDiscard
      ? `引擎排序当前更靠前的是切 ${formatTileName(engineDiscard)}。`
      : `引擎排序没有给出 ${formatTileName(comparison.left)} 和 ${formatTileName(comparison.right)} 的可比较先后。`,
    boundary: !hasDecisiveSupport || hasStrongOpposition
      ? "本地可验证因素已经列在上面；如果这些因素仍不足以解释引擎的排序差异，就只能认为引擎还综合了模型内部权重，当前系统不硬猜。"
      : undefined,
    factors,
  };
}

function buildEfficiencyCounterfactual(comparison: CandidateComparison, tileEfficiency: TileEfficiencyAnalysis, engineDiscard: string | undefined): CandidateCounterfactualSummary["factors"][number] {
  const factor = comparison.decidingFactors.find((item) => item.type === "efficiency");
  const left = tileEfficiency.discardOptions.find((option) => option.discard === comparison.left);
  const right = tileEfficiency.discardOptions.find((option) => option.discard === comparison.right);
  const evidence = factor?.summary ? [factor.summary] : [left && right ? `切 ${formatTileName(left.discard)} 后 ${formatShanten(left.shantenAfterDiscard)}、受入 ${left.waitCount} 枚；切 ${formatTileName(right.discard)} 后 ${formatShanten(right.shantenAfterDiscard)}、受入 ${right.waitCount} 枚。` : "本地牌效工具没有给出这两个候选的完整对照。"];
  const preferred = factor?.preferredDiscardTile;

  return {
    id: "efficiency",
    label: "只看牌效",
    verdict: preferred ? `切 ${formatTileName(preferred)} 更优` : "接近 / 无明显差异",
    evidence,
    relationToEngine: relationToEngine(preferred, engineDiscard),
    strength: factor ? normalizeDecisionFactor(factor).strength : undefined,
    preferredDiscardTile: preferred,
  };
}

function buildSafetyCounterfactual(
  comparison: CandidateComparison,
  snapshot: VisibleAnalysisSnapshot,
  visibleEvents: RoundEvent[],
  engineDiscard: string | undefined,
): CandidateCounterfactualSummary["factors"][number] {
  const factor = comparison.decidingFactors.find((item) => item.type === "safety");
  const riichiSeats = ([0, 1, 2, 3] as const).filter((seat) => snapshot.riichiTiles[seat].length > 0 && seat !== snapshot.targetSeat);
  const leftHint = buildTileSafetyHintFromSnapshot({ tile: comparison.left, snapshot, visibleEvents });
  const rightHint = buildTileSafetyHintFromSnapshot({ tile: comparison.right, snapshot, visibleEvents });
  const evidence = factor?.summary
    ? [factor.summary]
    : riichiSeats.length
      ? [
          leftHint ? `${formatTileName(leftHint.tile)}：${leftHint.labels.join("、")}` : `${formatTileName(comparison.left)}：没有明确安全线索`,
          rightHint ? `${formatTileName(rightHint.tile)}：${rightHint.labels.join("、")}` : `${formatTileName(comparison.right)}：没有明确安全线索`,
        ]
      : ["当前无人立直，本地安全工具没有识别到这两个候选的明确安全差异。"];
  const preferred = factor?.preferredDiscardTile;

  return {
    id: "safety",
    label: "只看安全",
    verdict: preferred ? `切 ${formatTileName(preferred)} 更安全` : "接近 / 无明显差异",
    evidence,
    relationToEngine: relationToEngine(preferred, engineDiscard),
    strength: factor ? normalizeDecisionFactor(factor).strength : undefined,
    preferredDiscardTile: preferred,
  };
}

function buildDoraCounterfactual(comparison: CandidateComparison, doraAnalysis: DoraAnalysis, engineDiscard: string | undefined): CandidateCounterfactualSummary["factors"][number] {
  const factor = comparison.decidingFactors.find((item) => item.type === "current-dora" || item.type === "future-dora-potential");
  const left = doraAnalysis.candidateFacts.find((fact) => fact.tile === comparison.left);
  const right = doraAnalysis.candidateFacts.find((fact) => fact.tile === comparison.right);
  const evidence = factor?.summary
    ? [factor.summary]
    : [left ? `${formatTileName(left.tile)}：${left.labels.join("、")}` : "", right ? `${formatTileName(right.tile)}：${right.labels.join("、")}` : ""].filter(Boolean);
  const preferred = factor?.preferredDiscardTile;

  return {
    id: "dora",
    label: "只看宝牌",
    verdict: preferred && factor?.preferredKeepTile ? `保留 ${formatTileName(factor.preferredKeepTile)}、切 ${formatTileName(preferred)} 更优` : "接近 / 无明显差异",
    evidence: evidence.length ? evidence : ["本地宝牌工具没有识别到当前宝牌或未来宝牌潜力差异。"],
    relationToEngine: relationToEngine(preferred, engineDiscard),
    strength: factor ? normalizeDecisionFactor(factor).strength : undefined,
    preferredDiscardTile: preferred,
  };
}

function buildRouteCounterfactual(
  comparison: CandidateComparison,
  routeFactors: NonNullable<CurrentHandAnalysisPackage["routeFactors"]>["topDiscards"],
  engineDiscard: string | undefined,
): CandidateCounterfactualSummary["factors"] {
  const factor = comparison.decidingFactors.find((item) => item.type === "route-factor");
  if (!factor?.preferredDiscardTile) {
    return [];
  }

  const left = routeFactors.find((item) => item.discard === comparison.left);
  const right = routeFactors.find((item) => item.discard === comparison.right);
  const evidence = [
    factor.summary,
    left ? summarizeRouteFactorAnalysis(left) : "",
    right ? summarizeRouteFactorAnalysis(right) : "",
  ].filter(Boolean).slice(0, 3);

  return [
    {
      id: "route",
      label: "只看牌型路线",
      verdict: `切 ${formatTileName(factor.preferredDiscardTile)} 更保留可识别路线`,
      evidence,
      relationToEngine: relationToEngine(factor.preferredDiscardTile, engineDiscard),
      strength: normalizeDecisionFactor(factor).strength,
      preferredDiscardTile: factor.preferredDiscardTile,
    },
  ];
}

function buildOffensiveEvCounterfactual(
  comparison: CandidateComparison,
  offensiveEv: OffensiveEvAnalysis,
  engineDiscard: string | undefined,
): CandidateCounterfactualSummary["factors"][number] {
  const left = offensiveEv.options.find((option) => option.discard === comparison.left);
  const right = offensiveEv.options.find((option) => option.discard === comparison.right);

  if (!left || !right) {
    return {
      id: "offensiveEv",
      label: "只看实验性进攻EV",
      verdict: "无法比较",
      evidence: [offensiveEv.message ?? "实验性进攻EV 没有覆盖这两个候选。"],
      relationToEngine: "inconclusive",
      strength: "weak",
    };
  }

  if (left.shantenAfterDiscard > 1 || right.shantenAfterDiscard > 1) {
    return {
      id: "offensiveEv",
      label: "只看实验性进攻EV",
      verdict: "远手阶段不作为强结论",
      evidence: [`切 ${formatTileName(left.discard)}：${left.offensiveEv}；切 ${formatTileName(right.discard)}：${right.offensiveEv}。实验性进攻EV 第一版只比较听牌和一向听候选。`],
      relationToEngine: "inconclusive",
      strength: "weak",
    };
  }

  const diff = Math.abs(left.offensiveEv - right.offensiveEv);
  if (diff < 1000) {
    return {
      id: "offensiveEv",
      label: "只看实验性进攻EV",
      verdict: "接近 / 无明显差异",
      evidence: [`切 ${formatTileName(left.discard)}：${left.offensiveEv}；切 ${formatTileName(right.discard)}：${right.offensiveEv}。差距低于 1000，不能当强结论。`],
      relationToEngine: "inconclusive",
      strength: "weak",
    };
  }

  const better = left.offensiveEv > right.offensiveEv ? left : right;
  const worse = better === left ? right : left;

  return {
    id: "offensiveEv",
    label: "只看实验性进攻EV",
    verdict: `切 ${formatTileName(better.discard)} 更优`,
    evidence: [`切 ${formatTileName(better.discard)}：${better.offensiveEv}；切 ${formatTileName(worse.discard)}：${worse.offensiveEv}；预计打点 ${better.averageScore}，进张 ${better.ukeire} 枚。`],
    relationToEngine: relationToEngine(better.discard, engineDiscard),
    strength: "weak",
    preferredDiscardTile: better.discard,
  };
}

function resolveEnginePreferredDiscard(comparison: CandidateComparison, engineTop: AnalysisEngineResult["recommendations"]) {
  const factorPreferred = comparison.decidingFactors.find((item) => item.type === "engine")?.preferredDiscardTile;
  if (factorPreferred) {
    return factorPreferred;
  }

  const ranked = [comparison.left, comparison.right]
    .map((tile) => ({ tile, rank: engineTop.find((item) => item.tile === tile)?.rank ?? comparison.mortalRanks[tile] ?? null }))
    .filter((item): item is { tile: string; rank: number } => typeof item.rank === "number")
    .sort((left, right) => left.rank - right.rank);

  return ranked[0]?.tile;
}

function relationToEngine(preferredDiscardTile: string | undefined, engineDiscard: string | undefined): CandidateCounterfactualSummary["factors"][number]["relationToEngine"] {
  if (!preferredDiscardTile || !engineDiscard) {
    return "inconclusive";
  }

  return normalizeTile(preferredDiscardTile) === normalizeTile(engineDiscard) ? "supports" : "opposes";
}

function formatCounterfactualSummary(summary: CandidateCounterfactualSummary) {
  return [summary.engineOrder, ...summary.factors.map(formatCounterfactualFactor), summary.boundary].filter((item): item is string => Boolean(item)).join("；");
}

function formatCounterfactualFactor(factor: CandidateCounterfactualSummary["factors"][number]) {
  const relationText: Record<typeof factor.relationToEngine, string> = {
    supports: "支持当前排序",
    opposes: "反对当前排序",
    inconclusive: "无法解释当前推荐排序",
  };
  const strengthText = factor.strength ? `，强度 ${formatFactorStrength(factor.strength)}` : "";

  return `${factor.label}：${factor.verdict}，${relationText[factor.relationToEngine]}${strengthText}。`;
}

function formatCounterfactualEvidence(factor: CandidateCounterfactualSummary["factors"][number]) {
  return factor.evidence.map((item) => `${factor.label}：${item}`);
}

function formatFactorStrength(strength: NonNullable<CandidateCounterfactualSummary["factors"][number]["strength"]>) {
  return strength === "strong" ? "强" : strength === "medium" ? "中" : "弱";
}

export type AnalysisGraphState = {
  context: AnalysisContext;
  engine: AnalysisEngineResult;
  intent?: AnalysisIntent;
  toolPlan?: AnalysisToolPlan;
  doraAnalysis?: DoraAnalysis;
  errorProfile?: AnalysisErrorProfile;
  knowledgeCases?: AnalysisKnowledgeCase[];
  analysisPackage?: CurrentHandAnalysisPackage;
  directAnswer?: AnalysisChatStructured;
  validationWarnings: string[];
};

export type AnalysisGraphDependencies = {
  scoreWinningHand?: OffensiveEvScoreFn;
};

export async function runCurrentHandAnalysisGraph(
  context: AnalysisContext,
  engine: AnalysisEngineResult,
  dependencies: AnalysisGraphDependencies = {},
): Promise<AnalysisGraphState> {
  let state: AnalysisGraphState = { context, engine, validationWarnings: [] };
  state = classifyIntent(state);
  state = planTools(state);
  state = await runDeterministicTools(state, dependencies);
  state = retrieveKnowledge(state);
  state = classifyErrorProfile(state);
  state = composeDirectAnswer(state);
  return state;
}

export function validateAnalysisAnswer(structured: AnalysisChatStructured, state: AnalysisGraphState) {
  const warnings: string[] = [];
  const evidenceCatalog = new Map((state.analysisPackage?.evidenceCatalog ?? []).map((item) => [item.id, item]));
  const protectedTexts = [
    ...((state.analysisPackage?.candidateComparisons ?? []).flatMap((comparison) => comparison.decidingFactors.map((factor) => factor.summary))),
    ...((state.knowledgeCases ?? []).flatMap((item) => item.negativeClaims.map((claim) => `不要声称：${claim}`))),
  ];
  const serialized = JSON.stringify(structured);

  if (evidenceCatalog.size) {
    const evidenceIds = structured.evidenceIds ?? [];
    if (evidenceIds.length && evidenceIds.some((id) => !evidenceCatalog.has(id))) {
      warnings.push("鍥炵瓟娌℃湁浣跨敤鏈湴璇佹嵁 ID锛屽凡浣跨敤鏈湴鍙楁帶鍥炵瓟銆?");
    }
  }

  for (const item of state.knowledgeCases ?? []) {
    for (const claim of item.negativeClaims) {
      if (claim && serialized.includes(claim)) {
        warnings.push(`LLM 回答命中已知错误说法：${claim}`);
      }
    }
  }

  if (state.toolPlan?.userCorrection && !(structured.correctionsAccepted?.length || serialized.includes("你这个") || serialized.includes("纠正") || serialized.includes("对的"))) {
    warnings.push("用户纠正没有被明确吸收，已使用本地受控回答。");
  }

  if (isTooGenericStructuredAnswer(structured, state)) {
    warnings.push("回答过于笼统，已使用本地受控回答。");
  }

  if (containsUnsupportedFutureDoraClaim(structured, state)) {
    warnings.push("回答使用了未被工具支持的未来宝牌潜力理由，已使用本地受控回答。");
  }

  if (containsContradictedEfficiencyClaim(structured, state)) {
    warnings.push("回答里的牌效/向听表述与本地牌效结果不一致，已使用本地受控回答。");
  }
  if (containsContradictedCandidateDirection(structured, state)) {
    warnings.push("回答里的候选牌取舍方向与本地候选比较结果相反，已使用本地受控回答。");
  }
  if (containsPriorityMismatch(structured, state)) {
    warnings.push("回答的主因子顺序与本地分类只有明显差异，已使用本地受控回答。");
  }


  return {
    structured: warnings.length && state.directAnswer ? state.directAnswer : structured,
    warnings,
    protectedTexts,
  };
}

function containsContradictedCandidateDirection(structured: AnalysisChatStructured, state: AnalysisGraphState) {
  const comparison = findMostRelevantComparison(state);
  if (!hasPreferredCandidateComparison(comparison)) {
    return false;
  }

  const serialized = JSON.stringify(structured);
  const discardName = formatTileName(comparison.preferredDiscardTile);
  const keepName = formatTileName(comparison.preferredKeepTile);

  return containsDirectionClaim(serialized, keepName, ["更推荐切", "推荐切", "倾向切", "先切", "应该切"]) || containsDirectionClaim(serialized, discardName, ["保留", "留下", "留住", "更值得保留"]);
}

function containsDirectionClaim(value: string, tileName: string, verbs: string[]) {
  const compact = value.replace(/\s+/g, "");
  const compactTile = tileName.replace(/\s+/g, "");

  return verbs.some((verb) => compact.includes(`${verb}${compactTile}`) || compact.includes(`${verb}${compactTile}，`) || compact.includes(`${verb}${compactTile}。`));
}

function containsContradictedEfficiencyClaim(structured: AnalysisChatStructured, state: AnalysisGraphState) {
  const serialized = JSON.stringify(structured);
  const compact = serialized.replace(/\s+/g, "");
  const options = state.analysisPackage?.tileEfficiency.topDiscards ?? [];

  return options.some((option) => {
    const tileName = formatTileName(option.discard).replace(/\s+/g, "");
    const expected = option.shantenAfterDiscard;
    const claimedTenpai = new RegExp(`${escapeRegExp(tileName)}后[^。；\n]*听牌`).test(compact);
    const claimedNumber = compact.match(new RegExp(`${escapeRegExp(tileName)}后[^。；\n]*([0-9零一二三四五六七八九])向听`));

    if (claimedTenpai && expected !== 0) {
      return true;
    }

    if (!claimedNumber) {
      return false;
    }

    return parseShantenClaim(claimedNumber[1]) !== expected;
  });
}

function parseShantenClaim(value: string) {
  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  return /^\d$/.test(value) ? Number(value) : digits[value];
}

function containsPriorityMismatch(structured: AnalysisChatStructured, state: AnalysisGraphState) {
  const profile = state.analysisPackage?.errorProfile ?? state.errorProfile;
  if (!profile) {
    return false;
  }

  const serialized = JSON.stringify(structured);

  const strictRequiredCueCategories: AnalysisErrorProfile["category"][] = ["user_correction", "placement_endgame", "defense_priority", "future_dora_tiebreak"];
  if (strictRequiredCueCategories.includes(profile.category) && profile.requiredCues.length && !profile.requiredCues.some((cue) => serialized.includes(cue))) {
    return true;
  }
  if (profile.category === "defense_priority") {
    return containsAnyCue(serialized, ["宝牌", "牌效", "向听", "受入"]) && !containsAnyCue(serialized, ["现物", "安全", "立直"]);
  }

  if (profile.category === "placement_endgame") {
    return containsAnyCue(serialized, ["宝牌", "牌效", "向听"]) && !containsAnyCue(serialized, ["本场", "分差", "点差", "供托", "南场"]);
  }

  if (profile.category === "future_dora_tiebreak") {
    return containsAnyCue(serialized, ["现物", "安全", "立直"]) && !containsAnyCue(serialized, ["宝牌", "同牌效", "杠宝"]);
  }

  return false;
}

function containsAnyCue(value: string, cues: string[]) {
  return cues.some((cue) => value.includes(cue));
}


function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsUnsupportedFutureDoraClaim(structured: AnalysisChatStructured, state: AnalysisGraphState) {
  const serialized = JSON.stringify(structured);
  if (!/(未来宝牌潜力|未来.*宝牌|宝牌潜力|指示牌.*未现)/.test(serialized)) {
    return false;
  }

  const focusTiles = state.toolPlan?.focusTiles ?? [];
  const topTile = state.analysisPackage?.engine.topRecommendations[0]?.tile;
  const relevantComparisons = (state.analysisPackage?.candidateComparisons ?? []).filter((comparison) => isRelevantFutureDoraComparison(comparison, focusTiles, topTile));
  const supported = relevantComparisons.some((comparison) => {
    const futureFactor = comparison.decidingFactors.find((factor) => factor.type === "future-dora-potential");
    if (!futureFactor) {
      return false;
    }

    return Boolean(comparison.preferredDiscardTile && comparison.preferredKeepTile) && canFactorDriveConclusion({
      candidate: futureFactor,
      factors: comparison.decidingFactors.map(normalizeDecisionFactor),
      sameEfficiency: comparison.sameEfficiency,
    });
  });

  return !supported;
}

function isRelevantFutureDoraComparison(comparison: CandidateComparison, focusTiles: string[], topTile: string | undefined) {
  if (focusTiles.length >= 2) {
    return focusTiles.every((tile) => comparison.left === tile || comparison.right === tile);
  }

  if (focusTiles.length === 1 && topTile) {
    return [focusTiles[0], topTile].every((tile) => comparison.left === tile || comparison.right === tile);
  }

  if (focusTiles.length === 1) {
    return comparison.left === focusTiles[0] || comparison.right === focusTiles[0];
  }

  return true;
}

function classifyIntent(state: AnalysisGraphState): AnalysisGraphState {
  const question = state.context.question;
  const focusTiles = extractFocusTiles(question);
  const userCorrection = isUserCorrectionQuestion(question);
  let intent: AnalysisIntent = "general_review";

  if (userCorrection) {
    intent = "user_correction";
  } else if (hasAnyKeyword(question, SAFETY_KEYWORDS)) {
    intent = "safety_check";
  } else if (hasAnyKeyword(question, PLACEMENT_KEYWORDS)) {
    intent = "placement_strategy";
  } else if (hasAnyKeyword(question, COMPARE_KEYWORDS) && focusTiles.length >= 2) {
    intent = "compare_candidate_discards";
  } else if (hasAnyKeyword(question, DORA_KEYWORDS)) {
    intent = "dora_explanation";
  } else if (hasAnyKeyword(question, TILE_EFFICIENCY_KEYWORDS)) {
    intent = "tile_efficiency";
  } else if (hasAnyKeyword(question, DISCARD_CHOICE_KEYWORDS)) {
    intent = "discard_choice";
  }

  return {
    ...state,
    intent,
    toolPlan: {
      intent,
      tools: [],
      focusTiles,
      answerMode:
        intent === "dora_explanation"
          ? "teach"
          : intent === "user_correction"
            ? "correct"
            : intent === "compare_candidate_discards" || intent === "placement_strategy"
              ? "explain"
              : "direct",
      userCorrection,
    },
  };
}

const SAFETY_KEYWORDS = ["危险", "安全", "现物", "筋牌", "立直", "安牌", "放铳", "防守", "押", "降"];
const PLACEMENT_KEYWORDS = ["避4", "打点", "本场", "供托", "东场", "南场", "西场", "北场", "名次", "分差", "点差", "追分", "守位", "保四", "末局", "终局", "收支", "点棒", "最后一局", "最后几巡"];
const COMPARE_KEYWORDS = ["为什么", "为何", "而不是", "不是", "差异", "区别", "比较"];
const DORA_KEYWORDS = ["宝牌", "dora", "指示牌", "红中", "发财", "白板"];
const TILE_EFFICIENCY_KEYWORDS = ["牌效", "向听", "受入", "进张", "待牌"];
const DISCARD_CHOICE_KEYWORDS = ["怎么打", "何切", "切什么", "打哪", "选择"];

function hasAnyKeyword(value: string, keywords: string[]) {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function planTools(state: AnalysisGraphState): AnalysisGraphState {
  const intent = state.intent ?? "general_review";
  const baseTools: AnalysisToolName[] = ["engine", "tileEfficiency", "offensiveEv", "safetyHints", "routeFactors"];
  const extra: AnalysisToolName[] =
    intent === "compare_candidate_discards" || intent === "dora_explanation" || intent === "user_correction" || intent === "placement_strategy"
      ? ["doraAnalysis", "candidateComparison", "knowledgeCases"]
      : intent === "safety_check"
        ? ["knowledgeCases"]
        : [];

  return {
    ...state,
    toolPlan: {
      ...(state.toolPlan ?? { intent, focusTiles: [], answerMode: "direct", userCorrection: false }),
      tools: [...new Set([...baseTools, ...extra])],
    },
  };
}

async function runDeterministicTools(state: AnalysisGraphState, dependencies: AnalysisGraphDependencies): Promise<AnalysisGraphState> {
  const snapshot = state.context.snapshot;
  const decisionContext = state.context.decisionContext ?? buildDecisionContext(snapshot, state.context.question);
  const visibleTiles = [
    ...Object.values(snapshot.discards).flat(),
    ...Object.values(snapshot.calls).flatMap((calls) => calls.flatMap((call) => call.tiles)),
    ...snapshot.doraIndicators,
  ];
  const tileEfficiency = analyzeTileEfficiency(snapshot.targetHand, visibleTiles);
  const targetPlayer = snapshot.players.find((player) => player.seat === snapshot.targetSeat);
  const offensiveEv = await analyzeOffensiveEv({
    tiles: snapshot.targetHand,
    visibleTiles,
    doraIndicators: snapshot.doraIndicators,
    openMeldCount: snapshot.calls[snapshot.targetSeat].length,
    ownDiscards: snapshot.discards[snapshot.targetSeat],
    ownCalls: snapshot.calls[snapshot.targetSeat],
    seatWind: targetPlayer?.wind ?? "E",
    roundWind: roundWindFromIndex(snapshot.round.windRound),
    scoreWinningHand: dependencies.scoreWinningHand,
  });
  const engineTop = [...state.engine.recommendations].sort((left, right) => left.rank - right.rank).slice(0, 3);
  const engineTiles = engineTop.map((recommendation) => recommendation.tile).filter((tile): tile is string => Boolean(tile));
  const efficiencyTiles = tileEfficiency.discardOptions.slice(0, 4).map((option) => option.discard);
  const focusTiles = state.toolPlan?.focusTiles ?? [];
  const packagedEfficiencyOptions = selectEfficiencyOptions(tileEfficiency.discardOptions, [...engineTiles, ...focusTiles], 8);
  const packagedOffensiveEvOptions = selectEfficiencyOptions(offensiveEv.options, [...engineTiles, ...focusTiles], 8);
  const doraCandidates = [...new Set([...engineTiles, ...efficiencyTiles, ...focusTiles])];
  const doraAnalysis = buildDoraAnalysis(snapshot, doraCandidates);
  const routeFactorOptions = analyzeRouteFactors({
    tiles: snapshot.targetHand,
    candidateDiscards: doraCandidates,
    seatWind: targetPlayer?.wind ?? "E",
    roundWind: roundWindFromIndex(snapshot.round.windRound),
  });
  const packagedRouteFactors = selectEfficiencyOptions(routeFactorOptions, [...engineTiles, ...focusTiles], 8);
  const routeFactors = {
    topDiscards: packagedRouteFactors,
    message: "牌型路线只识别断幺、役牌、混一色、七对子四类稳定路线；不猜三色、一气、平和等细路线。",
  };
  const candidateComparisons = buildCandidateComparisons({ engine: state.engine, tileEfficiency, doraAnalysis, snapshot, visibleEvents: state.context.visibleEvents, routeFactors: routeFactorOptions }).map((comparison) => ({
    ...comparison,
    counterfactualSummary: buildCounterfactualSummary({
      comparison,
      tileEfficiency,
      offensiveEv,
      doraAnalysis,
      routeFactors: routeFactorOptions,
      snapshot,
      visibleEvents: state.context.visibleEvents,
      engineTop,
    }),
  }));
  const tableInference = buildTableInferenceContext({ snapshot, visibleEvents: state.context.visibleEvents, candidateComparisons, focusTiles });
  const safetyTiles = [...new Set([...engineTiles, ...efficiencyTiles, ...focusTiles])].slice(0, 8);
  const candidateHints = safetyTiles
    .map((tile) => buildTileSafetyHintFromSnapshot({ tile, snapshot, visibleEvents: state.context.visibleEvents }))
    .filter((hint): hint is NonNullable<ReturnType<typeof buildTileSafetyHintFromSnapshot>> => Boolean(hint));

  return {
    ...state,
    doraAnalysis,
    analysisPackage: {
      intent: state.intent,
      toolPlan: state.toolPlan,
      decisionContext,
      doraAnalysis,
      candidateComparisons,
      tableInference,
      routeFactors,
      readonlyNotice: "只基于当前光标之前的可见信息，不读取未来事件或牌山。",
      hand: {
        tiles: [...snapshot.targetHand],
        drawnTile: snapshot.drawnTile,
        doraIndicators: [...snapshot.doraIndicators],
      },
      engine: {
        status: state.engine.status,
        topRecommendations: engineTop.map((recommendation) => {
          const safety = recommendation.tile ? candidateHints.find((hint) => hint.tile === recommendation.tile) : undefined;
          return {
            rank: recommendation.rank,
            action: recommendation.action,
            tile: recommendation.tile,
            label: formatEngineRecommendation(recommendation),
            probability: recommendation.probability,
            tags: [...recommendation.tags],
            safety: safety
              ? {
                  tone: safety.tone,
                  labels: [...safety.labels],
                  description: safety.description,
                }
              : undefined,
          };
        }),
        warnings: [...state.engine.warnings],
      },
      tileEfficiency: {
        status: tileEfficiency.status,
        tileCount: tileEfficiency.tileCount,
        shanten: tileEfficiency.shanten,
        standardShanten: tileEfficiency.standardShanten,
        sevenPairsShanten: tileEfficiency.sevenPairsShanten,
        thirteenOrphansShanten: tileEfficiency.thirteenOrphansShanten,
        topDiscards: packagedEfficiencyOptions.map((option) => ({
          discard: option.discard,
          label: `切 ${formatTileName(option.discard)} 后 ${formatShanten(option.shantenAfterDiscard)}，剩余受入 ${option.waitCount} 枚`,
          shantenAfterDiscard: option.shantenAfterDiscard,
          waitCount: option.waitCount,
          waits: option.waits.slice(0, 6).map((wait) => `${formatTileName(wait.tile)} ${wait.remaining}/${wait.theoretical}`),
        })),
        message: tileEfficiency.message,
      },
      offensiveEv: {
        status: offensiveEv.status,
        topDiscards: packagedOffensiveEvOptions.map((option) => ({
          discard: option.discard,
          label:
            option.shantenAfterDiscard <= 1
              ? `切 ${formatTileName(option.discard)}：实验性进攻EV ${option.offensiveEv}，预计打点 ${option.averageScore}，进张 ${option.ukeire} 枚`
              : `切 ${formatTileName(option.discard)}：远手路线参考 ${option.offensiveEv}，预计打点 ${option.averageScore}，进张 ${option.ukeire} 枚`,
          shantenAfterDiscard: option.shantenAfterDiscard,
          ukeire: option.ukeire,
          waitCount: option.waitCount,
          averageScore: option.averageScore,
          offensiveEv: option.offensiveEv,
          waits: option.waits.slice(0, 6).map(formatTileName),
          furitenWaits: option.furitenWaits.slice(0, 6).map(formatTileName),
          branches: option.branches.slice(0, 4).map((branch) => `摸 ${formatTileName(branch.draw)} 后${branch.bestDiscard ? `切 ${formatTileName(branch.bestDiscard)}，` : ""}听牌等待 ${branch.tenpaiWaitCount} 枚，平均打点 ${branch.averageScore}`),
          notes: option.notes.slice(0, 3),
        })),
        message: offensiveEv.message,
      },
      safety: {
        riichiSeats: ([0, 1, 2, 3] as const).filter((seat) => snapshot.riichiTiles[seat].length > 0 && seat !== snapshot.targetSeat),
        candidateHints: candidateHints.map((hint) => ({
          tile: hint.tile,
          tone: hint.tone,
          labels: [...hint.labels],
          description: hint.description,
        })),
      },
      evidenceCatalog: buildEvidenceCatalog({
        snapshot,
        decisionContext,
        engineTop,
        tileEfficiency,
        offensiveEv,
        routeFactors,
        candidateHints,
        candidateComparisons,
        tableInference,
        knowledgeCases: [],
      }),
    },
  };
}

function buildTableInferenceContext({
  snapshot,
  visibleEvents,
  candidateComparisons,
  focusTiles,
}: {
  snapshot: VisibleAnalysisSnapshot;
  visibleEvents: RoundEvent[];
  candidateComparisons: CandidateComparison[];
  focusTiles: string[];
}): AnalysisTableInferenceContext {
  const tableInferenceTriggers = candidateComparisons.map((comparison) => getTableInferenceTrigger(comparison));
  const tableInferenceTrigger =
    tableInferenceTriggers.find((trigger) => trigger === "contradictory-local-signals") ??
    tableInferenceTriggers.find((trigger): trigger is NonNullable<ReturnType<typeof getTableInferenceTrigger>> => Boolean(trigger));

  return {
    applies: Boolean(tableInferenceTrigger),
    reason: tableInferenceTrigger === "contradictory-local-signals"
      ? "当前可见牌效和安全都解释到这里，但引擎排序仍和本地信号相背离；这里只给解释边界，不硬猜更具体的次因。"
      : tableInferenceTrigger === "close-comparison"
        ? "当前牌效和安全已经接近到难以继续拆解，系统只给出解释边界，不硬编具体次因。"
        : "当前可见信息不足以拆解引擎的全部内部权重，只能给出解释边界，不开放全桌猜测。",
    allowedUse: "supplement-only",
    focusTiles: [...new Set(focusTiles.map(normalizeTile).filter((tile) => Boolean(tile)))],
    guardrails: [
      "只能引用已计算出的本地证据，不能补充未证实的可能原因。",
      "只能基于当前可见牌桌信息，不读未来摸牌或牌山。",
      "若没有明确结构化证据，必须说明解释边界。",
    ],
    visibleTable: {
      round: snapshot.round.title,
      cursor: `${snapshot.cursor}/${snapshot.maxCursor}`,
      targetSeat: snapshot.targetSeat,
      targetHand: [...snapshot.targetHand],
      drawnTile: snapshot.drawnTile,
      doraIndicators: [...snapshot.doraIndicators],
      players: snapshot.players.map((player) => ({
        seat: player.seat,
        wind: player.wind,
        score: player.score,
        style: player.style,
      })),
      discards: snapshot.discards,
      calls: {
        0: snapshot.calls[0].flatMap((call) => call.tiles),
        1: snapshot.calls[1].flatMap((call) => call.tiles),
        2: snapshot.calls[2].flatMap((call) => call.tiles),
        3: snapshot.calls[3].flatMap((call) => call.tiles),
      },
      riichiSeats: ([0, 1, 2, 3] as const).filter((seat) => snapshot.riichiTiles[seat].length > 0 && seat !== snapshot.targetSeat),
      recentEvents: visibleEvents.slice(-8).map((event) => formatVisibleEventForInference(event)),
    },
  };
}

function getTableInferenceTrigger(comparison: CandidateComparison) {
  const efficiencyFactor = comparison.decidingFactors.find((factor) => factor.type === "efficiency");
  const efficiencyClose = comparison.sameEfficiency || !efficiencyFactor || efficiencyFactor.strength === "medium";
  const localSignalsContradictEngine = localFactorOpposesEngine(comparison, "efficiency") && localFactorOpposesEngine(comparison, "safety");

  if (
    efficiencyClose &&
      comparison.preferredDiscardTile &&
      comparison.preferredKeepTile &&
      !comparison.decidingFactors.some((factor) => factor.type === "current-dora")
  ) {
    return "close-comparison" as const;
  }

  if (localSignalsContradictEngine) {
    return "contradictory-local-signals" as const;
  }

  return null;
}

function localFactorOpposesEngine(comparison: CandidateComparison, factorType: "efficiency" | "safety") {
  const engineFactor = comparison.decidingFactors.find((factor) => factor.type === "engine");
  const localFactor = comparison.decidingFactors.find((factor) => factor.type === factorType);

  return Boolean(
    engineFactor?.preferredDiscardTile &&
      localFactor?.preferredDiscardTile &&
      normalizeTile(engineFactor.preferredDiscardTile) !== normalizeTile(localFactor.preferredDiscardTile),
  );
}

function formatVisibleEventForInference(event: RoundEvent) {
  switch (event.type) {
    case "discard":
      return `${event.seat} 打出 ${formatTileName(event.tile)}${event.riichi ? "（立直）" : ""}${event.moqie ? "（摸切）" : ""}`;
    case "draw":
      return `${event.seat} 摸 ${formatTileName(event.tile)}`;
    case "call":
      return `${event.seat} 副露 ${event.callType} ${event.tiles.map((tile) => formatTileName(tile)).join(" ")}`;
    case "kan":
      return `${event.seat} 杠 ${event.callType} ${event.tiles.map((tile) => formatTileName(tile)).join(" ")}`;
    case "agari":
      return `${event.seat} 和牌 ${formatTileName(event.tile)}`;
    case "ryukyoku":
      return `流局 ${event.label}`;
    case "new-round":
      return `${event.seat} 开局 ${event.label}`;
    default:
      return "未知事件";
  }
}

function selectEfficiencyOptions<T extends { discard: string }>(options: T[], importantTiles: string[], maxItems: number) {
  const selected: T[] = [];
  const add = (option: T | undefined) => {
    if (option && !selected.some((item) => item.discard === option.discard)) {
      selected.push(option);
    }
  };

  options.slice(0, 4).forEach(add);
  importantTiles.forEach((tile) => add(options.find((option) => option.discard === tile)));

  return selected.slice(0, maxItems);
}

function retrieveKnowledge(state: AnalysisGraphState): AnalysisGraphState {
  const knowledgeCases = retrieveKnowledgeCases({
    intent: state.intent ?? "general_review",
    focusTiles: state.toolPlan?.focusTiles ?? [],
    question: state.context.question,
  });

  return {
    ...state,
    knowledgeCases,
    analysisPackage: state.analysisPackage
      ? {
          ...state.analysisPackage,
          knowledgeCases,
          evidenceCatalog: buildEvidenceCatalog({
            snapshot: state.context.snapshot,
            decisionContext: state.analysisPackage.decisionContext,
            engineTop: state.analysisPackage.engine.topRecommendations,
            tileEfficiency: state.analysisPackage.tileEfficiency,
            offensiveEv: state.analysisPackage.offensiveEv,
            routeFactors: state.analysisPackage.routeFactors,
            candidateHints: state.analysisPackage.safety.candidateHints,
            candidateComparisons: state.analysisPackage.candidateComparisons ?? [],
            tableInference: state.analysisPackage.tableInference,
            knowledgeCases,
          }),
        }
      : state.analysisPackage,
  };
}

function classifyErrorProfile(state: AnalysisGraphState): AnalysisGraphState {
  const errorProfile = classifyAnalysisErrorProfile({
    intent: state.intent,
    toolPlan: state.toolPlan,
    context: {
      question: state.context.question,
      snapshot: state.context.snapshot,
      decisionContext: state.analysisPackage?.decisionContext,
    },
    analysisPackage: state.analysisPackage,
    knowledgeCases: state.knowledgeCases,
  });

  return {
    ...state,
    errorProfile,
    analysisPackage: state.analysisPackage ? { ...state.analysisPackage, errorProfile } : state.analysisPackage,
  };
}

function composeDirectAnswer(state: AnalysisGraphState): AnalysisGraphState {
  const comparison = findMostRelevantComparison(state);
  const knowledge = state.knowledgeCases?.[0];
  const snapshot = state.context.snapshot;
  const topEngine = state.analysisPackage?.engine.topRecommendations[0];
  const topEfficiency = state.analysisPackage?.tileEfficiency.topDiscards[0];
  const decisionContext = state.analysisPackage?.decisionContext;

  if (hasPreferredCandidateComparison(comparison)) {
    return {
      ...state,
      directAnswer: buildCandidateComparisonAnswer(state, comparison),
    };
  }

  if (decisionContext?.applies) {
    return {
      ...state,
      directAnswer: buildPlacementAwareAnswer(state, topEngine, topEfficiency),
    };
  }

  if (topEngine) {
    return {
      ...state,
      directAnswer: buildRecommendationAnswer(state, topEngine),
    };
  }

  const correctionsAccepted =
    state.toolPlan?.userCorrection && comparison?.decidingFactors.length
      ? ["你这个纠正是对的，我按宝牌指示牌潜力重新看。"]
      : state.toolPlan?.userCorrection && knowledge
        ? ["你指出的是一个需要先核对工具事实的问题，我不会直接判定用户错误。"]
        : [];
  const visibleNotice = "\u5f53\u524d\u53ef\u89c1\u4fe1\u606f\u9650\u5236\uff1a\u53ea\u57fa\u4e8e\u5f53\u524d\u5149\u6807\u4e4b\u524d\u7684\u53ef\u89c1\u4fe1\u606f\uff0c\u4e0d\u8bfb\u53d6\u672a\u6765\u4e8b\u4ef6\u6216\u724c\u5c71\u3002";
  const comparisonReasons = comparison?.decidingFactors.map((factor) => factor.summary) ?? [];
  const knowledgeReason = knowledge?.positiveExplanation;

  return {
    ...state,
    directAnswer: {
      conclusion: comparison?.preferredDiscardTile
        ? "这里更像是同牌效后的细分取舍：保留 " + formatTileName(comparison.preferredKeepTile) + "、先切 " + formatTileName(comparison.preferredDiscardTile) + "。"
        : "当前可见信息里没有可用的推荐候选，先按牌面做保守复盘。",
      reasons: [
        visibleNotice,
        ...comparisonReasons,
        ...(knowledgeReason ? [knowledgeReason] : []),
        ...(topEfficiency ? ["\u724c\u6548\u4fa7\u7b2c\u4e00\u5019\u9009\uff1a" + topEfficiency.label] : []),
        ...(!topEfficiency ? ["\u5f53\u524d\u624b\u724c\u5f20\u6570\u6682\u4e0d\u9002\u5408\u505a\u5b8c\u6574\u724c\u6548\u6392\u5e8f\uff0c\u5148\u6309\u53ef\u89c1\u724c\u9762\u548c\u5f15\u64ce\u72b6\u6001\u505a\u57fa\u7840\u5224\u65ad\u3002"] : []),
      ].slice(0, 5),
      risks: [
        ...(state.analysisPackage?.safety.candidateHints.slice(0, 2).map((hint) => formatTileName(hint.tile) + "：" + hint.labels.join("、")) ?? []),
        "所有结论只基于当前光标之前的可见信息，不读取未来牌山。",
      ].slice(0, 4),
      suggestedQuestions: ["如果这里切1万会怎样？", "这一步应该押还是降？", "后续摸到什么牌会改变选择？"],
      evidence: [
        snapshot.round.title + "，光标 " + snapshot.cursor + "/" + snapshot.maxCursor,
        "目标手牌 " + (formatTileNames(snapshot.targetHand) || "暂无"),
        "宝牌指示牌 " + (formatTileNames(snapshot.doraIndicators) || "暂无"),
      ],
      directReplies: [
        "只看牌效怎么选？",
        "只看安全度怎么选？",
      ],
      correctionsAccepted,
    },
  };
}

function buildPlacementAwareAnswer(
  state: AnalysisGraphState,
  topEngine: CurrentHandAnalysisPackage["engine"]["topRecommendations"][number] | undefined,
  topEfficiency: CurrentHandAnalysisPackage["tileEfficiency"]["topDiscards"][number] | undefined,
) {
  const snapshot = state.context.snapshot;
  const decisionContext = state.analysisPackage?.decisionContext;
  const contextLine = decisionContext ? formatDecisionContextSummary(decisionContext) : "";
  const summary = decisionContext?.applies
    ? decisionContext.mode === "endgame"
      ? `这题先看终盘场况，再看牌效。当前是 ${decisionContext.roundLabel}，${decisionContext.tableWindLabel}，${decisionContext.honba} 本场${decisionContext.riichiSticks ? `，${decisionContext.riichiSticks} 供托` : ""}。`
      : `这题不能只按牌效看，要先看场况。当前是 ${decisionContext.roundLabel}，${decisionContext.tableWindLabel}，${decisionContext.honba} 本场${decisionContext.riichiSticks ? `，${decisionContext.riichiSticks} 供托` : ""}，分差会直接影响取舍。`
    : "这题要先看场况，再看牌效。";

  return {
    conclusion: summary,
    reasons: [
      contextLine,
      decisionContext?.requiredFacts.join("、"),
      topEngine ? "当前推荐第一候选是" + topEngine.label + "。" : undefined,
      topEfficiency ? "牌效侧第一候选：" + topEfficiency.label + "。" : undefined,
    ].filter((item): item is string => Boolean(item)).slice(0, 4),
    risks: [
      "避4和打点题里，本场和供托会改变收益门槛，单看牌效容易失真。",
      "如果后面进入更强的立直压力，安全线索还要重新看。",
      "只看当前牌形容易忽略追分和守位目标。",
    ],
    suggestedQuestions: ["如果这是追分局会怎么选？", "南场和东场会怎么变？", "本场和供托怎么影响取舍？"],
    evidence: [
      snapshot.round.title + "，光标 " + snapshot.cursor + "/" + snapshot.maxCursor,
      "目标手牌 " + (formatTileNames(snapshot.targetHand) || "暂无"),
      contextLine || undefined,
    ].filter((item): item is string => Boolean(item)),
    directReplies: ["这题不能只看牌效", "先看场况再看牌"],
    correctionsAccepted: [],
  };
}
function buildCandidateComparisonAnswer(state: AnalysisGraphState, comparison: PreferredCandidateComparison) {
  const snapshot = state.context.snapshot;
  const discardName = formatTileName(comparison.preferredDiscardTile);
  const keepName = formatTileName(comparison.preferredKeepTile);
  const engineText = summarizeEngineRanks(comparison);
  const counterfactual = comparison.counterfactualSummary;
  const doraFactor = comparison.decidingFactors.find((factor) => factor.type === "future-dora-potential" || factor.type === "current-dora");
  const correctionsAccepted =
    state.toolPlan?.userCorrection && comparison.decidingFactors.length ? ["你这个纠正是对的，我按候选牌的牌效、宝牌潜力和安全线索重新看。"] : [];
  const doraQuestion = doraFactor ? "只看宝牌潜力怎么选？" : null;

  return {
    conclusion: `引擎排序仍是主结论：更推荐切${discardName}，保留${keepName}。`,
    reasons: [
      engineText,
      ...(counterfactual?.factors.map(formatCounterfactualFactor) ?? []),
      counterfactual?.boundary,
    ].filter((item): item is string => Boolean(item)),
    risks: [
      "安全线索仍然只按当前可见牌判断；若后续出现立直或副露压力，候选牌取舍可能会改变。",
      "这个结论只解释当前光标前的可见局面，不读取未来摸牌或牌山。",
    ],
    suggestedQuestions: dedupeShortQuestions([`如果不考虑宝牌潜力，${discardName} 和 ${keepName} 是否完全等价？`, "这里为什么不是切1万？", "已见字牌数量怎么影响孤立役牌价值？"]),
    evidence: [
      `${snapshot.round.title}，光标 ${snapshot.cursor}/${snapshot.maxCursor}`,
      `目标手牌 ${formatTileNames(snapshot.targetHand) || "暂无"}`,
      ...(counterfactual?.factors.flatMap(formatCounterfactualEvidence).slice(0, 8) ?? []),
    ],
    directReplies: dedupeShortQuestions([`解释 ${discardName} vs ${keepName}`, "只看牌效怎么选？", ...(doraQuestion ? [doraQuestion] : [])]),
    correctionsAccepted,
  };
}

function dedupeShortQuestions(items: string[]) {
  return [...new Set(items.filter(Boolean))].slice(0, 3);
}

function buildRecommendationAnswer(state: AnalysisGraphState, recommendation: CurrentHandAnalysisPackage["engine"]["topRecommendations"][number]) {
  const snapshot = state.context.snapshot;
  const tileName = recommendation.tile ? formatTileName(recommendation.tile) : "";
  const actionText = formatActionText(recommendation.action);
  const tileEfficiency = recommendation.tile ? state.analysisPackage?.tileEfficiency.topDiscards.find((option) => option.discard === recommendation.tile) : undefined;
  const offensiveEv = recommendation.tile ? state.analysisPackage?.offensiveEv?.topDiscards.find((option) => option.discard === recommendation.tile) : undefined;
  const safety = recommendation.tile ? state.analysisPackage?.safety.candidateHints.find((hint) => hint.tile === recommendation.tile) : undefined;
  const defense = recommendation.tile ? buildRiichiDefenseReason(state, recommendation.tile) : null;
  const probabilityText = typeof recommendation.probability === "number" && !recommendation.label.includes("%") ? `（约 ${Math.round(recommendation.probability * 100)}%）` : "";

  if (recommendation.action !== "discard") {
    const reactionReason = buildReactionReason(state, recommendation.tile, actionText);
    return {
      conclusion: tileName ? `这里更倾向${actionText} ${tileName}。` : `这里更倾向${actionText}。`,
      reasons: [
        reactionReason,
        `当前推荐排序把这个动作放在最前${probabilityText}。`,
        recommendation.action === "kan" ? "杠会改变局面并增加宝牌信息，所以只有在当前收益足够时才值得做。" : undefined,
      ].filter((item): item is string => Boolean(item)).slice(0, 3),
      risks: [
        recommendation.action === "kan" ? "杠会给全场增加新的宝牌机会，收益和风险都会放大。" : "副露后手牌会更公开，后续防守余地可能变小。",
        "这里只根据当前可见局面解释，不读取后续牌山。",
      ],
      suggestedQuestions: ["如果选择跳过会怎样？", "这个动作会不会影响防守？", "后续应该怎么做？"],
      evidence: buildCompactEvidence(snapshot),
      directReplies: ["只看收益怎么选？", "只看风险怎么选？"],
      correctionsAccepted: [],
    };
  }

  return {
    conclusion: defense?.conclusion ?? (tileName ? `这里先按切 ${tileName} 理解。` : `这里先按 ${recommendation.label} 理解。`),
    reasons: [
      defense?.reason,
      `推荐排序最靠前的是${recommendation.label}${probabilityText}。`,
      tileEfficiency ? `牌效上：${tileEfficiency.label}。` : "这张牌没有落在牌效前几名里，说明它更可能是结合役种、宝牌或安全后的综合选择。",
      offensiveEv ? `实验性进攻EV：${offensiveEv.label}。` : undefined,
      safety ? `安全线索：${safety.labels.join("、")}。` : "当前没有明显立直压力时，重点先看速度、手牌价值和后续改良。",
    ].filter((item): item is string => Boolean(item)).slice(0, 3),
    risks: [
      defense?.risk ?? "如果后续出现立直或强副露压力，候选牌的安全度排序可能改变。",
      "这里只根据当前可见局面解释，不读取后续牌山。",
    ],
    suggestedQuestions: ["如果切另一张会怎样？", "只看牌效怎么选？", "这张牌安全吗？"],
    evidence: buildCompactEvidence(snapshot),
    directReplies: ["只看牌效怎么选？", "只看安全度怎么选？"],
    correctionsAccepted: [],
  };
}

function buildRiichiDefenseReason(state: AnalysisGraphState, recommendedTile: string) {
  const snapshot = state.context.snapshot;
  const riichiSeats = state.analysisPackage?.safety.riichiSeats ?? [];
  if (!riichiSeats.length || !snapshot.drawnTile || normalizeTile(snapshot.drawnTile) === normalizeTile(recommendedTile)) {
    return null;
  }

  const recommendedHint = state.analysisPackage?.safety.candidateHints.find((hint) => normalizeTile(hint.tile) === normalizeTile(recommendedTile));
  const drawnHint = state.analysisPackage?.safety.candidateHints.find((hint) => normalizeTile(hint.tile) === normalizeTile(snapshot.drawnTile));
  const recommendedSafe = recommendedHint?.tone === "safe" || recommendedHint?.labels.some((label) => label.includes("现物"));
  const drawnRisky = drawnHint?.tone === "caution" || drawnHint?.labels.some((label) => label.includes("非现物") || label.includes("无明显现物"));

  if (!recommendedSafe || !drawnRisky) {
    return null;
  }

  const recommendedName = formatTileName(recommendedTile);
  const drawnName = formatTileName(snapshot.drawnTile);
  const riichiText = riichiSeats.map(formatSeatName).join("/");

  return {
    conclusion: `这里推荐切 ${recommendedName} 的核心是防守：${riichiText} 已立直，新摸的 ${drawnName} 不是现物，先切现物 ${recommendedName} 更稳。`,
    reason: `${recommendedName} 有现物线索；${drawnName} 对立直家没有现物信息，所以即使牌效上看起来想切 ${drawnName}，也应优先避免直接推出危险张。`,
    risk: `如果没有足够收益继续押，后续仍应优先找现物或更安全的牌，不要因为牌效把非现物 ${drawnName} 轻易打出。`,
  };
}

function formatSeatName(seat: number) {
  return ["东家", "南家", "西家", "北家"][seat] ?? `${seat} 家`;
}

function roundWindFromIndex(index: number): "E" | "S" | "W" | "N" {
  return (["E", "S", "W", "N"] as const)[index] ?? "E";
}

function findMostRelevantComparison(state: AnalysisGraphState) {
  const focus = new Set(state.toolPlan?.focusTiles ?? []);
  const comparisons = state.analysisPackage?.candidateComparisons ?? [];

  if (focus.size >= 2) {
    return comparisons.find((item) => focus.has(item.left) && focus.has(item.right));
  }

  return undefined;
}

function isThinRecommendationAnswer(structured: AnalysisChatStructured, recommendation: CurrentHandAnalysisPackage["engine"]["topRecommendations"][number]) {
  if (structured.reasons.length >= 1) {
    return false;
  }

  const tileName = recommendation.tile ? formatTileName(recommendation.tile) : "";
  const actionText = formatActionText(recommendation.action);
  return Boolean(structured.conclusion.includes(actionText) || (tileName && structured.conclusion.includes(tileName)));
}

function hasPreferredCandidateComparison(comparison: CandidateComparison | undefined): comparison is PreferredCandidateComparison {
  return Boolean(comparison?.preferredDiscardTile && comparison.preferredKeepTile);
}

function isTooGenericStructuredAnswer(structured: AnalysisChatStructured, state: AnalysisGraphState) {
  const topRecommendation = state.analysisPackage?.engine.topRecommendations[0];
  if (topRecommendation && isThinRecommendationAnswer(structured, topRecommendation)) {
    return true;
  }

  if (!/(这张牌|这一步|这手|这局|这盘)/.test(structured.conclusion)) {
    return false;
  }

  const comparisonTiles = (state.analysisPackage?.candidateComparisons ?? [])
    .flatMap((comparison) => [comparison.left, comparison.right, comparison.preferredDiscardTile, comparison.preferredKeepTile])
    .filter((tile): tile is string => Boolean(tile));

  if (!comparisonTiles.length) {
    return false;
  }

  const serialized = JSON.stringify(structured);
  return !comparisonTiles.some((tile) => serialized.includes(tile) || serialized.includes(formatTileName(tile)));
}

function summarizeEngineRanks(comparison: PreferredCandidateComparison) {
  const discardRank = comparison.mortalRanks[comparison.preferredDiscardTile];
  const keepRank = comparison.mortalRanks[comparison.preferredKeepTile];

  if (discardRank && keepRank) {
    return `当前推荐排序更偏向切 ${formatTileName(comparison.preferredDiscardTile)}（第 ${discardRank} 候选），而不是切 ${formatTileName(comparison.preferredKeepTile)}（第 ${keepRank} 候选）。`;
  }

  return `当前推荐排序倾向先切 ${formatTileName(comparison.preferredDiscardTile)}，这里要解释的是它为什么保留 ${formatTileName(comparison.preferredKeepTile)}。`;
}

function isUserCorrectionQuestion(question: string) {
  if (/(纠正|更正|不是这个|其实不是|不是因为|我说的是|你忽略|你漏了|你搞混|你错了|不对)/.test(question)) {
    return true;
  }

  if (/(其实|这个地方)/.test(question) && /(因为|原因|应该是|正确|不是)/.test(question) && !/(为什么|为何)/.test(question)) {
    return true;
  }

  return false;
}

function extractFocusTiles(question: string) {
  const tiles = new Set<string>();
  const entries: Array<[RegExp, string]> = [
    [/白板|白/g, "5z"],
    [/发财|发/g, "6z"],
    [/红中|中/g, "7z"],
    [/东/g, "1z"],
    [/南/g, "2z"],
    [/西/g, "3z"],
    [/北/g, "4z"],
  ];

  for (const [pattern, tile] of entries) {
    if (pattern.test(question)) {
      tiles.add(tile);
    }
  }

  for (const match of question.matchAll(/([1-9])\s*([万筒饼索条])/g)) {
    const suit = match[2] === "万" || match[2] === "m" ? "m" : match[2] === "筒" || match[2] === "饼" || match[2] === "p" ? "p" : "s";
    tiles.add(`${match[1]}${suit}`);
  }

  for (const match of question.matchAll(/\b([1-9])\s*([mpsz])\b/gi)) {
    tiles.add(`${match[1]}${match[2].toLowerCase()}`);
  }

  return [...tiles];
}

function formatEngineRecommendation(recommendation: AnalysisEngineResult["recommendations"][number]) {
  const actionText: Record<string, string> = {
    discard: "切",
    riichi: "立直",
    pass: "跳过",
    chi: "吃",
    pon: "碰",
    kan: "杠",
    win: "和牌",
  };
  const score = typeof recommendation.probability === "number" ? `（${Math.round(recommendation.probability * 100)}%）` : "";

  return `${actionText[recommendation.action] ?? recommendation.action}${recommendation.tile ? ` ${formatTileName(recommendation.tile)}` : ""}${score}`;
}

function formatActionText(action: string) {
  const actionText: Record<string, string> = {
    discard: "切",
    riichi: "立直",
    pass: "跳过",
    chi: "吃",
    pon: "碰",
    kan: "杠",
    win: "和牌",
  };

  return actionText[action] ?? action;
}

function buildReactionReason(state: AnalysisGraphState, tile: string | undefined, actionText: string) {
  const snapshot = state.context.snapshot;
  const tileName = tile ? formatTileName(tile) : "";
  const currentEvent = snapshot.currentEvent;

  if (tile && currentEvent?.type === "discard" && normalizeTile(currentEvent.tile) === normalizeTile(tile)) {
    const sameInHand = snapshot.targetHand.filter((item) => normalizeTile(item) === normalizeTile(tile)).length;
    if (actionText === "杠" && sameInHand >= 3) {
      return `这是对手打出 ${tileName} 后的反应点；你手里已有 ${sameInHand} 张 ${tileName}，所以可以明杠。`;
    }

    if (actionText === "碰" && sameInHand >= 2) {
      return `这是对手打出 ${tileName} 后的反应点；你手里已有对子，所以可以碰来推进手牌。`;
    }

    if (actionText === "吃") {
      return `这是上家打出 ${tileName} 后的反应点；吃牌能直接补成顺子或改善速度。`;
    }

    if (actionText === "跳过") {
      return `这是对手打出 ${tileName} 后的反应点；当前更倾向不副露，保留门清和手牌弹性。`;
    }

    return `这是对手打出 ${tileName} 后的反应点，关键是比较 ${actionText} 和跳过后的速度、价值与防守余地。`;
  }

  return tileName ? `当前可见局面里，${actionText} ${tileName} 是排序最前的反应。` : `当前可见局面里，${actionText} 是排序最前的反应。`;
}

function buildCompactEvidence(snapshot: AnalysisGraphState["context"]["snapshot"]) {
  return [
    `${snapshot.round.title}，光标 ${snapshot.cursor}/${snapshot.maxCursor}`,
    `目标手牌 ${formatTileNames(snapshot.targetHand) || "暂无"}`,
    `宝牌指示牌 ${formatTileNames(snapshot.doraIndicators) || "暂无"}`,
  ];
}

function normalizeTile(tile: string | undefined) {
  if (!tile) {
    return "";
  }

  const normalized = tile.trim().toLowerCase();
  if (/^0[mps]$/.test(normalized)) {
    return `5${normalized[1]}`;
  }

  if (/^5[mps]r$/.test(normalized)) {
    return `5${normalized[1]}`;
  }

  return normalized;
}

function formatShanten(value: number) {
  if (value < 0) {
    return value === -1 ? "听牌" : "已和牌";
  }

  return `${value} 向听`;
}
