import { NextRequest, NextResponse } from "next/server";

import { buildAnalysisContext } from "../../../lib/majsoul/analysis-chat";
import { analyzeCurrentHandWithEngine } from "../../../lib/majsoul/analysis-engine";
import { toEngineOverlay } from "../../../lib/majsoul/decision-points";
import type { AnalysisChatRequest } from "../../../lib/majsoul/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AnalysisChatRequest>;

    if (!isSnapshotLike(body.snapshot)) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Snapshot is required." } }, { status: 400 });
    }

    const snapshotKey = `${body.snapshot.source.id}:${body.snapshot.round.id}:${body.snapshot.cursor}/${body.snapshot.maxCursor}:seat${body.snapshot.targetSeat}`;
    const context = buildAnalysisContext({
      question: "Give a Mortal recommendation for the current decision point.",
      snapshot: body.snapshot,
      visibleEvents: Array.isArray(body.visibleEvents) ? body.visibleEvents : undefined,
    });
    const engine = await analyzeCurrentHandWithEngine(context);

    return NextResponse.json({
      overlay: toEngineOverlay(snapshotKey, engine),
      engine,
    });
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid engine overlay request." } }, { status: 400 });
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
