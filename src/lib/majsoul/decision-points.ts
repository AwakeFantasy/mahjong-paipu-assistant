import type {
  AnalysisEngineRecommendation,
  AnalysisEngineAction,
  DecisionDifference,
  DecisionPoint,
  EngineOverlay,
  Round,
  RoundEvent,
} from "./types";
import { buildPlaybackState, type PlaybackSeat } from "./playback";

type DecisionPointInput = {
  sourceId: string;
  round: Round;
  targetSeat: 0 | 1 | 2 | 3;
};

export function buildDecisionPoints({ sourceId, round, targetSeat }: DecisionPointInput): DecisionPoint[] {
  return round.events.flatMap<DecisionPoint>((event, index) => {
    if (event.type === "new-round" && event.seat === targetSeat && hasInitialDealerDraw(round, targetSeat)) {
      const actual = findActualDecision(round.events, targetSeat, index + 1);

      if (!actual) {
        return [];
      }

      const cursor = index + 1;

      return [
        {
          roundId: round.id,
          cursor,
          seat: targetSeat,
          kind: "draw",
          drawnTile: round.initialHands[targetSeat]?.at(-1),
          actualAction: actual.action,
          actualTile: actual.tile,
          actualEventCursor: actual.eventIndex + 1,
          snapshotKey: makeDecisionSnapshotKey({
            sourceId,
            roundId: round.id,
            cursor,
            maxCursor: round.events.length,
            seat: targetSeat,
          }),
        },
      ];
    }

    if (event.type === "draw" && event.seat === targetSeat) {
      const actual = findActualDecision(round.events, targetSeat, index + 1);

      if (!actual) {
        return [];
      }

      const cursor = index + 1;

      return [
        {
          roundId: round.id,
          cursor,
          seat: targetSeat,
          kind: "draw",
          drawnTile: event.tile,
          actualAction: actual.action,
          actualTile: actual.tile,
          actualEventCursor: actual.eventIndex + 1,
          snapshotKey: makeDecisionSnapshotKey({
            sourceId,
            roundId: round.id,
            cursor,
            maxCursor: round.events.length,
            seat: targetSeat,
          }),
        },
      ];
    }

    if (event.type !== "discard" || event.seat === targetSeat) {
      return [];
    }

    const reaction = findReactionDecision(round, targetSeat, index);

    if (!reaction) {
      return [];
    }

    const cursor = index + 1;

    return [
      {
        roundId: round.id,
        cursor,
        seat: targetSeat,
        kind: "reaction",
        reactionTile: event.tile,
        triggerSeat: toSeat(event.seat),
        actualAction: reaction.action,
        actualTile: reaction.tile,
        actualEventCursor: reaction.eventIndex + 1,
        snapshotKey: makeDecisionSnapshotKey({
          sourceId,
          roundId: round.id,
          cursor,
          maxCursor: round.events.length,
          seat: targetSeat,
        }),
      },
    ];
  });
}

export function compareDecisionDifference(point: DecisionPoint, overlay?: EngineOverlay): DecisionDifference {
  if (!overlay || overlay.status === "idle" || overlay.status === "loading") {
    return { point, status: "pending", reason: "等待 Mortal 推荐。" };
  }

  if (overlay.status === "unavailable") {
    return { point, status: "engine-unavailable", reason: overlay.warnings.join("；") || "Mortal 暂不可用。" };
  }

  const topRecommendation = overlay.topRecommendation ?? overlay.recommendations[0];

  if (!topRecommendation) {
    return { point, status: "not-comparable", reason: "Mortal 没有返回可比较的候选动作。" };
  }

  if (!isComparable(point, topRecommendation)) {
    return { point, status: "not-comparable", topRecommendation, reason: "当前真实动作和引擎动作类型暂不可比较。" };
  }

  const sameTile = isSameDecision(point, topRecommendation);

  return {
    point,
    status: sameTile ? "same" : "different",
    topRecommendation,
    reason: sameTile ? "实际切牌与 Mortal 第一候选一致。" : "实际切牌与 Mortal 第一候选不同。",
  };
}

export function makeIdleEngineOverlay(snapshotKey: string): EngineOverlay {
  return {
    snapshotKey,
    status: "idle",
    recommendations: [],
    warnings: [],
  };
}

export function toEngineOverlay(snapshotKey: string, result: { status: "available" | "unavailable"; recommendations: AnalysisEngineRecommendation[]; warnings: string[] }): EngineOverlay {
  const recommendations = [...result.recommendations].sort((left, right) => left.rank - right.rank);

  return {
    snapshotKey,
    status: result.status,
    recommendations,
    topRecommendation: recommendations[0],
    warnings: [...result.warnings],
    updatedAt: Date.now(),
  };
}

