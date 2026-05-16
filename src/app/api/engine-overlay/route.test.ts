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
  events: [{ type: "draw", seat: 0, tile: "4m" }],
};

describe("POST /api/engine-overlay", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns an overlay from the Mortal engine response", async () => {
    vi.stubEnv("MORTAL_ENGINE_URL", "http://engine.local/analyze");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ recommendations: [{ action: "discard", tile: "1m", rank: 1, probability: 0.42, tags: [] }] }), { status: 200 })),
    );

    const snapshot = buildVisibleAnalysisSnapshot({
      source: { id: "sample", region: "cn" },
      players,
      round,
      targetSeat: 0,
      cursor: 1,
    });
    const response = await POST(makeRequest({ snapshot, visibleEvents: round.events }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.overlay).toMatchObject({
      snapshotKey: "sample:east-1:1/1:seat0",
      status: "available",
      topRecommendation: { action: "discard", tile: "1m" },
    });
    expect(JSON.stringify(payload)).not.toContain("accountId");
  });

  it("rejects missing snapshots", async () => {
    const response = await POST(makeRequest({}));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("BAD_REQUEST");
  });
});

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/engine-overlay", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });
}
