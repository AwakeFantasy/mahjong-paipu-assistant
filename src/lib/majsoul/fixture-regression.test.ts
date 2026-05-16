import { describe, expect, it } from "vitest";

import regressionFixture from "../../../fixtures/paipu/cn-tonpu-regression-001.json";
import { analyzePaipu } from "./analyze";
import { answerAnalysisChat, buildVisibleAnalysisSnapshot } from "./analysis-chat";
import { buildDecisionPoints } from "./decision-points";
import { normalizeMjsoulGame } from "./normalize";
import { buildPlaybackState } from "./playback";
import { analyzeTileEfficiency } from "./tile-efficiency";
import type { MjsoulRegion, PaipuSource, RawMjsoulGame, RoundEvent } from "./types";

type FixtureFile = {
  id: string;
  region: MjsoulRegion;
  tags: string[];
  source: PaipuSource;
  expected: {
    minRoundCount: number;
    minEventCount: number;
    targetSeat: 0 | 1 | 2 | 3;
    expectedEventTypes: RoundEvent["type"][];
    expectedDecisionPoints: number;
    expectedCalls: number;
    expectedHasRyukyoku: boolean;
    expectedHasAgari: boolean;
    tileEfficiency: {
      hand: string[];
      visibleTiles: string[];
      waitTile: string;
      theoretical: number;
      visible: number;
      remaining: number;
    };
  };
  game: RawMjsoulGame;
};

const fixture = regressionFixture as FixtureFile;
const source = fixture.source;

describe("paipu fixture regression", () => {
  it("imports the fixture through the analyze pipeline without network", async () => {
    const result = await analyzePaipu(
      {
        url: "https://game.maj-soul.com/1/?paipu=240101-11111111-2222-4333-8444-555555555555",
        targetSeat: fixture.expected.targetSeat,
      },
      { fetchGame: async () => fixture.game },
    );

    expect(result.rounds.length).toBeGreaterThanOrEqual(fixture.expected.minRoundCount);
    expect(result.rounds.reduce((sum, round) => sum + round.events.length, 0)).toBeGreaterThanOrEqual(fixture.expected.minEventCount);
    expect(result.players).toHaveLength(4);
    expect(result.targetSeat).toBe(fixture.expected.targetSeat);
    expect(result.selectedRound?.events.length).toBeGreaterThan(0);
  });

  it("normalizes expected event coverage for playback and review surfaces", () => {
    const result = normalizeMjsoulGame(source, fixture.game);
    const eventTypes = new Set(result.rounds.flatMap((round) => round.events.map((event) => event.type)));

    for (const eventType of fixture.expected.expectedEventTypes) {
      expect(eventTypes.has(eventType)).toBe(true);
    }

    expect(result.rounds.some((round) => round.events.some((event) => event.type === "agari"))).toBe(fixture.expected.expectedHasAgari);
    expect(result.rounds.some((round) => round.events.some((event) => event.type === "ryukyoku"))).toBe(fixture.expected.expectedHasRyukyoku);
  });

  it("replays calls, dora changes, terminal results, and scores at stable cursors", () => {
    const result = normalizeMjsoulGame(source, fixture.game);
    const [ronRound, ryukyokuRound] = result.rounds;

    const afterPon = buildPlaybackState(ronRound, fixture.expected.targetSeat, 5);
    expect(afterPon.calls[2]).toHaveLength(fixture.expected.expectedCalls);
    expect(afterPon.discards[1]).not.toContain("7z");
    expect(afterPon.riichiTiles[1]).toEqual([]);

    const afterKan = buildPlaybackState(ronRound, fixture.expected.targetSeat, 7);
    expect(afterKan.doraIndicators).toEqual(["4p", "7s"]);

    const afterRon = buildPlaybackState(ronRound, fixture.expected.targetSeat, ronRound.events.length);
    expect(afterRon.roundResult).toContain("Fixture Ron");
    expect(afterRon.scores[0]).toBe(33000);

    const afterDraw = buildPlaybackState(ryukyokuRound, fixture.expected.targetSeat, ryukyokuRound.events.length);
    expect(afterDraw.roundResult).toBeTruthy();
    expect(afterDraw.scores[0]).toBe(34000);
  });

  it("extracts decision points from fixture rounds", () => {
    const result = normalizeMjsoulGame(source, fixture.game);
    const points = result.rounds.flatMap((round) => buildDecisionPoints({ sourceId: source.id, round, targetSeat: fixture.expected.targetSeat }));

    expect(points).toHaveLength(fixture.expected.expectedDecisionPoints);
    expect(points[0]).toMatchObject({
      kind: "draw",
      actualAction: "discard",
      actualTile: "5z",
    });
  });

  it("keeps tile efficiency visibly tied to known visible tiles", () => {
    const expected = fixture.expected.tileEfficiency;
    const analysis = analyzeTileEfficiency(expected.hand, expected.visibleTiles);
    const wait = analysis.waits.find((item) => item.tile === expected.waitTile);

    expect(analysis.status).toBe("ready");
    expect(wait).toMatchObject({
      theoretical: expected.theoretical,
      visible: expected.visible,
      remaining: expected.remaining,
    });
  });

  it("keeps Mortal and LLM unavailable paths non-blocking for fixture snapshots", async () => {
    const result = normalizeMjsoulGame(source, fixture.game);
    const round = result.rounds[0];
    const cursor = buildDecisionPoints({ sourceId: source.id, round, targetSeat: fixture.expected.targetSeat })[0].cursor;
    const playback = buildPlaybackState(round, fixture.expected.targetSeat, cursor);
    const snapshot = buildVisibleAnalysisSnapshot({
      source,
      players: result.players,
      round,
      targetSeat: fixture.expected.targetSeat,
      cursor,
      playback,
    });

    const response = await answerAnalysisChat(
      {
        question: "这一步怎么打？",
        snapshot,
        mode: "current-hand",
        visibleEvents: round.events,
      },
      {
        engine: { env: { NODE_ENV: "test", ANALYSIS_ENABLE_ENGINE: "false" } },
        llm: { env: { NODE_ENV: "test", ANALYSIS_LLM_API_KEY: "", ANALYSIS_LLM_MODEL: "" } },
      },
    );

    expect(response.snapshotKey).toContain(`${source.id}:${round.id}:${cursor}/`);
    expect(response.engine.status).toBe("unavailable");
    expect(response.llm.status).toBe("unavailable");
    expect(response.answer.length).toBeGreaterThan(0);
  });
});
