import { describe, expect, it, vi } from "vitest";

import { analyzeCurrentHandWithEngine } from "./analysis-engine";
import type { AnalysisContext } from "./types";

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

describe("analyzeCurrentHandWithEngine", () => {
  it("returns unavailable when the engine is not configured", async () => {
    const result = await analyzeCurrentHandWithEngine(context, { env: {} });

    expect(result.status).toBe("unavailable");
    expect(result.warnings.join(" ")).toContain("MORTAL_ENGINE_URL");
  });

  it("posts sanitized context to the configured HTTP sidecar", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));

      expect(body.mode).toBe("current-hand");
      expect(JSON.stringify(body)).not.toContain("accountId");

      return new Response(
        JSON.stringify({
          recommendations: [{ action: "discard", tile: "1m", rank: 1, score: 0.72, probability: 0.44, tags: ["fast"] }],
          warnings: ["mock sidecar"],
        }),
        { status: 200 },
      );
    });

    const result = await analyzeCurrentHandWithEngine(context, {
      fetch: fetchMock as typeof fetch,
      env: { MORTAL_ENGINE_URL: "http://127.0.0.1:4010/analyze", MORTAL_ENGINE_TIMEOUT_MS: "5000" },
    });

    expect(result.status).toBe("available");
    expect(result.recommendations).toEqual([
      { action: "discard", tile: "1m", rank: 1, score: 0.72, probability: 0.44, tags: ["fast"] },
    ]);
    expect(result.warnings).toEqual(["mock sidecar"]);
  });

  it("does not throw when the sidecar returns an error", async () => {
    const result = await analyzeCurrentHandWithEngine(context, {
      fetch: vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
      env: { MORTAL_ENGINE_URL: "http://127.0.0.1:4010/analyze" },
    });

    expect(result.status).toBe("unavailable");
    expect(result.warnings.join(" ")).toContain("500");
  });
});
