import { describe, expect, it, vi } from "vitest";

import { generateLlmAnalysis, getAnalysisLlmConfig } from "./analysis-llm";
import type { AnalysisContext, AnalysisEngineResult } from "./types";

const context: AnalysisContext = {
  mode: "current-hand",
  question: "这一步怎么打？",
  visibleSummary: ["东一局，光标 1/2"],
  visibleEvents: [{ type: "discard", seat: 1, tile: "9s", moqie: true, riichi: false }],
  snapshot: {
    source: { id: "sample", region: "cn" },
    round: { id: "east-1", title: "东一局", windRound: 0, roundNumber: 0, honba: 0, riichiSticks: 0, dealer: "东家", danger: "low" },
    cursor: 1,
    maxCursor: 2,
    targetSeat: 0,
    players: [{ seat: 0, wind: "E", name: "A", score: "25,000", startScore: 25000, style: "目标" }],
    doraIndicators: ["4p"],
    targetHand: ["1m", "2m", "3m"],
    discards: { 0: [], 1: ["9s"], 2: [], 3: [] },
    calls: { 0: [], 1: [], 2: [], 3: [] },
    riichiTiles: { 0: [], 1: [], 2: [], 3: [] },
    currentEventText: "S B 切 9s",
  },
};

const engine: AnalysisEngineResult = {
  status: "available",
  recommendations: [{ action: "discard", tile: "1m", rank: 1, score: 0.7, tags: ["engine"] }],
  warnings: [],
};

describe("generateLlmAnalysis", () => {
  it("defaults to a slower-model-friendly timeout", () => {
    expect(getAnalysisLlmConfig({}).timeoutMs).toBe(60000);
  });

  it("uses the requested DeepSeek flash model", () => {
    const config = getAnalysisLlmConfig({}, "flash");

    expect(config.model).toBe("deepseek-v4-flash");
    expect(config.timeoutMs).toBe(60000);
  });

  it("uses a 120 second default timeout for the requested DeepSeek pro model", () => {
    const config = getAnalysisLlmConfig({}, "pro");

    expect(config.model).toBe("deepseek-v4-pro");
    expect(config.timeoutMs).toBe(120000);
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
  });

  it("posts a structured-output chat completion request", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const serialized = JSON.stringify(body);

      expect(String(url)).toBe("https://llm.example/v1/chat/completions");
      expect(body.model).toBe("test-model");
      expect(body.response_format.type).toBe("json_schema");
      expect(body.messages[0].content).toContain("JSON");
      expect(serialized).not.toContain("accountId");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "这手先保留两面形，候选切牌可以先从孤张开始比较。",
                  keyPoints: ["保留两面形", "先比较孤张"],
                  caveats: ["只看当前光标前信息"],
                  suggestedQuestions: ["这巡该押吗"],
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
      fetch: fetchMock as typeof fetch,
      env: {
        ANALYSIS_LLM_BASE_URL: "https://llm.example/v1",
        ANALYSIS_LLM_API_KEY: "secret",
        ANALYSIS_LLM_MODEL: "test-model",
      },
    });

    expect(result.llm.status).toBe("available");
    expect(result.llm.provider).toBe("openai-compatible");
    expect(result.answer).toContain("这手先保留两面形");
    expect(result.answer).toContain("要点");
    expect(result.answer).toContain("注意");
  });

  it("omits response_format for DeepSeek-compatible gateways", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));

      expect(body.response_format).toBeUndefined();

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "解释。",
                  keyPoints: [],
                  caveats: ["只看当前"],
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

    const result = await generateLlmAnalysis(context, engine, {
      fetch: fetchMock as typeof fetch,
      env: {
        ANALYSIS_LLM_BASE_URL: "https://api.deepseek.com",
        ANALYSIS_LLM_API_KEY: "secret",
        ANALYSIS_LLM_MODEL: "deepseek-v4-pro",
      },
    });

    expect(result.llm.status).toBe("available");
    expect(result.llm.model).toBe("deepseek-v4-pro");
  });

  it("falls back to plain text when JSON parsing fails", async () => {
    const result = await generateLlmAnalysis(context, engine, {
      fetch: vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "直接文本回答" } }] }), { status: 200 })) as unknown as typeof fetch,
      env: {
        ANALYSIS_LLM_BASE_URL: "https://llm.example/v1",
        ANALYSIS_LLM_API_KEY: "secret",
        ANALYSIS_LLM_MODEL: "test-model",
      },
    });

    expect(result.llm.status).toBe("available");
    expect(result.llm.warnings.join(" ")).toContain("纯文本");
    expect(result.answer).toContain("直接文本回答");
  });

  it("accepts JSON wrapped in a markdown code fence", async () => {
    const result = await generateLlmAnalysis(context, engine, {
      fetch: vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `\`\`\`json
{"answer":"代码块里的 JSON 也应解析。","keyPoints":[],"caveats":["只看当前"],"suggestedQuestions":[],"warnings":[]}
\`\`\``,
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch,
      env: {
        ANALYSIS_LLM_BASE_URL: "https://api.deepseek.com",
        ANALYSIS_LLM_API_KEY: "secret",
        ANALYSIS_LLM_MODEL: "deepseek-v4-pro",
      },
    });

    expect(result.llm.status).toBe("available");
    expect(result.llm.warnings).toEqual([]);
    expect(result.answer).toContain("代码块里的 JSON 也应解析");
  });

  it("repairs nullable structured fields from compatible gateways", async () => {
    const result = await generateLlmAnalysis(context, engine, {
      fetch: vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: "主体解释可用。",
                    keyPoints: null,
                    caveats: null,
                    suggestedQuestions: null,
                    warnings: [],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch,
      env: {
        ANALYSIS_LLM_BASE_URL: "https://api.deepseek.com",
        ANALYSIS_LLM_API_KEY: "secret",
        ANALYSIS_LLM_MODEL: "deepseek-v4-pro",
      },
    });

    expect(result.llm.status).toBe("available");
    expect(result.llm.warnings).toEqual([]);
    expect(result.answer).toContain("主体解释可用");
    expect(result.answer).toContain("主体解释可用");
  });

  it("includes gateway response details when the gateway fails", async () => {
    const result = await generateLlmAnalysis(context, engine, {
      fetch: vi.fn(async () => new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 400 })) as unknown as typeof fetch,
      env: {
        ANALYSIS_LLM_API_KEY: "secret",
        ANALYSIS_LLM_MODEL: "bad-model",
      },
    });

    expect(result.llm.status).toBe("unavailable");
    expect(result.llm.warnings.join(" ")).toContain("400");
    expect(result.llm.warnings.join(" ")).toContain("model not found");
  });

  it("returns unavailable when the gateway fails", async () => {
    const result = await generateLlmAnalysis(context, engine, {
      fetch: vi.fn(async () => new Response("bad", { status: 502 })) as unknown as typeof fetch,
      env: {
        ANALYSIS_LLM_API_KEY: "secret",
        ANALYSIS_LLM_MODEL: "test-model",
      },
    });

    expect(result.llm.status).toBe("unavailable");
    expect(result.llm.warnings.join(" ")).toContain("502");
  });
});