function findActualDecision(events: RoundEvent[], targetSeat: number, startIndex: number): { action: AnalysisEngineAction; tile?: string; eventIndex: number } | null {
  for (let index = startIndex; index < events.length; index += 1) {
    const event = events[index];

    if (event.type === "draw") {
      return null;
    }

    if ("seat" in event && event.seat !== targetSeat) {
      continue;
    }

    if (event.type === "discard" && event.riichi) {
      return { action: "riichi" as const, tile: event.tile, eventIndex: index };
    }

    if (event.type === "discard") {
      return { action: "discard" as const, tile: event.tile, eventIndex: index };
    }

    if (event.type === "kan") {
      return { action: "kan" as const, tile: event.tiles[0], eventIndex: index };
    }

    if (event.type === "agari") {
      return { action: "win" as const, tile: event.tile, eventIndex: index };
    }
  }

  return null;
}

function findReactionDecision(round: Round, targetSeat: 0 | 1 | 2 | 3, discardIndex: number): { action: AnalysisEngineAction; tile?: string; eventIndex: number } | null {
  const discard = round.events[discardIndex];

  if (discard?.type !== "discard") {
    return null;
  }

  const next = round.events[discardIndex + 1];
  if ((next?.type === "call" || next?.type === "kan") && next.seat === targetSeat) {
    return { action: normalizedCallTypeToAction(next.callType), tile: discard.tile, eventIndex: discardIndex + 1 };
  }

  if (next?.type === "agari" && next.seat === targetSeat && !next.zimo) {
    return { action: "win", tile: discard.tile, eventIndex: discardIndex + 1 };
  }

  if (!canReactToDiscard(round, targetSeat, discardIndex, discard.tile, toSeat(discard.seat))) {
    return null;
  }

  return { action: "pass", tile: discard.tile, eventIndex: discardIndex };
}

function canReactToDiscard(round: Round, targetSeat: 0 | 1 | 2 | 3, discardIndex: number, tile: string, fromSeat: 0 | 1 | 2 | 3) {
  const playback = buildPlaybackState(round, targetSeat, discardIndex + 1);

  if (playback.riichiTiles[targetSeat].length) {
    return false;
  }

  const hand = playback.hands[targetSeat].map(normalizeTile);
  const normalized = normalizeTile(tile);
  const sameCount = hand.filter((item) => item === normalized).length;

  if (sameCount >= 2) {
    return true;
  }

  if (((targetSeat + 3) % 4) !== fromSeat || normalized.endsWith("z")) {
    return false;
  }

  const match = /^([1-9])([mps])$/.exec(normalized);
  if (!match) {
    return false;
  }

  const rank = Number(match[1]);
  const suit = match[2];
  const handSet = new Set(hand);
  const sequences = [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ];

  return sequences.some((sequence) => sequence.every((item) => item >= 1 && item <= 9 && handSet.has(`${item}${suit}`)));
}

function normalizedCallTypeToAction(callType: string): AnalysisEngineAction {
  if (/\u5403|chi/i.test(callType)) {
    return "chi";
  }
  if (/\u78b0|pon|peng/i.test(callType)) {
    return "pon";
  }
  if (/\u6760|kan|gang/i.test(callType)) {
    return "kan";
  }
  return "pon";
}

function hasInitialDealerDraw(round: Round, targetSeat: 0 | 1 | 2 | 3) {
  return round.roundNumber === targetSeat && (round.initialHands[targetSeat]?.length ?? 0) % 3 === 2;
}

function makeDecisionSnapshotKey({
  sourceId,
  roundId,
  cursor,
  maxCursor,
  seat,
}: {
  sourceId: string;
  roundId: string;
  cursor: number;
  maxCursor: number;
  seat: number;
}) {
  return `${sourceId}:${roundId}:${cursor}/${maxCursor}:seat${seat}`;
}

function isComparable(point: DecisionPoint, recommendation: AnalysisEngineRecommendation) {
  if (!["discard", "riichi", "chi", "pon", "kan", "pass", "win"].includes(recommendation.action)) {
    return false;
  }

  if (point.actualAction === "discard" && recommendation.action === "discard") {
    return Boolean(point.actualTile && recommendation.tile);
  }

  if (recommendation.action === "discard") {
    return Boolean(recommendation.tile);
  }

  return true;
}

function isSameDecision(point: DecisionPoint, recommendation: AnalysisEngineRecommendation) {
  if (point.actualAction !== recommendation.action) {
    return false;
  }

  if (point.actualAction === "discard") {
    return normalizeTile(point.actualTile) === normalizeTile(recommendation.tile);
  }

  return true;
}

function normalizeTile(tile: string | undefined) {
  if (!tile) {
    return "";
  }

  return tile.startsWith("0") ? `5${tile.slice(1)}` : tile;
}

function toSeat(seat: number): PlaybackSeat {
  return seat === 0 || seat === 1 || seat === 2 || seat === 3 ? seat : 0;
}
