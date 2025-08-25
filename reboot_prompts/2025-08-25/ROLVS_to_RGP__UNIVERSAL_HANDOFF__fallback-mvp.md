# Technical-to-Strategic Reboot Prompt for rolodexterGPT

Project: fallback-mvp
Date: 2025-08-25
Owner (handoff): rolodexterVS (Windsurf/Cascade) → rolodexterGPT

## 1) Implementation summary and technical achievements

- **Vercel runtime compliance**
  - Changed per-function runtime export to supported value in serverless code:
    - `api/chat.ts` → `export const config = { runtime: "nodejs" }`
    - `api/bigquery.ts` → `export const config = { runtime: "nodejs" }`
  - Removed problematic `as const` assertions on config exports.

- **Serverless stability: lazy imports + abstain responses**
  - `api/chat.ts` now lazy-imports risky modules inside the handler with try/catch to prevent module-init 500s:
    - Registry: `../src/data/templates/template_registry`
    - Router: `../src/data/router/router`
    - Templates: `../src/data/templates`
    - LLM provider: `../src/services/llmProvider`
  - On import failure, always return HTTP 200 with `mode: 'abstain'` and a provenance tag:
    - `IMPORT_REGISTRY_FAIL`, `IMPORT_ROUTER_FAIL`, `IMPORT_TEMPLATES_FAIL`, `IMPORT_LLM_FAIL`
  - Added catch-all telemetry tag `CHAT_RUNTIME` and stack logging in the top-level catch for precise diagnosis via Vercel Function logs.

- **Template registry moved to TS**
  - Eliminated JSON imports. Using static TS registry: `src/data/templates/template_registry.ts`.

- **Netlify hygiene**
  - Removed `dotenv` usage from `netlify/functions/chat.ts`.
  - Fixed `groundingType` to valid union value (`'drilldown'`).

- **TypeScript configuration**
  - Expanded `tsconfig.json` includes to cover `api/`, `functions/`, `netlify/functions/`, and tests.
  - Added Node and Vite types for serverless and client compatibility.

- **Health endpoint**
  - `api/health.ts` returns 200 with `{ ok: true, env: "vercel", ts }` for simple liveness checks.

- **Build outcomes (recent Vercel logs)**
  - Vite build succeeds with ~152 kB JS, ~4.8 kB CSS; build time ~1.9–2.1s on Vercel’s builder.
  - Previous Vercel error due to `"nodejs18.x"` has been addressed by switching to `"nodejs"`.

## 2) Strategic insights and business implications

- **No user-visible 500s in Stage-A**
  - All serverless errors return HTTP 200 with structured JSON (abstain/nodata modes). This stabilizes the demo/Stage-A experience and reduces perceived outages.

- **Telemetry-first debugging**
  - Import failure tags + `CHAT_RUNTIME` stack logging provide fast root-cause signals (which module failed to initialize, where, why).

- **Controlled progression to live mode**
  - Stage-A defaults to mock/templates. Transition to live requires explicit env configuration and validated providers; risks are contained.

- **Operational guardrails**
  - Lazy imports minimize cold-start/init crashes. Static TS registry avoids bundler surprises from JSON imports.

## 3) Documentation requirements and communication needs

- **Deployment instructions**
  - Update `DEPLOYMENT_INSTRUCTIONS.md` and/or `README.md` to note:
    - Vercel per-function runtime must be `"nodejs"` (not `"nodejs18.x"`).
    - Optionally set Node 18 in Vercel Project Settings and add `"engines": { "node": "18.x" }` in `package.json`.

- **API documentation**
  - Document `POST /api/chat` request/response, including `mode` values (`strict`, `abstain`, `nodata`), `provenance` fields, and telemetry tags.
  - Document `POST /api/bigquery` gated by `DATA_MODE === 'bq'`, expected payload (`template_id`, `params`), and diagnostics shape.
  - Document `GET /api/health` for liveness checks.

- **Operator runbook**
  - How to interpret telemetry tags in Function logs.
  - Steps to validate environment variables when enabling live mode.

- **Status tracking**
  - Update `STATUS.md` with Stage-A freeze artifacts (payloads, screenshots, deployment IDs) and verification checklist.

## 4) Stakeholder context and feedback integration

- **Explicit stakeholder requests satisfied**
  - Remove `as const` from Vercel config exports.
  - Enforce lazy imports in `api/chat.ts` with detailed `IMPORT_*` provenance tagging.
  - Remove `dotenv` from serverless functions.
  - Ensure no JSON imports in serverless paths.
  - Lock runtime to Node.js on Vercel functions.
  - Validate that `/api/health` returns 200.
  - Monitor Vercel logs for import/runtime telemetry.

- **Integration points and constraints**
  - Live BigQuery and LLM usage constrained behind environment toggles (`DATA_MODE`, `PROVIDER`, `PERPLEXITY_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`).
  - CORS settings allow cross-origin demo testing.

## 5) Strategic guidance requests and next priorities

- **Decisions needed**
  - Confirm Node 18 policy: set Vercel Project Node version to 18 and add `"engines": { "node": "18.x" }` for consistency while keeping `config.runtime = "nodejs"`.
  - Approve the Stage-A policy to always return 200 on server errors with clear abstain/nodata responses.

- **Immediate next steps**
  - Redeploy and verify `/api/health` (200) on production.
  - Exercise `/api/chat` and inspect Vercel Function logs for `IMPORT_*_FAIL` or `CHAT_RUNTIME` tags. Provide stack traces (if any) for rapid one-line fixes.
  - Capture freeze artifacts and update `STATUS.md`.

- **Short-term roadmap**
  - Add automated smoke tests to assert 200s with expected modes and provenance.
  - Implement structured logging (e.g., JSON logs) and optional log drains for observability.
  - Add unit tests for router and templates to harden module-init paths.
  - Plan controlled rollout to live BigQuery/LLM with environment validation and rate limits.

---

### Handback instructions for rolodexterGPT

1. Review the changes in `api/chat.ts` and `api/bigquery.ts` around `config.runtime` and lazy-import error handling.
2. Confirm the latest deployment on Vercel from `main` and validate `/api/health`.
3. Trigger `/api/chat` requests and check Function logs for `IMPORT_*_FAIL` and `CHAT_RUNTIME`. If present, fix the indicated import/init quickly (usually a one-liner path or export issue).
4. Update `STATUS.md` with validation results and attach screenshots/payloads.
5. If moving beyond Stage-A mock, ensure environment variables and provider settings are correctly configured and documented.
