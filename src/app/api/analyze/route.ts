import { NextRequest, NextResponse } from "next/server";

import { analyzePaipu, type AnalyzeRequest } from "../../../lib/majsoul/analyze";
import { AnalyzeError } from "../../../lib/majsoul/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let debugRequested = false;

  try {
    const body = (await request.json()) as AnalyzeRequest;
    debugRequested = body.debug === true && process.env.NODE_ENV !== "production";
    const payload = await analyzePaipu({ ...body, debug: debugRequested });

    return NextResponse.json(payload);
  } catch (error) {
    const normalized =
      error instanceof AnalyzeError
        ? error
        : new AnalyzeError("FETCH_FAILED", "牌谱分析失败，请稍后重试。", 500);

    return NextResponse.json(
      {
        error: {
          code: normalized.code,
          message: normalized.message,
        },
        ...(debugRequested && normalized.debug ? { debug: normalized.debug } : {}),
      },
      { status: normalized.status },
    );
  }
}
