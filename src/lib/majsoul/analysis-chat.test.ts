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
    { type: "discard", seat: 1, tile: "9m", moqie: true, riichi: false },
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
    expect(response.answer).toContain("当前可见信息");
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
    expect(response.answer).toContain("暂时没有拿到模型回答");
    expect(response.answer).toContain("400");
    expect(response.answer).toContain("model not found");
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
    expect(serialized).not.toContain("9m");
  });
});
