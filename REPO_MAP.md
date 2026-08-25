# REPO_MAP.md

## Project Type

Browser-first PHI de-identification web application with server-side rendering for the application shell.

## Tech Stack

React 19, TanStack Start/Router, Vite 8, Nitro 3, TypeScript, Tailwind CSS 4, PDF.js, OpenMed/ONNX, and optional client-initiated OpenRouter calls.

## Package Manager

npm with a committed `package-lock.json`.

## Commands

| Purpose | Command | Verified |
|---|---|---|
| Install | `npm ci` | Yes, 478 packages from lockfile |
| Development | `npm run dev -- --port 8083` | Yes, desktop/mobile browser smoke |
| Tests | `npm test` | Yes, 249 passing (159 script, 90 application) |
| Synthetic PHI evaluation | `npm run test:phi-eval` | Yes, 2/2 fixtures and 16/16 required surfaces |
| Built-browser OpenMed proof | `npm run test:openmed-browser` | Yes, WASM inference, 23 spans, zero sensitive egress |
| Type check | `npm run typecheck` | Yes |
| Lint | `npm run lint` | Yes |
| Production build | `NITRO_PRESET=node-server npm run build` | Yes |
| Production start | `npm run start` | Yes, desktop/mobile smoke matched dev baseline |

## Entry Points

- `src/routes/index.tsx` mounts the Harbor interface.
- `src/components/harbor-app.tsx` owns the workflow and UI state.
- `src/lib/phi/` owns local extraction, detection, merging, redaction, export, and OpenMed runtime state.
- `.output/server/index.mjs` is the generated Fly runtime entry point.

## Major Folders

- `src/`: application and privacy-sensitive client logic.
- `scripts/`: build, migration, guard, and test helpers.
- `server/`: Nitro middleware for PWA metadata/install behavior.
- `public/`: icons and install assets.
- `screenshots/`: synthetic visual QA evidence.

## Existing Patterns To Preserve

- Auth and database remain disabled unless accounts are explicitly requested.
- Source PDFs and detected text remain browser-local until explicit user approval.
- The Grok PWA middleware and preview host bridge remain intact.
- Vercel remains the default Nitro preset; Fly selects `node-server` during its container build.

## Tests and Verification

Node test suites cover PHI detection, OpenMed fallback state, and build/auth guard behavior. The built-browser proof verifies real pinned OpenMed inference on synthetic input and network privacy. Browser smoke covers desktop and mobile. The Fly container must also pass a live root-page health check.

## Likely Files For Current Task

`src/lib/phi/openmed.ts`, `src/lib/phi/openmed-device.test.ts`, `scripts/openmed-browser-proof.mjs`, `Dockerfile`, `fly.toml`, `package.json`, `vite.config.ts`, `.gitignore`, `.dockerignore`, and deployment documentation.

## Unknowns

- DNS for `harbor.dnasedlongevity.com` may require a provider-side CNAME after Fly issues its certificate instructions.
- Live Fly behavior remains unverified until the first deployment completes.
