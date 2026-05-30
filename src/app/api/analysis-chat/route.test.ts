import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildVisibleAnalysisSnapshot } from "../../../lib/majsoul/analysis-chat";
import type { Player, Round } from "../../../lib/majsoul/types";

import { POST } from "./route";

const players: Player[] = [
  { seat: 0, wind: "E", name: "A", accountId: 1, startScore: 25000, score: "25,000", style: "目标" },
  { seat: 1, wind: "S", name: "B", accountId: 2, startScore: 25000, score: "25,000", style: "门清" },
  { seat: 2, wind: "W", name: "C", accountId: 3, startScore: 25000, score: "25,000", style: "门清" },
  { seat: 3, wind: "N", name: "D", accountId: 4, startScore: 25000, score: "25,000", style: "门清" },
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
  focus: "测试",
  danger: "mid",
  startScores: [25000, 25000, 25000, 25000],
  doraIndicators: ["4p"],
  initialHands: { 0: ["1m", "2m", "3m"], 1: [], 2: [], 3: [] },
  discards: { 0: [], 1: [], 2: [], 3: [] },
  calls: [],
  events: [{ type: "discard", seat: 1, tile: "9s", moqie: true, riichi: false }],
};

describe("POST /api/analysis-chat", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("answers from a sanitized snapshot", async () => {
    vi.stubEnv("ANALYSIS_ENABLE_ENGINE", "false");
    vi.stubEnv("ANALYSIS_LLM_API_KEY", "");
    vi.stubEnv("ANALYSIS_LLM_MODEL", "");

    const snapshot = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 1,
    });
    const response = await POST(makeRequest({ question: "现在危险牌有哪些？", snapshot }));
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload.snapshotKey).toContain("sample:east-1:1/1:seat0");
    expect(payload.answer).toContain("当前可见");
    expect(payload.engine.status).toBe("unavailable");
    expect(payload.llm.status).toBe("unavailable");
    expect(serialized).not.toContain("accountId");
  });

  it("rejects missing snapshots", async () => {
    const response = await POST(makeRequest({ question: "这一步怎么打？" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("BAD_REQUEST");
  });

  it("returns stable hybrid schema when engine and LLM are configured", async () => {
    vi.stubEnv("MORTAL_ENGINE_URL", "http://engine.local/analyze");
    vi.stubEnv("ANALYSIS_LLM_BASE_URL", "http://llm.local/v1");
    vi.stubEnv("ANALYSIS_LLM_API_KEY", "secret");
    vi.stubEnv("ANALYSIS_LLM_MODEL", "mock-model");

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const serializedBody = String(init?.body);

      expect(serializedBody).not.toContain("accountId");
      expect(serializedBody).not.toContain('"name":"A"');

      if (String(url) === "http://engine.local/analyze") {
        return new Response(JSON.stringify({ recommendations: [{ action: "discard", tile: "1m", rank: 1, score: 0.8, tags: ["mock"] }] }), { status: 200 });
      }

      expect(serializedBody).toContain("analysisPackage");
      expect(serializedBody).toContain("topRecommendations");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "保留复合形，先处理孤张。",
                  conclusion: "保留复合形，先处理孤张。",
                  reasons: ["保留复合形", "处理孤张"],
                  risks: ["不读取未来事件"],
                  suggestedQuestions: ["这巡该押吗"],
                  evidence: ["Mortal 第一候选"],
                  warnings: [],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 1,
    });
    const response = await POST(makeRequest({ question: "这一步怎么打？", snapshot, visibleEvents: round.events }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.engine.status).toBe("available");
    expect(payload.engine.recommendations[0].tile).toBe("1m");
    expect(payload.llm).toMatchObject({ provider: "openai-compatible", model: "mock-model", status: "available" });
    expect(payload.answer).toContain("保留复合形");
    expect(payload.answer).toContain("理由");
    expect(payload.answer).not.toContain("Mortal");
    expect(payload.structured.reasons).toContain("保留复合形");
  });

  it("passes requested flash/pro model choices to the LLM provider", async () => {
    vi.stubEnv("ANALYSIS_ENABLE_ENGINE", "false");
    vi.stubEnv("ANALYSIS_LLM_BASE_URL", "http://llm.local/v1");
    vi.stubEnv("ANALYSIS_LLM_API_KEY", "secret");
    vi.stubEnv("ANALYSIS_LLM_MODEL", "mock-model");

    const seenModels: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      seenModels.push(body.model);

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "模型选择已生效。",
                  keyPoints: [],
                  caveats: ["不读取未来事件"],
                  suggestedQuestions: [],
                  warnings: [],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 1,
    });

    await POST(makeRequest({ question: "这一步怎么打？", snapshot, llmModel: "flash" }));
    await POST(makeRequest({ question: "这一步怎么打？", snapshot, llmModel: "pro" }));

    expect(seenModels).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
  });
});

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/analysis-chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });
}
