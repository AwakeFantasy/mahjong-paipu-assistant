import { describe, expect, it } from "vitest";

import { answerAnalysisChat, buildAnalysisContext, buildVisibleAnalysisSnapshot, makeSnapshotKey } from "./analysis-chat";
import { buildPlaybackState } from "./playback";
import type { Player, Round } from "./types";

const players: Player[] = [
  { seat: 0, wind: "E", name: "A", accountId: 10001, startScore: 25000, score: "25,000", style: "目标" },
  { seat: 1, wind: "S", name: "B", accountId: 10002, startScore: 25000, score: "25,000", style: "门清" },
  { seat: 2, wind: "W", name: "C", accountId: 10003, startScore: 25000, score: "25,000", style: "门清" },
  { seat: 3, wind: "N", name: "D", accountId: 10004, startScore: 25000, score: "25,000", style: "门清" },
];

const round: Round = {
  id: "east-1",
  title: "东一局",
  windRound: 0,
  roundNumber: 0,
  honba: 0,
  riichiSticks: 0,
  dealer: "东家",
  result: "进行中",
  scoreDelta: "0",
  focus: "测试局",
  danger: "low",
  startScores: [25000, 25000, 25000, 25000],
  doraIndicators: ["1m"],
  initialHands: {
    0: ["1m", "2m", "3m", "5p"],
    1: [],
    2: [],
    3: [],
  },
  discards: { 0: [], 1: [], 2: [], 3: [] },
  calls: [],
  events: [
    { type: "draw", seat: 0, tile: "6p" },
    { type: "discard", seat: 0, tile: "5p", moqie: false, riichi: false },
    { type: "discard", seat: 1, tile: "8s", moqie: true, riichi: false },
  ],
};

