import { NextRequest, NextResponse } from "next/server";

import { answerAnalysisChat } from "../../../lib/majsoul/analysis-chat";
import { scoreWinningHand } from "../../../lib/majsoul/mahjong-score";
import type { AnalysisChatRequest } from "../../../lib/majsoul/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AnalysisChatRequest>;
    const question = typeof body.question === "string" ? body.question.trim() : "";

    if (!question) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Question is required." } }, { status: 400 });
    }

    if (!isSnapshotLike(body.snapshot)) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Snapshot is required." } }, { status: 400 });
    }

    const response = await answerAnalysisChat({
      question,
      snapshot: body.snapshot,
      mode: body.mode ?? "current-hand",
      llmModel: body.llmModel === "flash" || body.llmModel === "pro" ? body.llmModel : undefined,
      visibleEvents: Array.isArray(body.visibleEvents) ? body.visibleEvents : undefined,
    }, { scoreWinningHand });

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid analysis chat request." } }, { status: 400 });
  }
}

function isSnapshotLike(snapshot: unknown): snapshot is AnalysisChatRequest["snapshot"] {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  const candidate = snapshot as AnalysisChatRequest["snapshot"];

  return (
    typeof candidate.cursor === "number" &&
    typeof candidate.maxCursor === "number" &&
    candidate.targetSeat >= 0 &&
    candidate.targetSeat <= 3 &&
    Boolean(candidate.source?.id) &&
    Boolean(candidate.source?.region) &&
    Boolean(candidate.round?.id) &&
    Array.isArray(candidate.players) &&
    Array.isArray(candidate.targetHand) &&
    Boolean(candidate.discards) &&
    Boolean(candidate.calls) &&
    Boolean(candidate.riichiTiles)
  );
}
