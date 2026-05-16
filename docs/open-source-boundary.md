# Open Source Boundary

This repository is the public Mahjong Paipu Assistant app. It contains the replay UI, paipu parsing, local analysis helpers, and optional LLM/Mortal adapters.

## Included

- Mahjong Soul URL parsing and record normalization.
- Playback state construction.
- Decision point extraction and difference comparison.
- Tile display, table layout, controls, score trend, and review panels.
- Optional local Mortal sidecar protocol and adapter scripts.
- Optional OpenAI-compatible LLM adapter.
- Unit tests and non-secret fixtures.

## Excluded

The public repository must not contain:

- account registration/login/session systems
- payment, recharge, wallet, quota, or credit systems
- admin APIs or internal operation tools
- database schemas/migrations for commercial operations
- production deployment scripts or secrets
- private logs
- `.env.local`
- hosted engine credentials
- third-party model weights or engine binaries

## Allowed Runtime Secrets

The app can read local environment variables such as:

- `MAJSOUL_ACCOUNT`
- `MAJSOUL_PASSWORD`
- `MAJSOUL_ACCESS_TOKEN`
- `ANALYSIS_LLM_API_KEY`

These names may appear in `.env.example` and code because users need to configure them locally. Real values must only live in `.env.local` or the user's private shell environment.

## Mortal Boundary

Mortal integration is a protocol boundary:

```text
Next app -> /api/engine-overlay -> MORTAL_ENGINE_URL
```

The public app may include adapter code, but must not vendor:

- Mortal model weights
- `libriichi` binaries
- MahjongCopilot source code
- private local engine checkouts

Users are responsible for installing and licensing their own local engine runtime.

## LLM Boundary

LLM support should stay behind the OpenAI-compatible adapter in `src/lib/majsoul/analysis-llm.ts`.

Future provider updates should avoid leaking provider-specific business logic into UI components. UI components should only consume generic analysis results and warnings.

## Release Checklist

Before publishing:

1. Run `npm test`.
2. Run `npm run lint`.
3. Run `npm run build`.
4. Confirm no private backend directories exist, especially `src/server`, `/api/admin`, `/api/auth`, `/api/recharge`, `/api/payments`, `/api/wallet`, and `/api/analysis-jobs`.
5. Confirm no `.env.local`, logs, cookies, tokens, private keys, or model weights are tracked.
6. Search for private local absolute paths.
7. Search for backend/commercial keywords and verify any remaining hits are harmless documentation or local placeholder names.
8. Confirm README describes optional LLM/Mortal configuration and third-party licensing boundaries.
