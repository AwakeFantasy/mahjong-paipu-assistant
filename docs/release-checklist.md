# Release Checklist

Use this before publishing a public GitHub repository.

## Code Checks

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

Known audit status at the time this checklist was written:

- Next.js was upgraded to a patched 16.2.6 line.
- `protobufjs` is still reported by `npm audit` through the Mahjong Soul parsing stack. npm reports no fix currently available for this dependency path. Treat paipu parsing as untrusted input handling and keep the parser isolated from secrets and privileged operations.

## Public Boundary Checks

Confirm these paths do not exist:

```text
src/server
src/app/api/admin
src/app/api/auth
src/app/api/recharge
src/app/api/payments
src/app/api/wallet
src/app/api/analysis-jobs
drizzle.config.ts
```

Confirm only these API routes are present:

```text
src/app/api/analyze
src/app/api/analysis-chat
src/app/api/engine-overlay
```

## Secret Scan

Run:

```bash
rg -n "AIza|sk-[A-Za-z0-9]|ghp_|github_pat_|xox[baprs]-|BEGIN (RSA|OPENSSH|PRIVATE)|password\\s*=\\s*[^\\s#]|token\\s*=\\s*[^\\s#]|secret\\s*=\\s*[^\\s#]" . -g "!node_modules" -g "!.next" -g "!package-lock.json"
```

Expected result: no real secrets. Placeholder environment variable names in `.env.example` are allowed.

Also check for local absolute paths:

```bash
rg -n "D:\\\\|C:\\\\" README.md docs src scripts .env.example
```

Expected result: no private local paths.

## Third-Party Assets

- Tile SVGs in `public/mahjong-tiles/` are part of this repository's public app assets.
- Mortal, MahjongCopilot, libriichi, and model weights are not included.
- Users must provide their own engine runtime if they enable Mortal.

## GitHub Publishing

If this directory is the public repository:

```bash
git status --short
git add .
git commit -m "Prepare open-source release"
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

If preserving a private working repository, publish from a fresh clone or a filtered branch that contains only the public files.