describe("analysis chat snapshot", () => {
  it("binds snapshots to the visible cursor and removes account ids", () => {
    const first = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 1,
      playback: buildPlaybackState(round, 0, 1),
    });
    const second = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 2,
      playback: buildPlaybackState(round, 0, 2),
    });

    expect(makeSnapshotKey(first)).not.toBe(makeSnapshotKey(second));
    expect(first.targetHand).toContain("6p");
    expect(second.discards[0]).toEqual(["5p"]);
    expect(JSON.stringify(second)).not.toContain("accountId");
    expect(JSON.stringify(second)).not.toContain("10001");
  });

  it("answers with current-visible-information warnings", async () => {
    const snapshot = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 2,
    });
    const response = await answerAnalysisChat(
      { question: "这一步怎么打？", snapshot },
      { engine: { env: { ANALYSIS_ENABLE_ENGINE: "false" } }, llm: { env: {} } },
    );

    expect(response.snapshotKey).toContain("east-1:2/3:seat0");
    expect(response.answer).toContain("可见");
    expect(response.structured?.reasons.join(" ")).toContain("牌效");
    expect(response.engine.status).toBe("unavailable");
    expect(response.llm.status).toBe("unavailable");
    expect(response.warnings.join(" ")).toContain("不读取未来事件");
  });

  it("surfaces LLM failure details in the fallback answer", async () => {
    const snapshot = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 2,
    });
    const response = await answerAnalysisChat(
      { question: "这一步怎么打？", snapshot },
      {
        engine: { env: { ANALYSIS_ENABLE_ENGINE: "false" } },
        llm: {
          env: { ANALYSIS_LLM_API_KEY: "secret", ANALYSIS_LLM_MODEL: "bad-model" },
          fetch: async () => new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 400 }),
        },
      },
    );

    expect(response.llm.status).toBe("unavailable");
    expect(response.answer).not.toContain("风险");
    expect(response.warnings.join(" ")).toContain("400");
    expect(response.warnings.join(" ")).toContain("model not found");
    expect(response.structured?.risks.join(" ")).toContain("400");
  });

  it("sanitizes context and slices visible events to the current cursor", () => {
    const snapshot = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 2,
    });
    const context = buildAnalysisContext({
      question: "这一步怎么打？",
      snapshot,
      visibleEvents: round.events,
    });
    const serialized = JSON.stringify(context);

    expect(context.visibleEvents).toHaveLength(2);
    expect(serialized).not.toContain("accountId");
    expect(serialized).not.toContain("10001");
    expect(serialized).not.toContain('"name":"A"');
    expect(serialized).not.toContain("8s");
  });

  it("builds an analysis package without future events or private identifiers", async () => {
    const snapshot = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 2,
    });
    let llmBody = "";
    const response = await answerAnalysisChat(
      { question: "这一步怎么打？", snapshot, visibleEvents: round.events },
      {
        engine: {
          env: { MORTAL_ENGINE_URL: "http://engine.local/analyze" },
          fetch: async () => new Response(JSON.stringify({ recommendations: [{ action: "discard", tile: "1m", rank: 1, tags: ["mock"] }] }), { status: 200 }),
        },
        llm: {
          env: { ANALYSIS_LLM_BASE_URL: "http://llm.local/v1", ANALYSIS_LLM_API_KEY: "secret", ANALYSIS_LLM_MODEL: "mock-model" },
          fetch: async (_url, init) => {
            llmBody = String(init?.body);
            return new Response(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        engineAdvice: "use engine top discard",
                        llmExplanation: "recommendation first candidate available",
                        visibleLimitations: "visible information only",
                        warnings: [],
                      }),
                    },
                  },
                ],
              }),
              { status: 200 },
            );
          },
        },
      },
    );

    expect(response.structured?.reasons.join(" ")).toContain("recommendation first candidate available");
    expect(JSON.stringify(response.structured)).not.toContain("Mortal");
    expect(llmBody).toContain("visibleEvents");
    expect(llmBody).toContain("engine");
    expect(llmBody).not.toContain("accountId");
    expect(llmBody).not.toContain("10001");
    expect(llmBody).not.toContain("8s");
  });

  it("adds an explanation boundary instead of inventing a possible reason", async () => {
    const snapshot = {
      source: { id: "sample", region: "cn" as const },
      round: { id: "east-1", title: "东1局", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "东家", danger: "low" as const },
      cursor: 105,
      maxCursor: 109,
      targetSeat: 0 as const,
      players: [{ seat: 0 as const, wind: "E" as const, name: "A", score: "25,000", startScore: 25000, style: "目标" }],
      doraIndicators: ["1m"],
      targetHand: ["2m", "3m", "3m", "4m", "5m", "6s", "7s", "8s", "2p", "3p", "4p"],
      discards: { 0: [], 1: ["9p", "4s", "6s"], 2: ["7s"], 3: [] },
      calls: { 0: [], 1: [], 2: [], 3: [] },
      riichiTiles: { 0: [], 1: [1], 2: [], 3: [] },
      currentEventText: "东1局 0本场",
    };
    const visibleEvents: Round["events"] = [
      { type: "discard", seat: 2, tile: "7s", moqie: false, riichi: false },
      { type: "discard", seat: 1, tile: "4s", moqie: false, riichi: true },
      { type: "discard", seat: 1, tile: "6s", moqie: false, riichi: false },
    ];
    const llmFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const systemPrompt = String(body.messages[0].content);

      if (systemPrompt.includes("规划器")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ answer: "规划", answerMode: "explain", summary: "解释 6索 vs 7索", focusPoints: [], requiredFacts: [], avoidClaims: [], priorityOrder: [], tone: "简洁", warnings: [] }) } }],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "更推荐切6索。",
                  conclusion: "更推荐切6索，保留7索。",
                  reasons: ["当前推荐排序更偏向切6索。"],
                  risks: ["只看当前可见信息。"],
                  suggestedQuestions: [],
                  evidence: [],
                  evidenceIds: [],
                  directReplies: [],
                  correctionsAccepted: [],
                  warnings: [],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    };

    const response = await answerAnalysisChat(
      { question: "为什么mortal觉得切6s比7s好？", snapshot, visibleEvents },
      {
        engine: {
          env: { MORTAL_ENGINE_URL: "http://engine.local/analyze" },
          fetch: async () =>
            new Response(
              JSON.stringify({
                recommendations: [
                  { action: "discard", tile: "6s", rank: 1, probability: 0.48, tags: [] },
                  { action: "discard", tile: "7s", rank: 3, probability: 0.16, tags: [] },
                ],
              }),
              { status: 200 },
            ),
        },
        llm: {
          env: { ANALYSIS_LLM_BASE_URL: "http://llm.local/v1", ANALYSIS_LLM_API_KEY: "secret", ANALYSIS_LLM_MODEL: "mock-model" },
          fetch: llmFetch,
        },
      },
    );

    expect(response.answer).toContain("解释边界");
    expect(response.answer).not.toContain("可能次因");
    expect(response.answer).not.toContain("全桌已见 7索");
    expect(response.structured?.conclusion).toContain("解释边界");
  });

  it("surfaces llm timeout at the front of the fallback answer", async () => {
    const snapshot = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 2,
    });
    const response = await answerAnalysisChat(
      { question: "杩欎竴姝ユ€庝箞鎵擄紵", snapshot },
      {
        engine: { env: { ANALYSIS_ENABLE_ENGINE: "false" } },
        llm: {
          env: { ANALYSIS_LLM_API_KEY: "secret", ANALYSIS_LLM_MODEL: "mock-model" },
          fetch: async () => {
            throw new DOMException("The operation was aborted.", "AbortError");
          },
        },
      },
    );

    expect(response.llm.status).toBe("unavailable");
    expect(response.answer.startsWith("LLM 请求超时")).toBe(true);
    expect(response.structured?.conclusion.startsWith("LLM 请求超时")).toBe(true);
  });

  it("surfaces gateway timeout responses at the front of the fallback answer", async () => {
    const snapshot = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 2,
    });
    const response = await answerAnalysisChat(
      { question: "为什么这里推荐切8筒而不是4筒呢？", snapshot },
      {
        engine: { env: { ANALYSIS_ENABLE_ENGINE: "false" } },
        llm: {
          env: { ANALYSIS_LLM_API_KEY: "secret", ANALYSIS_LLM_MODEL: "mock-model" },
          fetch: async () => new Response("gateway timeout", { status: 504 }),
        },
      },
    );

    expect(response.llm.failureReason).toBe("timeout");
    expect(response.answer.startsWith("LLM 请求超时")).toBe(true);
    expect(response.structured?.conclusion.startsWith("LLM 请求超时")).toBe(true);
  });
});
