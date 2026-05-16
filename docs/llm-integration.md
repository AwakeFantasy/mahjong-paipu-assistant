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
ANALYSIS_LLM_FLASH_MODEL=
ANALYSIS_LLM_FLASH_TIMEOUT_MS=60000
ANALYSIS_LLM_PRO_MODEL=
ANALYSIS_LLM_PRO_TIMEOUT_MS=120000
ANALYSIS_LLM_RESPONSE_FORMAT=json_schema
```

The provider must support a Chat Completions-compatible `POST /chat/completions` endpoint.

## Model Choices

The UI exposes:

- Flash: quick responses, uses `ANALYSIS_LLM_FLASH_MODEL`.
- Pro: slower/deeper responses, uses `ANALYSIS_LLM_PRO_MODEL`.

If a choice-specific model is empty, the adapter falls back according to `analysis-llm.ts`.

## Output Handling

Preferred output is structured JSON:

```json
{
  "answer": "...",
  "keyPoints": [],
  "caveats": [],
  "suggestedQuestions": [],
  "warnings": []
}
```

If the model returns plain text, the app still displays it and adds a warning. If the LLM is unavailable, the app returns a deterministic fallback answer.

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
