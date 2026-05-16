# Mortal Engine Local Development

Mortal support is optional. The app uses a neutral HTTP contract so users can bring their own engine runtime.

## Runtime Shape

```text
Next UI
  -> /api/engine-overlay
  -> src/lib/majsoul/analysis-engine.ts
  -> MORTAL_ENGINE_URL
  -> scripts/mortal-sidecar.mjs
  -> MORTAL_WORKER_COMMAND_TEMPLATE, if configured
  -> MORTAL_COMMAND_TEMPLATE, fallback
  -> user-owned Mortal-compatible executable/service
```

The sidecar converts the visible snapshot into mjai JSON lines and parses engine output back into recommendations.

## Sidecar

Start the sidecar:

```bash
npm run mortal:sidecar
```

Health check:

```bash
curl http://127.0.0.1:4010/health
```

Expected fields:

- `commandConfigured`: `true` when `MORTAL_COMMAND_TEMPLATE` is configured.
- `workerConfigured`: `true` when `MORTAL_WORKER_COMMAND_TEMPLATE` is configured.
- `workerReady`: becomes `true` after a worker-backed request starts successfully.

## Environment

```env
ANALYSIS_ENABLE_ENGINE=true
MORTAL_ENGINE_URL=http://127.0.0.1:4010/analyze
MORTAL_ENGINE_TIMEOUT_MS=35000
MORTAL_SIDECAR_HOST=127.0.0.1
MORTAL_SIDECAR_PORT=4010
MORTAL_PROCESS_TIMEOUT_MS=30000
MORTAL_WORKER_TIMEOUT_MS=25000
MORTAL_WORKER_COMMAND_TEMPLATE=
MORTAL_COMMAND_TEMPLATE=
```

`MORTAL_WORKER_COMMAND_TEMPLATE` is preferred for local development because it can load the model once and reuse the process.

`MORTAL_COMMAND_TEMPLATE` is the compatibility fallback. The sidecar replaces `{actor}` with the target seat:

```env
MORTAL_COMMAND_TEMPLATE=/path/to/run-mortal.sh {actor}
```

## Optional MahjongCopilot Adapter

The repository includes two optional helper scripts:

- `scripts/mortal-mahjongcopilot-worker.py`
- `scripts/mortal-mahjongcopilot-wrapper.py`

They are only adapters for users who already have a compatible local MahjongCopilot/Mortal environment. They require:

```env
MAHJONG_COPILOT_DIR=/absolute/path/to/your/MahjongCopilot
MORTAL_MODEL_FILE=/absolute/path/to/your/mortal.pth
```

The repository does not include MahjongCopilot, libriichi, Mortal model weights, or engine binaries.

## Worker vs Process Mode

Worker mode:

- loads the model once
- accepts JSON-line requests
- creates a fresh bot/request context per request
- avoids cross-snapshot state leakage
- is much faster for difference scanning

Process mode:

- starts a new process per request
- is simpler to debug
- can be slow or timeout if the engine/model cold-starts repeatedly

## Docker Policy

Avoid `docker run --rm ...` per decision during development. It repeatedly starts containers and reloads models.

If Docker is used, prefer a long-running service/container and point `MORTAL_ENGINE_URL` at its HTTP endpoint.

## Validation

1. Start the Next app with `npm run dev`.
2. Start the sidecar with `npm run mortal:sidecar`.
3. Import a paipu.
4. Stop on a decision point.
5. Confirm the Mortal panel either shows ranked candidates or a clear unavailable warning.

If the engine is unavailable, replay and LLM features should remain usable.
