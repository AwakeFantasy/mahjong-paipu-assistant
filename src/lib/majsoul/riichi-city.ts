import { AnalyzeError, type PaipuSource, type RawMjsoulGame } from "./types";
import type { DebugCollector } from "./debug";
import { parseTenhouJsonGame } from "./tenhou-json";

const DEFAULT_CITYLOGS_API_URL = "https://rc.honk.li/api/log";

export async function fetchRiichiCityGame(source: PaipuSource, debug?: DebugCollector): Promise<RawMjsoulGame> {
  const payload = await debugStage(debug, "fetch-record", () => fetchCityLogsPayload(source.id));
  return debugStage(debug, "parse-record", () => Promise.resolve(parseTenhouJsonGame(source, payload)));
}

async function fetchCityLogsPayload(logId: string) {
  const apiUrl = process.env.RIICHI_CITY_LOG_API_URL?.trim() || DEFAULT_CITYLOGS_API_URL;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ log_id: logId }),
    cache: "no-store",
  });
  const text = await response.text();

  if (!response.ok) {
    throw new AnalyzeError("FETCH_FAILED", `麻雀一番街牌谱读取失败：HTTP ${response.status}`, 502);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AnalyzeError("PARSE_FAILED", "CityLogs 返回了无法解析的 JSON。", 502);
  }
}

async function debugStage<T>(debug: DebugCollector | undefined, name: "fetch-record" | "parse-record", fn: () => Promise<T>) {
  return debug ? debug.stage(name, fn) : fn();
}
