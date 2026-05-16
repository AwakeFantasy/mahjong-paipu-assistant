# Mahjong Paipu Assistant

Mahjong Paipu Assistant is a local-first Japanese mahjong replay and review tool for Mahjong Soul paipu links.

It focuses on:

- Importing Mahjong Soul paipu records.
- Replaying a round with four-seat hands, rivers, calls, dora indicators, riichi sticks, scores, and timeline controls.
- Comparing the selected player's real decisions with an optional Mortal-compatible engine.
- Showing top engine candidates and per-tile recommendation percentages.
- Asking an optional OpenAI-compatible LLM about the currently visible position.

This repository is the open-source replay/review app. It does not include account systems, payment, wallet, admin APIs, database migrations, production billing logic, hosted Mortal models, or private deployment configuration.

## Status

The app is intended for local development and research-style review. Mahjong Soul, Mortal, MahjongCopilot, and any model weights are third-party projects/assets and are not bundled here.

The LLM and Mortal integrations are adapter-based and optional. The app remains usable without them.

## Features

- Mahjong Soul URL parsing and record normalization.
- Tenhou-style table replay with desktop and mobile layouts.
- Four-player hand playback, with a toggle for opponent hands or tile backs.
- Correct call handling for chi, pon, kan, kakan, ankan, daiminkan, and claimed discard removal.
- Dynamic dora indicators, including kan dora inference when available.
- Dynamic riichi-stick display.
- Score trend chart with round and score axes.
- Previous/next event and previous/next difference navigation across rounds.
- Optional Mortal sidecar:
  - discard, riichi, pass, chi, pon, kan, and win candidates
  - top candidate ranking
  - probabilities and q-value score display
  - local cache for successful overlays
- Optional OpenAI-compatible LLM chat for the visible snapshot.

## Requirements

- Node.js 20 or newer is recommended.
- npm.
- A Mahjong Soul account that can read the target paipu.
- Optional: an OpenAI-compatible LLM API key.
- Optional: a local Mortal-compatible engine or HTTP service.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

At minimum, configure Mahjong Soul credentials in `.env.local`:

```env
MAJSOUL_ACCOUNT=
MAJSOUL_PASSWORD=
MAJSOUL_REGION=cn
```

Then paste a Mahjong Soul paipu URL into the app.

## Environment Variables

See [.env.example](.env.example) for the full list.

Important groups:

- `MAJSOUL_*`: login, region, gateway, and proxy options for reading paipu records.
- `ANALYSIS_LLM_*`: optional OpenAI-compatible chat completion endpoint.
- `ANALYSIS_ENABLE_ENGINE`, `MORTAL_ENGINE_URL`: optional Mortal-compatible engine endpoint.
- `MORTAL_COMMAND_TEMPLATE`, `MORTAL_WORKER_COMMAND_TEMPLATE`: optional local sidecar command modes.

Keep real credentials in `.env.local`; `.env.local` is ignored by Git.

## Mortal Engine

The web app talks to a neutral HTTP endpoint:

```text
POST MORTAL_ENGINE_URL
```

For local development, this repository includes `scripts/mortal-sidecar.mjs`. It accepts `/analyze` requests from the app, converts the visible snapshot to mjai JSON lines, calls a configured engine command or worker, and converts engine output back into UI recommendations.

Start it in a second terminal:

```bash
npm run mortal:sidecar
```

Recommended local `.env.local` shape:

```env
ANALYSIS_ENABLE_ENGINE=true
MORTAL_ENGINE_URL=http://127.0.0.1:4010/analyze
MORTAL_SIDECAR_HOST=127.0.0.1
MORTAL_SIDECAR_PORT=4010
MORTAL_WORKER_COMMAND_TEMPLATE=
MORTAL_COMMAND_TEMPLATE=
```

`MORTAL_WORKER_COMMAND_TEMPLATE` is preferred because it can keep a model process warm. `MORTAL_COMMAND_TEMPLATE` is simpler but starts a process per request.

The included `mortal-mahjongcopilot-*.py` scripts are optional adapters for users who already have a compatible local MahjongCopilot/Mortal setup. They require users to provide their own local paths via environment variables. This repository does not ship MahjongCopilot, libriichi, Mortal weights, or any model files.

More detail: [docs/mortal-engine-local-dev.md](docs/mortal-engine-local-dev.md).

## LLM Chat

LLM support is optional. Configure an OpenAI-compatible endpoint:

```env
ANALYSIS_LLM_BASE_URL=https://api.openai.com/v1
ANALYSIS_LLM_API_KEY=
ANALYSIS_LLM_MODEL=
ANALYSIS_LLM_FLASH_MODEL=
ANALYSIS_LLM_PRO_MODEL=
```

If no key/model is configured, the app falls back to deterministic local summaries and warning messages. This is expected and should not break replay or Mortal review.

The LLM integration is intentionally isolated in:

- `src/lib/majsoul/analysis-llm.ts`
- `src/lib/majsoul/analysis-chat.ts`
- `src/app/api/analysis-chat/route.ts`

Future provider updates should happen behind these adapter boundaries.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm test
npm run test:fixtures
npm run mortal:sidecar
```

## Project Structure

```text
src/app/                      Next.js app and public API adapters
src/components/paipu/          replay UI components
src/lib/majsoul/               paipu parsing, playback, analysis, LLM/engine adapters
scripts/mortal-sidecar.mjs     local Mortal HTTP sidecar
scripts/mortal-*.py            optional local Mortal adapter helpers
public/mahjong-tiles/          local tile SVG assets
fixtures/                      non-secret test fixtures
docs/                          public development notes
```

## Open Source Boundary

This public repository intentionally excludes:

- user accounts and sessions
- billing, recharge, wallet, payment, and admin APIs
- database schema/migrations for commercial operations
- production deployment secrets
- private logs and `.env.local`
- third-party Mortal model weights or engine binaries

See [docs/open-source-boundary.md](docs/open-source-boundary.md).

## Verification Before Release

Current release checks:

```bash
npm test
npm run lint
npm run build
```

Recommended extra checks before publishing:

```bash
git status --short
rg -n "DATABASE_URL|BETTER_AUTH|PAYMENT|wallet|recharge|admin|secret|token|password|D:\\\\|C:\\\\" .
```

The scan will still find placeholder environment variable names such as `MAJSOUL_PASSWORD` and `ANALYSIS_LLM_API_KEY`; real values must not be committed.

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

This project is not affiliated with Mahjong Soul, Yostar, Catfood Studio, Mortal, or MahjongCopilot. Use it with your own accounts, engines, and API keys at your own risk and in accordance with the relevant third-party terms and licenses.
