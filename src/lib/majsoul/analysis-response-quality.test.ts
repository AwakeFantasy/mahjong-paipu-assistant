import { describe, expect, it } from "vitest";

import { answerAnalysisChat, buildVisibleAnalysisSnapshot } from "./analysis-chat";
import type { AnalysisChatResponse, AnalysisEngineRecommendation, Player, Round } from "./types";

const players: Player[] = [
  { seat: 0, wind: "E", name: "A", accountId: 10001, startScore: 25000, score: "25,000", style: "目标" },
  { seat: 1, wind: "S", name: "B", accountId: 10002, startScore: 25000, score: "25,000", style: "门清" },
  { seat: 2, wind: "W", name: "C", accountId: 10003, startScore: 25000, score: "25,000", style: "门清" },
  { seat: 3, wind: "N", name: "D", accountId: 10004, startScore: 25000, score: "25,000", style: "门清" },
];

describe("analysis response quality", () => {
  it("keeps dora candidate-comparison answers concise and free of tool internals", async () => {
    const response = await askWithMockedModel({
      question: "为什么这里mortal推荐应该切发财而不是切白板？",
      round: makeRound({
        doraIndicators: ["9p"],
        initialHand: ["1m", "7m", "8m", "9m", "3p", "6p", "7p", "1s", "2s", "3z", "3z", "5z", "6z"],
        events: [{ type: "draw", seat: 0, tile: "5m" }],
      }),
      recommendations: [
        { action: "discard", tile: "6z", rank: 1, probability: 0.38, tags: [] },
        { action: "discard", tile: "5z", rank: 3, probability: 0.27, tags: [] },
      ],
      llmContent: {
        answer: "Mortal 推荐切发财。",
        conclusion: "Mortal 推荐切发财而非白板。",
        reasons: ["analysisPackage.candidateComparisons 显示 preferredDiscardTile=6z。", "牌效相同，白板未来宝牌潜力更高。"],
        risks: ["先切发财可能会让对手察觉你保留白板。", "未来宝牌只是概率优势。"],
        evidence: ["candidateComparisons left=6z right=5z。"],
        suggestedQuestions: ["如果红中也见了一枚呢？"],
        directReplies: ["Mortal在当前光标位置并未输出推荐动作，但candidateComparisons工具明确根据牌效和未来宝牌潜力给出了倾向。"],
        warnings: [],
      },
    });

    assertPublicResponseClean(response);
    expect(response.answer).toContain("更推荐切发财");
    expect(response.structured?.reasons.join(" ").replace(/\s+/g, "")).toContain("当前推荐排序更偏向切发财");
    expect(response.structured?.risks.join(" ")).not.toContain("察觉");
  });

  it("sanitizes ordinary tile-efficiency difference answers", async () => {
    const response = await askWithMockedModel({
      question: "为什么这里推荐切1万而不是切5筒？",
      round: makeRound({
        doraIndicators: ["4p"],
        initialHand: ["1m", "2m", "3m", "4m", "6m", "7p", "8p", "9p", "2s", "3s", "4s", "5z", "6z"],
        events: [{ type: "draw", seat: 0, tile: "5p" }],
      }),
      recommendations: [
        { action: "discard", tile: "1m", rank: 1, probability: 0.41, tags: [] },
        { action: "discard", tile: "5p", rank: 2, probability: 0.31, tags: [] },
      ],
      llmContent: {
        answer: "推荐切1万。",
        conclusion: "Mortal 推荐切1万。",
        reasons: ["tileEfficiency 显示切1m受入更好。", "切1万不破坏主要复合形。"],
        risks: ["analysisPackage 只包含当前光标前信息。", "如果未来摸到1万会后悔。"],
        evidence: ["engine.topRecommendations rank=1。"],
        suggestedQuestions: ["切5筒会怎样？"],
        directReplies: ["比较 1万 vs 5筒"],
        warnings: [],
      },
    });

    assertPublicResponseClean(response);
    expect(response.answer).toContain("更推荐切1万");
    expect(response.structured?.reasons).toEqual(["切1万不破坏主要复合形。"]);
    expect(response.structured?.suggestedQuestions).toContain("切5筒会怎样？");
  });

  it("rejects unsafe riichi-defense claims and falls back to controlled answer", async () => {
    const response = await askWithMockedModel({
      question: "对面立直了，为什么这里可以切3万而不是6筒？这张安全吗？",
      round: makeRound({
        doraIndicators: ["4p"],
        initialHand: ["2m", "3m", "4m", "6p", "7p", "8p", "2s", "3s", "4s", "5z", "6z", "7z", "1m"],
        events: [
          { type: "discard", seat: 1, tile: "3m", moqie: false, riichi: true },
          { type: "draw", seat: 0, tile: "9s" },
        ],
      }),
      recommendations: [
        { action: "discard", tile: "3m", rank: 1, probability: 0.52, tags: [] },
        { action: "discard", tile: "6p", rank: 2, probability: 0.21, tags: [] },
      ],
      llmContent: {
        answer: "筋牌就是安全牌。",
        conclusion: "筋牌就是安全牌。",
        reasons: ["筋牌就是安全牌", "有筋就可以无视立直"],
        risks: [],
        evidence: [],
        suggestedQuestions: ["这张是现物吗？"],
        directReplies: ["只看安全度怎么选？"],
        warnings: [],
      },
    });

    assertPublicResponseClean(response);
    expect(JSON.stringify(response.structured)).not.toContain("筋牌就是安全牌");
    expect(response.warnings.join(" ")).toContain("已知错误说法");
  });

  it("does not invent an arbitrary comparison when the user only asks about one discard", async () => {
    const response = await askWithMockedModel({
      question: "为什么这里要切5z而不是别的牌？",
      round: makeRound({
        doraIndicators: ["4p"],
        initialHand: ["1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "2s", "3s", "4s", "5z"],
        events: [{ type: "draw", seat: 0, tile: "5z" }],
      }),
      recommendations: [{ action: "discard", tile: "5z", rank: 1, probability: 0.4, tags: [] }],
      llmContent: {
        answer: "更推荐切这张牌。",
        conclusion: "更推荐切这张牌。",
        reasons: ["analysisPackage 显示可以切。"],
        risks: [],
        evidence: ["candidateComparisons"],
        suggestedQuestions: ["如果切另一张会怎样？"],
        directReplies: ["解释这一步"],
        warnings: [],
      },
    });

    assertPublicResponseClean(response);
    expect(response.structured?.conclusion).toContain("切 白");
    expect(response.answer).not.toContain("1万 与 2万");
    expect(response.warnings.join(" ")).toContain("回答过于笼统");
  });

  it("falls back to a fuller controlled explanation for thin reaction answers", async () => {
    const response = await askWithMockedModel({
      question: "为什么这里要杠 1p？",
      round: makeRound({
        doraIndicators: ["4p"],
        initialHand: ["1p", "1p", "1p", "2m", "3m", "4m", "7p", "8p", "9p", "2s", "3s", "4s", "5z"],
        events: [{ type: "discard", seat: 1, tile: "1p", moqie: false, riichi: false }],
      }),
      recommendations: [{ action: "kan", tile: "1p", rank: 1, probability: 0.4, tags: [] }],
      llmContent: {
        answer: "更推荐杠 1p",
        conclusion: "更推荐杠 1p",
        reasons: ["analysisPackage 显示 action 相关信息。"],
        risks: [],
        evidence: [],
        suggestedQuestions: ["为什么不是跳过？"],
        directReplies: ["解释这一步"],
        warnings: [],
      },
    });

    assertPublicResponseClean(response);
    expect(response.structured?.conclusion).toContain("杠 1筒");
    expect(response.structured?.reasons.join(" ")).toContain("反应点");
    expect(response.warnings.join(" ")).toContain("回答过于笼统");
  });

  it("rejects unsupported future-dora-potential explanations for ordinary number-tile shape choices", async () => {
    const response = await askWithMockedModel({
      question: "这里为什么不推荐切8筒呢？",
      round: makeRound({
        doraIndicators: ["4p"],
        initialHand: ["5m", "5m", "7m", "7m", "8m", "3p", "5p", "8p", "9p", "9p", "2s", "4s", "6s"],
        events: [{ type: "draw", seat: 0, tile: "4p" }],
      }),
      recommendations: [
        { action: "discard", tile: "9p", rank: 1, probability: 0.57, tags: [] },
        { action: "discard", tile: "8p", rank: 3, probability: 0.08, tags: [] },
      ],
      llmContent: {
        answer: "不推荐切8筒，因为切9筒是牌效和宝牌潜力都更好的选择。",
        conclusion: "不推荐切8筒，因为切9筒是牌效和宝牌潜力都更好的选择。",
        reasons: ["切9筒后受入更多。", "8筒若保留有未来宝牌潜力，7筒全未现。"],
        risks: [],
        evidence: [],
        suggestedQuestions: ["如果保留8筒，未来摸到哪些牌能改善牌型？"],
        directReplies: [],
        warnings: [],
      },
    });

    assertPublicResponseClean(response);
    expect(JSON.stringify(response.structured)).not.toContain("未来宝牌潜力");
    expect(response.structured?.reasons.join(" ")).toContain("牌效");
    expect(response.warnings.join(" ")).toContain("未被工具支持的未来宝牌潜力");
  });
});

async function askWithMockedModel({
  question,
  round,
  recommendations,
  llmContent,
}: {
  question: string;
  round: Round;
  recommendations: AnalysisEngineRecommendation[];
  llmContent: Record<string, unknown>;
}) {
  const snapshot = buildVisibleAnalysisSnapshot({
    source: { id: "quality", region: "cn" },
    players,
    round,
    targetSeat: 0,
    cursor: round.events.length,
  });

  return answerAnalysisChat(
    { question, snapshot, visibleEvents: round.events },
    {
      engine: {
        env: { MORTAL_ENGINE_URL: "http://engine.local/analyze" },
        fetch: async () => new Response(JSON.stringify({ recommendations }), { status: 200 }),
      },
      llm: {
        env: { ANALYSIS_LLM_BASE_URL: "http://llm.local/v1", ANALYSIS_LLM_API_KEY: "secret", ANALYSIS_LLM_MODEL: "mock-model" },
        fetch: async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(llmContent) } }],
            }),
            { status: 200 },
          ),
      },
    },
  );
}

