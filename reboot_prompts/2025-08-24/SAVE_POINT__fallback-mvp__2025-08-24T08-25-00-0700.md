# SAVE POINT — fallback-mvp (Stage-A Freeze) — 2025-08-24T08:25:00-07:00

This is a reboot prompt for a fresh session. Use it as the very first message to restore full context for rolodexterVS (Cascade) and Joe.

---

## Roles
- **rolodexterVS (Cascade)**: Pair-programmer and deployment sherpa. Prioritize concise actions, grounded in the repo. Never 500 the `/api/chat` route. Keep diffs minimal.
- **Joe**: Reviewer/driver. Provides Vercel screenshots/logs and confirms smoke results.

## Primary Objective
Eliminate 500s on Vercel `/api/chat` and complete Stage‑A freeze by enforcing mock‑only behavior with deterministic 200 responses `{mode: "strict"|"nodata"|"abstain"}`. Capture freeze artifacts (logs, payloads, screenshots) and update `STATUS.md`.

## Current Status Snapshot
- Stage‑A lock-in implemented.
  - `api/chat.ts` crash-proofed. Normalizes `template` hint, server-side routing via `routeMessage()`, returns 200 on all paths. LLM calls disabled in mock.
  - `src/data/templates/index.ts` returns deterministic mock outputs when not live; `runTemplate()` short-circuits in mock.
  - `api/bigquery.ts` abstains unless `DATA_MODE==='bq'` and lazy‑inits BigQuery client.
  - `api/health.ts` simple OK with timestamp.
  - Client endpoint config in `src/services/chatClient.ts` expects `VITE_DEPLOY_PLATFORM=vercel` or auto-detects via `/api/health`.
- Local build OK:
  - `logs/build_latest.log` shows clean Vite build.
  - `logs/tsc_latest.log` is empty (no TS errors).
- Prod still shows a 500 on chat submission (screenshot provided). This likely indicates a module evaluation error before the handler executes.

## Likely Root Cause In Prod (Vercel)
- A top-level import that Vercel’s Node bundler cannot load, most likely JSON ESM imports:
  - `api/chat.ts` → imports `../src/data/templates/template_registry.json`.
  - `src/data/router/router.ts` → imports `./keywords.json`.
- In some Vercel Node configurations, JSON ESM imports may require assertions or TS/JS shim and can throw at cold start, causing a 500 before our `try/catch`.

## Repository Layout (relevant)
- API routes
  - `api/chat.ts`
  - `api/bigquery.ts`
  - `api/health.ts`
- Data + routing
  - `src/data/templates/index.ts`
  - `src/data/templates/template_registry.json`
  - `src/data/router/router.ts`
  - `src/data/router/keywords.json`
- Clients
  - `src/services/chatClient.ts`
  - `src/services/bigQueryClient.ts`
  - `src/services/llmProvider.ts`
- Public mock data
  - `public/data/*.json`
  - `public/mock-data/*.json`
- Logs
  - `logs/build_latest.log`
  - `logs/tsc_latest.log`

## Deterministic Modes and Guards
- Stage‑A default: `DATA_MODE` defaults to `"mock"`.
  - Mock: never call BigQuery/LLM; return deterministic strings. All errors 200 with `{mode:"nodata"|"abstain"}`.
  - Live: only if explicitly set; otherwise abstain.
- `api/bigquery.ts`: Hard-guard returns `{ mode: 'abstain' }` unless `DATA_MODE==='bq'`.
- `api/chat.ts`: Returns 200 on all paths; logs errors; no LLM in mock.

## Environment Expectations (Vercel)
- Set: `VITE_DEPLOY_PLATFORM=vercel`.
- Do NOT set: `DATA_MODE` (defaults to mock), provider keys (unless intentionally live).

## Canonical Smoke Prompts (Prod)
Send in UI, observe `/api/chat` Network:
1. `Z001 June snapshot`
2. `Top counterparties YTD`
3. `Monthly gross trend`
4. `list all business units`

Expected:
- HTTP 200 always.
- Routed → `{ mode: "strict", text: "...", provenance: { source: "mock", template_id: "..." } }`
- Unrouted/missing template → `{ mode: "nodata" | "abstain", provenance: { source: "mock", reason: "..." } }`

