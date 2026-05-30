import type {
  AnalyzeDebug,
  AnalyzeDebugStageName,
  AnalyzeError,
  MjsoulUpstreamError,
  PaipuSource,
  RawMjsoulGame,
  RawMjsoulRecord,
} from "./types";

export type DebugCollector = {
  value: AnalyzeDebug;
  stage<T>(name: AnalyzeDebugStageName, fn: () => Promise<T>): Promise<T>;
  stageSync<T>(name: AnalyzeDebugStageName, fn: () => T): T;
  setSource(source: PaipuSource): void;
  setRecordSource(source: AnalyzeDebug["recordSource"]): void;
  setProxyConfigured(configured: boolean): void;
  addNetworkAttempt(attempt: NonNullable<AnalyzeDebug["network"]>["attempts"][number]): void;
  setRawGame(game: RawMjsoulGame): void;
  setNormalize(summary: NonNullable<AnalyzeDebug["normalize"]>): void;
  setError(error: AnalyzeError): void;
  finish(): AnalyzeDebug;
};

export function createDebugCollector(): DebugCollector {
  const started = Date.now();
  const value: AnalyzeDebug = {
    enabled: true,
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    stages: [],
  };

  return {
    value,
    async stage(name, fn) {
      const stageStarted = Date.now();

      try {
        const result = await fn();
        value.stages.push({ name, status: "ok", durationMs: Date.now() - stageStarted });
        return result;
      } catch (error) {
        value.stages.push({
          name,
          status: "error",
          durationMs: Date.now() - stageStarted,
          message: describeError(error),
          upstreamError: readUpstreamError(error),
        });
        throw error;
      }
    },
    stageSync(name, fn) {
      const stageStarted = Date.now();

      try {
        const result = fn();
        value.stages.push({ name, status: "ok", durationMs: Date.now() - stageStarted });
        return result;
      } catch (error) {
        value.stages.push({
          name,
          status: "error",
          durationMs: Date.now() - stageStarted,
          message: describeError(error),
          upstreamError: readUpstreamError(error),
        });
        throw error;
      }
    },
    setSource(source) {
      value.source = {
        id: source.id,
        region: source.region,
        provider: source.provider,
        targetSeat: source.targetSeat,
      };
    },
    setRecordSource(source) {
      value.recordSource = source;
    },
    setProxyConfigured(configured) {
      value.network = value.network ?? { proxy: "none", attempts: [] };
      value.network.proxy = configured ? "configured" : "none";
    },
    addNetworkAttempt(attempt) {
      value.network = value.network ?? { proxy: "none", attempts: [] };
      value.network.attempts.push(attempt);
    },
    setRawGame(game) {
      value.recordsTotal = game.records.length;
      value.recordCounts = countRecords(game.records);
      value.headShape = summarizeHeadShape(game.head);
      value.players = summarizePlayers(game.head);
    },
    setNormalize(summary) {
      value.normalize = summary;
    },
    setError(error) {
      value.error = {
        code: error.code,
        message: error.message,
        upstream: error.upstream,
      };
    },
    finish() {
      value.durationMs = Date.now() - started;
      return value;
    },
  };
}

function countRecords(records: RawMjsoulRecord[]) {
  return records.reduce<Record<string, number>>((counts, record) => {
    counts[record.name] = (counts[record.name] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeHeadShape(head: Record<string, unknown> | undefined): AnalyzeDebug["headShape"] {
  const config = isRecord(head?.config) ? head.config : {};
  const mode = isRecord(config.mode) ? config.mode : {};
  const detailRule = isRecord(mode.detail_rule) ? mode.detail_rule : {};

  return {
    keys: Object.keys(head ?? {}).sort(),
    configKeys: Object.keys(config).sort(),
    modeKeys: Object.keys(mode).sort(),
    detailRuleKeys: Object.keys(detailRule).sort(),
    accountCount: Array.isArray(head?.accounts) ? head.accounts.length : 0,
  };
}

function summarizePlayers(head: Record<string, unknown> | undefined) {
  const accounts = Array.isArray(head?.accounts) ? head.accounts.filter(isRecord) : [];

  return accounts.map((account) => ({
    seat: Number(account.seat ?? -1),
    nickname: String(account.nickname ?? ""),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  const upstream = readUpstreamError(error);

  if (upstream?.message) {
    return upstream.message;
  }

  if (upstream?.code !== undefined) {
    return `雀魂错误码 ${upstream.code}`;
  }

  return "Unknown error";
}

function readUpstreamError(error: unknown): MjsoulUpstreamError | undefined {
  const source = isRecord(error) && isRecord(error.error) ? error.error : isRecord(error) ? error : undefined;

  if (!source) {
    return undefined;
  }

  const code = Number(source.code);
  const message = typeof source.message === "string" ? source.message : undefined;
  const u32Params = Array.isArray(source.u32_params) ? source.u32_params.map(Number).filter(Number.isFinite) : undefined;
  const strParams = Array.isArray(source.str_params) ? source.str_params.map(String) : undefined;
  const hasJsonParam = typeof source.json_param === "string" && source.json_param.length > 0;

  if (!Number.isFinite(code) && !message && !u32Params?.length && !strParams?.length && !hasJsonParam) {
    return undefined;
  }

  return {
    code: Number.isFinite(code) ? code : undefined,
    message,
    u32Params,
    strParams,
    hasJsonParam,
  };
}
