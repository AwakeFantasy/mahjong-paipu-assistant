import type { AnalysisChatStructured, AnalysisContext, AnalysisEngineResult, AnalysisLlmModelChoice, AnalysisLlmResult } from "./types";

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
  responseFormat: "json_schema" | "json_object";
};

export type AnalysisLlmDependencies = {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  modelChoice?: AnalysisLlmModelChoice;
};

export type AnalysisLlmAnswer = {
  answer?: string;
  structured?: AnalysisChatStructured;
  llm: AnalysisLlmResult;
};

type StructuredLlmPayload = {
  engineAdvice: string;
  llmExplanation: string;
  visibleLimitations: string;
  warnings?: string[];
};

type ParsedStructuredContent = {
  answer: string;
  structured: AnalysisChatStructured;
  warnings: string[];
};

export async function generateLlmAnalysis(
  context: AnalysisContext,
  engine: AnalysisEngineResult,
  dependencies: AnalysisLlmDependencies = {},
): Promise<AnalysisLlmAnswer> {
  const config = getAnalysisLlmConfig(dependencies.env, dependencies.modelChoice);

  if (!config.apiKey || !config.model) {
    return unavailable(config.model, "LLM 未配置：缺少 ANALYSIS_LLM_API_KEY 或 ANALYSIS_LLM_MODEL。", "missing-config");
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
      const failureReason = response.status === 408 || response.status === 504 ? "timeout" : "gateway-error";
      return unavailable(config.model, `LLM 网关返回 ${response.status}${details ? `：${details}` : ""}。`, failureReason);
    }

    const payload = (await response.json()) as unknown;
    const content = extractContent(payload);

    if (!content) {
      return unavailable(config.model, "LLM 网关响应为空。", "empty-response");
    }

    const structured = parseStructuredContent(content);

    if (structured) {
      return {
        answer: structured.answer,
        structured: structured.structured,
        llm: {
          provider: "openai-compatible",
          model: config.model,
          status: "available",
          warnings: structured.warnings,
        },
      };
    }

    return {
      answer: formatPlainTextAnswer(content),
      llm: {
        provider: "openai-compatible",
        model: config.model,
        status: "available",
        warnings: ["LLM 未返回预期 JSON，已按纯文本回答展示。"],
      },
    };
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "AbortError";
    const message = timeout ? "LLM 请求超时。" : `LLM 请求失败${formatErrorDetails(error)}。`;
    return unavailable(config.model, message, timeout ? "timeout" : "request-error");
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
          "你是日麻牌谱复盘助手。Mortal/引擎排序是主结论；本地牌效、安全、宝牌、牌型路线、实验性进攻EV 只是解释证据。只能基于当前可见局面、当前光标之前事件、analysisPackage.evidenceCatalog、candidateComparisons.counterfactualSummary、candidateComparisons.decidingFactors 这些已给出的结构化证据回答。候选切牌比较必须优先引用 counterfactualSummary：只看牌效、只看安全、只看宝牌、只看实验性进攻EV 必须说明哪个候选更优或接近、对应本地证据、以及支持/反对/无法解释 Mortal 当前排序；只看牌型路线只在 counterfactualSummary 已给出时展示。不要推断 Mortal 的隐藏内部权重，不要编造“可能次因”，不要推断未来摸牌、未来事件或牌山，不要补充未计算出的牌理原因。实验性进攻EV 必须标为实验性，不能当强结论。如果本地可验证因素仍不足以解释引擎排序，必须原意表达“本地可验证因素已经列在上面；如果这些因素仍不足以解释 Mortal 的排序差异，就只能认为 Mortal 还综合了模型内部权重，当前系统不硬猜。”必须用中文，谨慎表达不确定性。请输出 JSON，字段为 engineAdvice、llmExplanation、visibleLimitations、warnings；前三个字段的值必须是字符串，warnings 必须是字符串数组。",
      },
      {
        role: "user",
        content: JSON.stringify({
          question: context.question,
          visibleSummary: context.visibleSummary,
          snapshot: context.snapshot,
          visibleEvents: context.visibleEvents,
          analysisPackage: context.analysisPackage,
          engine,
        }),
      },
    ],
  };

  return {
    ...body,
    response_format:
      config.responseFormat === "json_object"
        ? { type: "json_object" }
        : {
            type: "json_schema",
            json_schema: {
              name: "mahjong_current_hand_analysis",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["engineAdvice", "llmExplanation", "visibleLimitations", "warnings"],
                properties: {
                  engineAdvice: { type: "string" },
                  llmExplanation: { type: "string" },
                  visibleLimitations: { type: "string" },
                  warnings: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
          },
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

function parseStructuredContent(content: string): ParsedStructuredContent | null {
  try {
    const parsed = JSON.parse(normalizeJsonContent(content)) as Record<string, unknown>;
    const warnings = readStringList(parsed.warnings);
    const engineAdvice = readText(parsed.engineAdvice);
    const llmExplanation = readText(parsed.llmExplanation);
    const visibleLimitations = readText(parsed.visibleLimitations);
    const hasEngineFormat = [engineAdvice, llmExplanation, visibleLimitations].some(Boolean);

    if (hasEngineFormat) {
      const payload: StructuredLlmPayload = {
        engineAdvice: engineAdvice || readText(parsed.answer) || "No engine advice returned.",
        llmExplanation: llmExplanation || "No LLM explanation returned.",
        visibleLimitations: visibleLimitations || "Only current visible information is used.",
        warnings,
      };

      return {
        answer: formatStructuredAnswer(payload),
        structured: toChatStructured(payload),
        warnings,
      };
    }

    const conclusion = readText(parsed.conclusion) || readText(parsed.answer);
    if (!conclusion) {
      return null;
    }

    const structured: AnalysisChatStructured = {
      conclusion: sanitizePublicText(conclusion),
      reasons: sanitizePublicList(readStringList(parsed.reasons)),
      risks: sanitizePublicList(readStringList(parsed.risks)),
      suggestedQuestions: sanitizePublicList(readStringList(parsed.suggestedQuestions)),
      evidence: sanitizePublicList(readStringList(parsed.evidence)),
      evidenceIds: readStringList(parsed.evidenceIds),
      directReplies: sanitizePublicList(readStringList(parsed.directReplies), { maxLength: 34 }),
      correctionsAccepted: sanitizePublicList(readStringList(parsed.correctionsAccepted)),
    };

    return {
      answer: formatChatStructuredAnswer(structured),
      structured,
      warnings,
    };
  } catch {
    return null;
  }
}

function readText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

const INTERNAL_TERM_PATTERN =
  /analysisPackage|candidateComparisons|doraAnalysis|tileEfficiency|knowledgeCases|toolPlan|preferredKeepTile|preferredDiscardTile|engine\.|left=|right=/i;

function sanitizePublicText(value: string) {
  return value
    .replace(/Mortal\s*推荐/g, "更推荐")
    .replace(/Mortal/g, "推荐排序")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizePublicList(items: string[], options: { maxLength?: number } = {}) {
  return items
    .filter((item) => !INTERNAL_TERM_PATTERN.test(item))
    .map(sanitizePublicText)
    .filter((item) => item.length > 0 && (!options.maxLength || item.length <= options.maxLength));
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
  return [`引擎建议\n${payload.engineAdvice}`, `LLM 解释\n${payload.llmExplanation}`, `可见信息限制\n${payload.visibleLimitations}`].join("\n\n");
}

function toChatStructured(payload: StructuredLlmPayload): AnalysisChatStructured {
  return {
    conclusion: payload.engineAdvice,
    reasons: [payload.llmExplanation].filter(Boolean),
    risks: [payload.visibleLimitations].filter(Boolean),
    suggestedQuestions: [],
    evidence: [],
  };
}

function formatChatStructuredAnswer(structured: AnalysisChatStructured) {
  const sections = [structured.conclusion];

  if (structured.reasons.length) {
    sections.push(`理由：${structured.reasons.join("；")}`);
  }

  if (structured.risks.length) {
    sections.push(`风险：${structured.risks.join("；")}`);
  }

  return sections.join("\n\n");
}

function formatPlainTextAnswer(content: string) {
  return ["引擎建议\n专业引擎结果见本次响应的 engine 字段。", `LLM 解释\n${content}`, "可见信息限制\n回答只基于当前光标之前的可见信息。"].join("\n\n");
}

function unavailable(model: string | undefined, message: string, failureReason?: AnalysisLlmResult["failureReason"]): AnalysisLlmAnswer {
  return {
    llm: {
      provider: "heuristic",
      model: model ?? null,
      status: "unavailable",
      failureReason,
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

function getResponseFormat(env: NodeJS.ProcessEnv) {
  const configured = normalizeOptional(env.ANALYSIS_LLM_RESPONSE_FORMAT);

  if (configured === "json_schema" || configured === "json_object") {
    return configured;
  }

  return (env.ANALYSIS_LLM_BASE_URL ?? "").includes("deepseek") ? "json_object" : "json_schema";
}
