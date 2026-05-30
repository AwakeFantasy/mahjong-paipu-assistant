# LLM Integration

LLM chat is optional. The app must work when no LLM key is configured.

## Files

- `src/lib/majsoul/analysis-llm.ts`: OpenAI-compatible provider adapter.
- `src/lib/majsoul/analysis-chat.ts`: combines snapshot summaries, engine output, deterministic fallback, and LLM output.
- `src/app/api/analysis-chat/route.ts`: public local API route used by the UI.

## Configuration

```env
ANALYSIS_LLM_BASE_URL=https://api.openai.com/v1
ANALYSIS_LLM_API_KEY=
ANALYSIS_LLM_MODEL=
ANALYSIS_LLM_TIMEOUT_MS=60000
ANALYSIS_LLM_MAX_TOKENS=900
ANALYSIS_LLM_FLASH_MODEL=
ANALYSIS_LLM_FLASH_TIMEOUT_MS=60000
ANALYSIS_LLM_FLASH_MAX_TOKENS=900
ANALYSIS_LLM_PRO_MODEL=
ANALYSIS_LLM_PRO_TIMEOUT_MS=180000
ANALYSIS_LLM_PRO_MAX_TOKENS=1200
ANALYSIS_LLM_RESPONSE_FORMAT=json_schema
ANALYSIS_LLM_THINKING=disabled
```

The provider must support a Chat Completions-compatible `POST /chat/completions` endpoint.

## Model Choices

The UI exposes:

- Flash: quick responses, uses `ANALYSIS_LLM_FLASH_MODEL`.
- Pro: slower/deeper responses, uses `ANALYSIS_LLM_PRO_MODEL`.

If a choice-specific model is empty, the adapter falls back according to `analysis-llm.ts`.

For DeepSeek V4-compatible endpoints, the adapter defaults to `response_format=json_object`, `max_tokens`, and `thinking={type:"disabled"}` for current-hand chat. This keeps short tactical explanations from entering the provider's slower default thinking mode. Set `ANALYSIS_LLM_THINKING=enabled` only when you intentionally want that latency/cost tradeoff.

## Current-Hand Pipeline

Current-hand chat uses a controlled three-pass LLM pipeline behind the existing public API shape:

1. `planner`: reads the question and structured analysis package, then chooses the answer mode, priority factors, required facts, and claims to avoid.
2. `writer`: writes the visible Chinese answer from the plan and deterministic facts.
3. `verifier`: checks the draft for factual drift, internal field leakage, weak-factor overstatement, and missed user corrections; it returns the final structured answer or a corrected version.

The deterministic layer remains the source of truth. Tile efficiency, safety hints, dora facts, candidate comparisons, knowledge cases, and final local validation are still produced by TypeScript modules before/after LLM wording. The LLM may explain those facts, but should not replace them.

Planner and verifier use lower token budgets and shorter timeouts than the writer pass. The external `AnalysisChatResponse` shape is unchanged; pass-level plan/draft/review data is not sent to the frontend.

## Output Handling

Preferred output is structured JSON:

```json
{
  "answer": "...",
  "conclusion": "...",
  "reasons": [],
  "risks": [],
  "suggestedQuestions": [],
  "evidence": [],
  "directReplies": [],
  "correctionsAccepted": [],
  "warnings": []
}
```

If a pass returns plain text, malformed JSON, times out, or fails, the app still returns a readable controlled answer. If the verifier cannot produce a valid structured answer, the writer draft is locally sanitized and the chat layer can still fall back to deterministic output through `validateAnalysisAnswer()`.

## Privacy

The snapshot sent to the LLM is sanitized by `buildAnalysisContext()`:

- account IDs are removed
- player metadata is minimized
- visible events are clipped to the current cursor
- future events are not sent

Do not add raw paipu records, login credentials, cookies, API keys, or private notes to LLM prompts.

## Future Provider Updates

When adding a new provider:

1. Keep provider-specific request details in `analysis-llm.ts`.
2. Preserve the generic `AnalysisLlmResult` shape.
3. Add tests for configured, unconfigured, timeout, malformed JSON, and plain-text fallback cases.
4. Do not add account, payment, quota, or admin logic to the public route.