## Unresolved Threads
- 500 persists on Vercel prod.
  - Need the first 10–20 lines of Vercel Functions log for `api/chat` during the failure.
  - Verify `/api/health` returns 200 on prod; if it 500s too, failure occurs at module load.

## Decision Tree (Prod 500)
- If Vercel logs show JSON import/assertion errors or module not found:
  - Fix path A (fastest): replace JSON imports with TS modules exporting objects.
    - Convert `src/data/templates/template_registry.json` → `template_registry.ts` exporting `const templateRegistry = {...}`.
    - Convert `src/data/router/keywords.json` → `keywords.ts` exporting `const keywords = {...}`.
    - Update imports in `api/chat.ts`, `router.ts`, `templates/index.ts` to import from TS.
  - Fix path B: use Node `createRequire` in `api/chat.ts` to load JSON at runtime:
    ```ts
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    const templateRegistry = require('../src/data/templates/template_registry.json');
    ```
    Do similarly for any server-side usage of JSON.
- If logs show alias/resolve error:
  - Ensure no `@/` aliases in `api/*`. Current code uses relative imports already.
- If client endpoint is wrong:
  - Confirm `VITE_DEPLOY_PLATFORM=vercel` is set; `window.__riskillDebug.endpoint === '/api/chat'`.

## Freeze Artifacts To Capture
- Local logs:
  - `npx tsc -p tsconfig.json --noEmit *> logs/tsc_latest.log`
  - `npm run build *> logs/build_latest.log`
- From prod:
  - DevTools Network payloads for the 4 prompts → `reports/STAGE_A_CHAT_AUDIT_20250824/payloads/`
  - Screenshots of UI (5‑widget rail + each answer)
- Update `STATUS.md`:
  - Append: `Stage-A frozen on 2025-08-24T08:25:00-07:00`

## Active TODOs (working list)
- [pending][high] Set Vercel env `VITE_DEPLOY_PLATFORM=vercel` and redeploy (`todo-vercel-env-redeploy`).
- [pending][medium] Capture freeze artifacts and update `STATUS.md` (`todo-freeze-artifacts-update`).
- [completed][high] Crash-proof `api/chat` responses (`todo-crash-proof-chat`).
- [completed][high] Short-circuit templates to mock-only (`todo-shortcircuit-runTemplate`).
- [completed][high] Guard `api/bigquery.ts` unless `DATA_MODE='bq'` (`todo-guard-bigquery-api`).
- [completed][high] Normalize/validate template id in `api/chat.ts` (`todo-normalize-templateid-chat`).
- [completed][medium] Replace CommonJS `require` with JSON import in templates for ESM safety (`todo-json-import-templates`).
- [completed][low] Revert unused legacy template edits (`todo-revert-unused-templates`).

## Naming and Conventions
- Prefer relative imports in serverless routes (no `@/` inside `api/`).
- Stage‑A response modes: `strict` (mock/template grounded), `nodata`, `abstain`.
- Provenance includes `{ source: "mock"|"live", template_id, reason? }`.

## Constraints
- OS: Windows (dev). Vercel for prod.
- Keep PR diffs minimal. No accidental external calls in Stage‑A.

## How To Resume Right Now
1. Confirm `VITE_DEPLOY_PLATFORM=vercel` in Vercel.
2. Open `Vercel → Functions → api/chat` and copy the top stack of the failing invocation. Paste it into chat.
3. If it’s JSON import related, choose:
   - Convert `template_registry.json` and `keywords.json` to TS modules; update imports; redeploy.
   - Or switch `api/chat.ts` to `createRequire()` for `template_registry.json`.
4. Re‑deploy, run the 4 canonical prompts, save payloads/screenshots, update `STATUS.md`.

## Useful File References
- `api/chat.ts`
- `api/bigquery.ts`
- `api/health.ts`
- `src/data/templates/index.ts`
- `src/data/templates/template_registry.json` (candidate for TS convert)
- `src/data/router/router.ts`
- `src/data/router/keywords.json` (candidate for TS convert)
- `src/services/chatClient.ts`
- `src/services/llmProvider.ts`
- `logs/build_latest.log`, `logs/tsc_latest.log`

---

When you load this Save Point in a new session, immediately request the Vercel `api/chat` function logs for the 500 and proceed with the JSON import hardening if indicated.
