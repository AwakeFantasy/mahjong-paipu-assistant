import { fetchMjsoulGame } from "./client";
import { createDebugCollector, type DebugCollector } from "./debug";
import { normalizeMjsoulGame } from "./normalize";
import { parsePaipuSource } from "./url";
import { AnalyzeError, type AnalyzeSuccess, type RawMjsoulGame } from "./types";

export type AnalyzeRequest = {
  url?: string;
  targetSeat?: number;
  roundId?: string;
  debug?: boolean;
};

export type AnalyzeDependencies = {
  fetchGame?: (source: ReturnType<typeof parsePaipuSource>, debug?: DebugCollector) => Promise<RawMjsoulGame>;
};

export async function analyzePaipu(
  request: AnalyzeRequest,
  dependencies: AnalyzeDependencies = {},
): Promise<AnalyzeSuccess> {
  const debug = request.debug ? createDebugCollector() : undefined;

  try {
    const source = debug
      ? debug.stageSync("source", () => parsePaipuSource(request.url ?? "", request.targetSeat))
      : parsePaipuSource(request.url ?? "", request.targetSeat);
    debug?.setSource(source);

    const fetchGame = dependencies.fetchGame ?? fetchMjsoulGame;
    const rawGame = await fetchGame(source, debug);
    debug?.setRawGame(rawGame);
    const result = debug
      ? debug.stageSync("normalize", () => normalizeMjsoulGame(source, rawGame, request.roundId, debug))
      : normalizeMjsoulGame(source, rawGame, request.roundId);

    if (debug) {
      result.debug = debug.finish();
    }

    return result;
  } catch (error) {
    if (debug && error instanceof AnalyzeError) {
      debug.setError(error);
      error.debug = debug.finish();
    }

    throw error;
  }
}
