import type { AnalysisDecisionContext, VisibleAnalysisSnapshot } from "./types";

const PLACEMENT_KEYWORDS = [
  "避4",
  "打点",
  "本场",
  "供托",
  "东场",
  "南场",
  "西场",
  "北场",
  "名次",
  "分差",
  "点差",
  "追分",
  "守位",
  "保四",
  "末局",
  "终局",
  "收支",
  "点棒",
  "领跑",
  "垫底",
  "最后一局",
  "最后几巡",
];

const ENDGAME_KEYWORDS = ["末巡", "终局", "终盘", "最后一巡", "最后几巡", "海底", "河底", "流局", "收支", "押", "降"];

export function buildDecisionContext(snapshot: VisibleAnalysisSnapshot, question: string): AnalysisDecisionContext {
  const scores = snapshot.players
    .map((player) => ({
      seat: player.seat,
      score: parseScore(player.score) ?? player.startScore,
    }))
    .sort((left, right) => right.score - left.score || left.seat - right.seat);

  const targetScore = scores.find((item) => item.seat === snapshot.targetSeat)?.score ?? 0;
  const targetRank = Math.max(1, scores.findIndex((item) => item.seat === snapshot.targetSeat) + 1);
  const leaderScore = scores[0]?.score ?? targetScore;
  const thirdScore = scores[2]?.score;
  const fourthScore = scores[3]?.score;
  const gapToLeader = Math.max(0, leaderScore - targetScore);
  const gapToThird = typeof thirdScore === "number" ? Math.max(0, thirdScore - targetScore) : undefined;
  const gapToFourth = typeof fourthScore === "number" ? Math.max(0, targetScore - fourthScore) : undefined;
  const tableWind = roundWindLabel(snapshot.round.windRound);
  const roundLabel = snapshot.round.title || `${tableWind} ${snapshot.round.roundNumber + 1}局`;
  const placementQuestion = includesAny(question, PLACEMENT_KEYWORDS);
  const endgameQuestion = includesAny(question, ENDGAME_KEYWORDS) || (snapshot.round.windRound >= 1 && snapshot.cursor >= Math.floor(snapshot.maxCursor * 0.75));
  const rankPressure = shouldApplyRankPressure({
    targetRank,
    gapToFourth,
    tableWind: snapshot.round.windRound,
    cursor: snapshot.cursor,
    maxCursor: snapshot.maxCursor,
  });
  const mode: AnalysisDecisionContext["mode"] = placementQuestion || rankPressure ? "placement" : endgameQuestion ? "endgame" : "normal";
  const applies = mode !== "normal";

  const requiredFacts = applies
    ? [
        `${tableWind}场`,
        `${snapshot.round.honba}本场`,
        snapshot.round.riichiSticks ? `${snapshot.round.riichiSticks}供托` : "无供托",
        `当前第${targetRank}名`,
        `与第1名差${formatGap(gapToLeader)}`,
        ...(typeof gapToThird === "number" ? [`与第3名差${formatGap(gapToThird)}`] : []),
        ...(typeof gapToFourth === "number" ? [`领先第4名${formatGap(gapToFourth)}`] : []),
        ...(rankPressure ? [buildRankPressureFact(targetRank, gapToFourth)] : []),
      ]
    : [];

  const notes = applies
    ? [
        "避4和打点不是纯牌效题，场风、本场和分差会改变牌的目标函数。",
        "同样的进攻力度，在东场和南场、在本场和供托不同的局面里，含义可能不一样。",
        ...(rankPressure ? ["当前名次偏后时，需要主动检查这一步是在追分、守位，还是因为安全压力暂时保守。"] : []),
      ]
    : [];

  return {
    applies,
    mode,
    tableWind,
    tableWindLabel: `${tableWind}场`,
    roundLabel,
    honba: snapshot.round.honba,
    riichiSticks: snapshot.round.riichiSticks,
    targetRank,
    targetScore,
    leaderScore,
    gapToLeader,
    gapToThird,
    gapToFourth,
    scoreSummary: buildScoreSummary(scores, snapshot.targetSeat),
    requiredFacts,
    notes,
  };
}

export function formatDecisionContextSummary(context: AnalysisDecisionContext) {
  if (!context.applies) {
    return "";
  }

  return `${context.roundLabel}，${context.tableWindLabel}，${context.honba}本场${context.riichiSticks ? `，${context.riichiSticks}供托` : ""}，目标第${context.targetRank}名，分差 ${context.scoreSummary}`;
}

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function shouldApplyRankPressure({
  targetRank,
  gapToFourth,
  tableWind,
  cursor,
  maxCursor,
}: {
  targetRank: number;
  gapToFourth?: number;
  tableWind: number;
  cursor: number;
  maxCursor: number;
}) {
  if (targetRank >= 4) {
    return true;
  }

  if (targetRank !== 3) {
    return false;
  }

  const inSouthOrLater = tableWind >= 1;
  const nearEnd = maxCursor > 0 && cursor >= Math.floor(maxCursor * 0.75);
  const closeToFourth = typeof gapToFourth === "number" && gapToFourth <= 8000;

  return inSouthOrLater || nearEnd || closeToFourth;
}

function buildRankPressureFact(targetRank: number, gapToFourth?: number) {
  if (targetRank >= 4) {
    return "当前第4名，需要检查追分和打点目标";
  }

  if (typeof gapToFourth === "number") {
    return `当前第3名，领先第4名${formatGap(gapToFourth)}，需要兼顾避4与追分`;
  }

  return "当前第3名，需要兼顾避4与追分";
}

function buildScoreSummary(scores: Array<{ seat: number; score: number }>, targetSeat: number) {
  const target = scores.find((item) => item.seat === targetSeat);
  if (!target) {
    return "当前分差暂不可用";
  }

  const leader = scores[0];
  const third = scores[2];
  const fourth = scores[3];
  const parts = [`第1名${formatScore(leader?.score)}`, `自己${formatScore(target.score)}`];

  if (third) {
    parts.push(`第3名${formatScore(third.score)}`);
  }

  if (fourth) {
    parts.push(`第4名${formatScore(fourth.score)}`);
  }

  return parts.join("，");
}

function roundWindLabel(windRound: number) {
  return ["东", "南", "西", "北"][windRound] ?? "未知";
}

function formatScore(score: number | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "未知";
  }

  return `${score.toLocaleString("zh-CN")}分`;
}

function formatGap(value: number) {
  return `${value.toLocaleString("zh-CN")}分`;
}

function parseScore(value: string) {
  const normalized = Number(value.replace(/[,\s]/g, ""));
  return Number.isFinite(normalized) ? normalized : null;
}