function makeRound({
  doraIndicators,
  initialHand,
  events,
}: {
  doraIndicators: string[];
  initialHand: string[];
  events: Round["events"];
}): Round {
  return {
    id: "east-1",
    title: "东一局",
    windRound: 0,
    roundNumber: 0,
    honba: 0,
    riichiSticks: 0,
    dealer: "东家",
    result: "进行中",
    scoreDelta: "0",
    focus: "质量回归",
    danger: "mid",
    startScores: [25000, 25000, 25000, 25000],
    doraIndicators,
    initialHands: { 0: initialHand, 1: [], 2: [], 3: [] },
    discards: { 0: [], 1: [], 2: [], 3: [] },
    calls: [],
    events,
  };
}

function assertPublicResponseClean(response: AnalysisChatResponse) {
  const serialized = JSON.stringify({
    answer: response.answer,
    structured: response.structured,
  });

  expect(serialized).not.toMatch(/Mortal|analysisPackage|candidateComparisons|doraAnalysis|tileEfficiency|knowledgeCases|toolPlan|preferredKeepTile|preferredDiscardTile|engine\.|left=|right=/i);
  expect(response.structured?.directReplies?.every((item) => item.length <= 34)).not.toBe(false);
  expect(response.structured?.suggestedQuestions?.every((item) => item.length <= 34)).not.toBe(false);
}
