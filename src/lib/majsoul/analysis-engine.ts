import type { AnalysisContext, AnalysisEngineAction, AnalysisEngineRecommendation, AnalysisEngineResult } from "./types";

const DEFAULT_ENGINE_TIMEOUT_MS = 8000;
const VALID_ACTIONS = new Set<AnalysisEngineAction>(["discard", "riichi", "pass", "chi", "pon", "kan", "win"]);

export type AnalysisEngineConfig = {
  enabled: boolean;
  url?: string;
  timeoutMs: number;
};

export type AnalysisEngineDependencies = {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
};

export async function analyzeCurrentHandWithEngine(
  context: AnalysisContext,
  dependencies: AnalysisEngineDependencies = {},
): Promise<AnalysisEngineResult> {
  const config = getAnalysisEngineConfig(dependencies.env);

  if (!config.enabled) {
    return unavailable("专业麻将引擎已通过 ANALYSIS_ENABLE_ENGINE=false 关闭。");
  }

  if (!config.url) {
    return unavailable("专业麻将引擎未连接：缺少 MORTAL_ENGINE_URL。");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const fetchImpl = dependencies.fetch ?? fetch;
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "current-hand",
        context,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return unavailable(`专业麻将引擎返回 ${response.status}。`);
    }

    const payload = (await response.json()) as unknown;
    const recommendations = parseRecommendations(payload);
    const warnings = parseWarnings(payload);

    return {
      status: "available",
      recommendations,
      warnings,
    };
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError" ? "专业麻将引擎请求超时。" : "专业麻将引擎请求失败。";
    return unavailable(message);
  } finally {
    clearTimeout(timer);
  }
}

export function getAnalysisEngineConfig(env: NodeJS.ProcessEnv = process.env): AnalysisEngineConfig {
  return {
    enabled: env.ANALYSIS_ENABLE_ENGINE !== "false",
    url: normalizeOptional(env.MORTAL_ENGINE_URL),
    timeoutMs: parsePositiveInteger(env.MORTAL_ENGINE_TIMEOUT_MS, DEFAULT_ENGINE_TIMEOUT_MS),
  };
}

function parseRecommendations(payload: unknown): AnalysisEngineRecommendation[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = Array.isArray((payload as { recommendations?: unknown }).recommendations)
    ? (payload as { recommendations: unknown[] }).recommendations
    : Array.isArray((payload as { actions?: unknown }).actions)
      ? (payload as { actions: unknown[] }).actions
      : [];

  return source.map(parseRecommendation).filter((item): item is AnalysisEngineRecommendation => Boolean(item));
}

function parseRecommendation(item: unknown): AnalysisEngineRecommendation | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const candidate = item as Record<string, unknown>;
  const action = typeof candidate.action === "string" && VALID_ACTIONS.has(candidate.action as AnalysisEngineAction) ? (candidate.action as AnalysisEngineAction) : null;

  if (!action) {
    return null;
  }

  return {
    action,
    tile: typeof candidate.tile === "string" ? candidate.tile : undefined,
    rank: parseRank(candidate.rank),
    score: typeof candidate.score === "number" && Number.isFinite(candidate.score) ? candidate.score : undefined,
    probability: typeof candidate.probability === "number" && Number.isFinite(candidate.probability) ? candidate.probability : undefined,
    tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 6) : [],
  };
}

function parseRank(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 999;
}

function parseWarnings(payload: unknown) {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { warnings?: unknown }).warnings)) {
    return [];
  }

  return (payload as { warnings: unknown[] }).warnings.filter((warning): warning is string => typeof warning === "string");
}

function unavailable(message: string): AnalysisEngineResult {
  return {
    status: "unavailable",
    recommendations: [],
    warnings: [message],
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function normalizeOptional(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
