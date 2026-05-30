import type {
  AnalysisContext,
  CandidateComparison,
  AnalysisDecisionContext,
  AnalysisErrorProfile,
  AnalysisIntent,
  AnalysisKnowledgeCase,
  AnalysisToolPlan,
  CurrentHandAnalysisPackage,
} from "./types";

export type AnalysisErrorProfileSource = {
  intent?: AnalysisIntent;
  toolPlan?: AnalysisToolPlan;
  context: Pick<AnalysisContext, "question" | "snapshot"> & { decisionContext?: AnalysisDecisionContext };
  analysisPackage?: Pick<
    CurrentHandAnalysisPackage,
    "candidateComparisons" | "decisionContext" | "engine" | "safety" | "tileEfficiency" | "toolPlan"
  >;
  knowledgeCases?: AnalysisKnowledgeCase[];
};

const PLACEMENT_CUES = ["本场", "供托", "点差", "分差", "南场", "东场", "西场", "北场", "避4", "打点", "追分", "守位", "终盘", "末局"];
const DEFENSE_CUES = ["现物", "安全", "立直", "放铳", "筋牌", "防守", "安牌", "危险"];
const DORA_CUES = ["宝牌", "指示牌", "dora", "白板", "发财", "红中", "未来宝牌"];
const EFFICIENCY_CUES = ["牌效", "向听", "受入", "进张", "待牌"];
const CORRECTION_CUES = ["纠正", "更正", "不是这个", "你说错", "我说的是", "其实是", "重新看"];

export function classifyAnalysisErrorProfile(source: AnalysisErrorProfileSource): AnalysisErrorProfile {
  const question = source.context.question;
  const lowerQuestion = question.toLowerCase();
  const decisionContext = source.context.decisionContext ?? source.analysisPackage?.decisionContext;
  const riichiPressure = Boolean(source.analysisPackage?.safety.riichiSeats.length);
  const comparisons = source.analysisPackage?.candidateComparisons ?? [];
  const topComparison = findRelevantComparison(comparisons, source.toolPlan?.focusTiles ?? [], source.analysisPackage?.engine.topRecommendations[0]?.tile);
  const knowledgeCaseIds = new Set((source.knowledgeCases ?? []).map((item) => item.id));

  if (source.toolPlan?.userCorrection || source.intent === "user_correction" || hasAnyCue(lowerQuestion, CORRECTION_CUES) || knowledgeCaseIds.has("user-correction-must-be-checked")) {
    return {
      category: "user_correction",
      priorityOrder: ["correction", "safety", "placement", "efficiency", "dora"],
      requiredCues: ["纠正", "更正", "确实"],
      notes: ["用户在纠偏，必须先对照工具结果，能承认就承认，不能硬反驳。"],
    };
  }

  if (riichiPressure || hasAnyCue(lowerQuestion, DEFENSE_CUES) || comparisonHasSafetyCue(comparisons)) {
    return {
      category: "defense_priority",
      priorityOrder: ["safety", "efficiency", "dora", "placement", "endgame"],
      requiredCues: ["现物", "安全", "立直"],
      notes: ["有立直压力时，防守解释必须先于弱宝牌/弱牌效细分。"],
    };
  }

  if (isPlacementQuestion(question, decisionContext, knowledgeCaseIds)) {
    return {
      category: "placement_endgame",
      priorityOrder: ["placement", "endgame", "safety", "efficiency", "dora"],
      requiredCues: ["本场", "供托", "分差", "点差", "南场", "终盘"],
      notes: ["这题必须先看场况和名次，再决定牌效是否还有主导权。"],
    };
  }

  if (isFutureDoraTieBreakQuestion(question, topComparison, knowledgeCaseIds) || hasAnyCue(lowerQuestion, DORA_CUES)) {
    return {
      category: "future_dora_tiebreak",
      priorityOrder: ["efficiency", "dora", "safety", "placement", "endgame"],
      requiredCues: ["牌效", "同牌效", "宝牌"],
      notes: ["未来宝牌潜力只做细分因子，不能压过明显的牌效或安全差异。"],
    };
  }

  if (hasAnyCue(lowerQuestion, EFFICIENCY_CUES) || comparisons.length > 0) {
    return {
      category: "efficiency_priority",
      priorityOrder: ["efficiency", "safety", "dora", "placement", "endgame"],
      requiredCues: ["牌效", "向听", "受入"],
      notes: ["牌效优先，但如果后面出现立直或场况变化，优先级要重新排。"],
    };
  }

  if ((source.analysisPackage?.engine.topRecommendations.length ?? 0) <= 1) {
    return {
      category: "single_candidate_scope",
      priorityOrder: ["efficiency", "safety", "dora", "placement", "endgame"],
      requiredCues: [],
      notes: ["这是单候选问题，不要硬扩成多候选比较。"],
    };
  }

  return {
    category: "general",
    priorityOrder: ["efficiency", "safety", "dora", "placement", "endgame"],
    requiredCues: [],
    notes: ["默认按最稳妥的顺序解释：先牌效，再安全，再细分因子。"],
  };
}

function isPlacementQuestion(question: string, decisionContext: AnalysisDecisionContext | undefined, knowledgeCaseIds: Set<string>) {
  if (decisionContext?.applies) {
    return true;
  }

  if (knowledgeCaseIds.has("placement-sensitive-avoid-four-needs-round-context")) {
    return true;
  }

  return hasAnyCue(question.toLowerCase(), PLACEMENT_CUES);
}

function isFutureDoraTieBreakQuestion(question: string, comparison: CandidateComparison | undefined, knowledgeCaseIds: Set<string>) {
  if (knowledgeCaseIds.has("same-efficiency-white-green-dragon-dora-potential")) {
    return true;
  }

  if (!comparison) {
    return false;
  }

  const serializedQuestion = question.toLowerCase();
  return comparison.sameEfficiency && comparison.decidingFactors.some((factor) => factor.type === "future-dora-potential") && hasAnyCue(serializedQuestion, DORA_CUES);
}

function comparisonHasSafetyCue(comparisons: CandidateComparison[] | undefined) {
  return (comparisons ?? []).some((comparison) => comparison.decidingFactors.some((factor) => factor.type === "safety"));
}

function findRelevantComparison(
  comparisons: CandidateComparison[] | undefined,
  focusTiles: string[],
  topTile: string | undefined,
) {
  const candidates = comparisons ?? [];
  if (focusTiles.length >= 2) {
    return candidates.find((item) => focusTiles.every((tile) => item.left === tile || item.right === tile));
  }

  if (focusTiles.length === 1 && topTile) {
    return candidates.find((item) => [focusTiles[0], topTile].every((tile) => item.left === tile || item.right === tile));
  }

  if (focusTiles.length === 1) {
    return candidates.find((item) => item.left === focusTiles[0] || item.right === focusTiles[0]);
  }

  return candidates[0];
}

function hasAnyCue(question: string, cues: string[]) {
  return cues.some((cue) => question.includes(cue.toLowerCase()));
}
