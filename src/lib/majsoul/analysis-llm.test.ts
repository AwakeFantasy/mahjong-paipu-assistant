import { describe, expect, it, vi } from "vitest";

import { generateLlmAnalysis, getAnalysisLlmConfig } from "./analysis-llm";
import type { AnalysisContext, AnalysisEngineResult } from "./types";

const context: AnalysisContext = {
  mode: "current-hand",
  question: "why discard 1m?",
  visibleSummary: ["East 1, cursor 1/2"],
  visibleEvents: [{ type: "discard", seat: 1, tile: "9s", moqie: true, riichi: false }],
  snapshot: {
    source: { id: "sample", region: "cn" },
    round: { id: "east-1", title: "East 1", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "East", danger: "low" },
    cursor: 1,
    maxCursor: 2,
    targetSeat: 0,
    players: [{ seat: 0, wind: "E", name: "A", score: "25,000", startScore: 25000, style: "target" }],
    doraIndicators: ["4p"],
    targetHand: ["1m", "2m", "3m"],
    discards: { 0: [], 1: ["9s"], 2: [], 3: [] },
    calls: { 0: [], 1: [], 2: [], 3: [] },
    riichiTiles: { 0: [], 1: [], 2: [], 3: [] },
    currentEventText: "S discards 9s",
  },
};

const engine: AnalysisEngineResult = {
  status: "available",
  recommendations: [{ action: "discard", tile: "1m", rank: 1, score: 0.7, tags: ["engine"] }],
  warnings: [],
};

describe("generateLlmAnalysis", () => {
  it("uses stable defaults and requested DeepSeek aliases", () => {
    expect(getAnalysisLlmConfig({}).timeoutMs).toBe(60000);

    const flash = getAnalysisLlmConfig({ ANALYSIS_LLM_BASE_URL: "https://api.deepseek.com" }, "flash");
    expect(flash.model).toBe("deepseek-v4-flash");
    expect(flash.timeoutMs).toBe(60000);
    expect(flash.responseFormat).toBe("json_object");

    const pro = getAnalysisLlmConfig({}, "pro");
    expect(pro.model).toBe("deepseek-v4-pro");
    expect(pro.timeoutMs).toBe(120000);
  });

  it("allows environment overrides for requested DeepSeek model aliases", () => {
    const config = getAnalysisLlmConfig(
      {
        ANALYSIS_LLM_PRO_MODEL: "custom-pro",
        ANALYSIS_LLM_PRO_TIMEOUT_MS: "150000",
      },
      "pro",
    );

    expect(config.model).toBe("custom-pro");
    expect(config.timeoutMs).toBe(150000);
  });

  it("returns unavailable when no OpenAI-compatible model is configured", async () => {
    const result = await generateLlmAnalysis(context, engine, { env: {} });

    expect(result.answer).toBeUndefined();
    expect(result.llm.status).toBe("unavailable");
    expect(result.llm.failureReason).toBe("missing-config");
  });

  it("posts a structured-output chat completion request and maps it to chat structure", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const userPayload = JSON.parse(body.messages[1].content);

      expect(String(url)).toBe("https://llm.example/v1/chat/completions");
      expect(body.model).toBe("test-model");
      expect(body.response_format.type).toBe("json_schema");
      expect(body.messages[0].content).toContain("不要推断 Mortal 的隐藏内部权重");
      expect(body.messages[0].content).toContain("counterfactualSummary");
      expect(body.messages[0].content).toContain("牌型路线");
      expect(body.messages[0].content).toContain("当前系统不硬猜");
      expect(userPayload.question).toBe(context.question);
      expect(userPayload.engine.recommendations[0].tile).toBe("1m");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  engineAdvice: "discard 1m",
                  llmExplanation: "engine and efficiency agree",
                  visibleLimitations: "visible information only",
                  warnings: ["mock warning"],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const result = await generateLlmAnalysis(context, engine, {
      fetch: fetchMock as unknown as typeof fetch,
      env: {
        ANALYSIS_LLM_BASE_URL: "https://llm.example/v1",
        ANALYSIS_LLM_API_KEY: "secret",
        ANALYSIS_LLM_MODEL: "test-model",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.llm.status).toBe("available");
    expect(result.llm.warnings).toEqual(["mock warning"]);
    expect(result.answer).toContain("discard 1m");
    expect(result.structured?.conclusion).toBe("discard 1m");
    expect(result.structured?.reasons).toEqual(["engine and efficiency agree"]);
    expect(result.structured?.risks).toEqual(["visible information only"]);
  });

  it("falls back to plain text when JSON parsing fails", async () => {
    const result = await generateLlmAnalysis(context, engine, {
      fetch: vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "plain answer" } }] }), { status: 200 })) as unknown as typeof fetch,
      env: {
        ANALYSIS_LLM_BASE_URL: "https://llm.example/v1",
        ANALYSIS_LLM_API_KEY: "secret",
        ANALYSIS_LLM_MODEL: "test-model",
      },
    });

    expect(result.llm.status).toBe("available");
    expect(result.llm.warnings.join(" ")).toContain("JSON");
    expect(result.answer).toContain("plain answer");
    expect(result.structured).toBeUndefined();
  });

  it("marks abort-like provider failures as timeout", async () => {
    const result = await generateLlmAnalysis(context, engine, {
      fetch: vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      }) as unknown as typeof fetch,
      env: {
        ANALYSIS_LLM_BASE_URL: "https://llm.example/v1",
        ANALYSIS_LLM_API_KEY: "secret",
        ANALYSIS_LLM_MODEL: "test-model",
      },
    });

    expect(result.llm.status).toBe("unavailable");
    expect(result.llm.failureReason).toBe("timeout");
  });

  it("marks gateway timeout responses as timeout", async () => {
    const result = await generateLlmAnalysis(context, engine, {
      fetch: vi.fn(async () => new Response("gateway timeout", { status: 504 })) as unknown as typeof fetch,
      env: {
        ANALYSIS_LLM_BASE_URL: "https://llm.example/v1",
        ANALYSIS_LLM_API_KEY: "secret",
        ANALYSIS_LLM_MODEL: "test-model",
      },
    });

    expect(result.llm.status).toBe("unavailable");
    expect(result.llm.failureReason).toBe("timeout");
    expect(result.llm.warnings.join(" ")).toContain("504");
  });
});
