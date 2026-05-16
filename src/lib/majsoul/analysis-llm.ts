import type { AnalysisContext, AnalysisEngineResult, AnalysisLlmModelChoice, AnalysisLlmResult } from "./types";

const DEFAULT_LLM_TIMEOUT_MS = 60000;
const DEFAULT_PRO_LLM_TIMEOUT_MS = 120000;
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_DEEPSEEK_FLASH_MODEL = "deepseek-v4-flash";
const DEFAULT_DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";

export type AnalysisLlmConfig = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
  responseFormat: "json_schema" | "json_object" | "none";
};

export type AnalysisLlmDependencies = {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  modelChoice?: AnalysisLlmModelChoice;
};

export type AnalysisLlmAnswer = {
  answer?: string;
  llm: AnalysisLlmResult;
};

type StructuredLlmPayload = {
  answer: string;
  keyPoints?: string[];
  caveats?: string[];
  suggestedQuestions?: string[];
  warnings?: string[];
};

export async function generateLlmAnalysis(
  context: AnalysisContext,
  engine: AnalysisEngineResult,
  dependencies: AnalysisLlmDependencies = {},
): Promise<AnalysisLlmAnswer> {
  const config = getAnalysisLlmConfig(dependencies.env, dependencies.modelChoice);

  if (!config.apiKey || !config.model) {
    return {
      llm: {
        provider: "heuristic",
        model: null,
        status: "unavailable",
        warnings: ["LLM 未配置：缺少 ANALYSIS_LLM_API_KEY 或 ANALYSIS_LLM_MODEL。"],
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const fetchImpl = dependencies.fetch ?? fetch;
    const response = await fetchImpl(`${normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL)}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(buildChatCompletionBody(config, context, engine)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await readErrorDetails(response);
      return unavailable(config.model, `LLM 网关返回 ${response.status}${details ? `：${details}` : ""}。`);
    }

    const payload = (await response.json()) as unknown;
    const content = extractContent(payload);
    const tokensUsed = extractTokenUsage(payload);

    if (!content) {
      return unavailable(config.model, "LLM 网关响应为空。");
    }

    const structured = parseStructuredContent(content);

    if (structured) {
      return {
        answer: formatStructuredAnswer(structured),
        llm: {
          provider: "openai-compatible",
          model: config.model,
          status: "available",
          tokensUsed,
          warnings: structured.warnings ?? [],
        },
      };
    }

    return {
      answer: formatPlainTextAnswer(content),
      llm: {
        provider: "openai-compatible",
        model: config.model,
        status: "available",
        tokensUsed,
        warnings: ["LLM 未返回预期 JSON，已按纯文本回答展示。"],
      },
    };
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError" ? "LLM 请求超时。" : `LLM 请求失败${formatErrorDetails(error)}。`;
    return unavailable(config.model, message);
  } finally {
    clearTimeout(timer);
  }
}

export function getAnalysisLlmConfig(env: NodeJS.ProcessEnv = process.env, modelChoice?: AnalysisLlmModelChoice): AnalysisLlmConfig {
  return {
    baseUrl: normalizeOptional(env.ANALYSIS_LLM_BASE_URL) ?? DEFAULT_BASE_URL,
    apiKey: normalizeOptional(env.ANALYSIS_LLM_API_KEY),
    model: resolveModel(env, modelChoice),
    timeoutMs: resolveTimeoutMs(env, modelChoice),
    responseFormat: getResponseFormat(env),
  };
}

function buildChatCompletionBody(config: AnalysisLlmConfig, context: AnalysisContext, engine: AnalysisEngineResult) {
  const body = {
    model: config.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "你是面向普通雀魂/日麻玩家的牌谱复盘助手。优先直接回答用户的问题，不要像开发日志一样罗列场况、引擎字段或接口限制。只能基于当前可见局面、当前光标之前事件和专业引擎建议回答，不要推断未来摸牌或未来事件。Mortal/专业引擎建议可以作为判断依据，但除非用户问到或确有帮助，不要把引擎分数和推荐列表重复写进回答。必须用中文，表达自然、具体、谨慎。请输出 JSON，字段为 answer、keyPoints、caveats、suggestedQuestions、warnings；answer 必须是字符串，其余字段必须是字符串数组。",
      },
      {
        role: "user",
        content: JSON.stringify({
          question: context.question,
          visibleSummary: context.visibleSummary,
          snapshot: context.snapshot,
          visibleEvents: context.visibleEvents,
          engine,
        }),
      },
    ],
  };

  return {
    ...body,
    ...(config.responseFormat === "json_object"
      ? { response_format: { type: "json_object" } }
      : config.responseFormat === "json_schema"
        ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "mahjong_current_hand_analysis",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["answer", "keyPoints", "caveats", "suggestedQuestions", "warnings"],
                  properties: {
                    answer: { type: "string" },
                    keyPoints: {
                      type: "array",
                      items: { type: "string" },
                    },
                    caveats: {
                      type: "array",
                      items: { type: "string" },
                    },
                    suggestedQuestions: {
                      type: "array",
                      items: { type: "string" },
                    },
                    warnings: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          }
        : {}),
  };
}

function extractContent(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return "";
  }

  const [first] = choices;
  if (!first || typeof first !== "object") {
    return "";
  }

  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }

        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      })
      .join("")
      .trim();
  }

  return "";
}

function extractTokenUsage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const totalTokens = (usage as { total_tokens?: unknown }).total_tokens;
  return typeof totalTokens === "number" && Number.isFinite(totalTokens) ? totalTokens : null;
}

function parseStructuredContent(content: string): StructuredLlmPayload | null {
  try {
    const parsed = JSON.parse(normalizeJsonContent(content)) as Partial<StructuredLlmPayload>;
    const hasUsableText = typeof parsed.answer === "string" && parsed.answer.trim().length > 0;

    if (!hasUsableText) {
      return null;
    }

    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((warning): warning is string => typeof warning === "string") : [];

    return {
      answer: readStructuredText(parsed.answer, "我没有拿到足够清晰的回答，请换一种问法再试一次。"),
      keyPoints: readStringList(parsed.keyPoints).slice(0, 5),
      caveats: readStringList(parsed.caveats).slice(0, 3),
      suggestedQuestions: readStringList(parsed.suggestedQuestions).slice(0, 3),
      warnings,
    };
  } catch {
    return null;
  }
}

function readStructuredText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeJsonContent(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (fenced) {
    return fenced[1].trim();
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");

  if (objectStart >= 0 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  return trimmed;
}

async function readErrorDetails(response: Response) {
  try {
    const text = await response.text();
    return compactDiagnostic(text);
  } catch {
    return "";
  }
}

function formatErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return "";
  }

  const details = compactDiagnostic(error.message);
  return details ? `：${details}` : "";
}

function compactDiagnostic(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function formatStructuredAnswer(payload: StructuredLlmPayload) {
  const sections = [payload.answer.trim()];

  if (payload.keyPoints?.length) {
    sections.push(`要点：${payload.keyPoints.join("；")}`);
  }

  if (payload.caveats?.length) {
    sections.push(`注意：${payload.caveats.join("；")}`);
  }

  if (payload.suggestedQuestions?.length) {
    sections.push(`还可以继续问：${payload.suggestedQuestions.join(" / ")}`);
  }

  return sections.join("\n\n");
}

function formatPlainTextAnswer(content: string) {
  return `${content}\n\n注意：回答只基于当前光标之前的可见信息。`;
}

function unavailable(model: string | undefined, message: string): AnalysisLlmAnswer {
  return {
    llm: {
      provider: "heuristic",
      model: model ?? null,
      status: "unavailable",
      warnings: [message],
    },
  };
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function resolveModel(env: NodeJS.ProcessEnv, modelChoice?: AnalysisLlmModelChoice) {
  if (modelChoice === "flash") {
    return normalizeOptional(env.ANALYSIS_LLM_FLASH_MODEL) ?? DEFAULT_DEEPSEEK_FLASH_MODEL;
  }

  if (modelChoice === "pro") {
    return normalizeOptional(env.ANALYSIS_LLM_PRO_MODEL) ?? DEFAULT_DEEPSEEK_PRO_MODEL;
  }

  return normalizeOptional(env.ANALYSIS_LLM_MODEL);
}

function resolveTimeoutMs(env: NodeJS.ProcessEnv, modelChoice?: AnalysisLlmModelChoice) {
  if (modelChoice === "flash") {
    return parsePositiveInteger(env.ANALYSIS_LLM_FLASH_TIMEOUT_MS, parsePositiveInteger(env.ANALYSIS_LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS));
  }

  if (modelChoice === "pro") {
    return parsePositiveInteger(env.ANALYSIS_LLM_PRO_TIMEOUT_MS, DEFAULT_PRO_LLM_TIMEOUT_MS);
  }

  return parsePositiveInteger(env.ANALYSIS_LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS);
}

function normalizeOptional(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function readStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function getResponseFormat(env: NodeJS.ProcessEnv) {
  const configured = normalizeOptional(env.ANALYSIS_LLM_RESPONSE_FORMAT);

  if (configured === "json_schema" || configured === "json_object") {
    if ((env.ANALYSIS_LLM_BASE_URL ?? "").includes("deepseek")) {
      return "none";
    }

    return configured;
  }

  return (env.ANALYSIS_LLM_BASE_URL ?? "").includes("deepseek") ? "none" : "json_schema";
}
