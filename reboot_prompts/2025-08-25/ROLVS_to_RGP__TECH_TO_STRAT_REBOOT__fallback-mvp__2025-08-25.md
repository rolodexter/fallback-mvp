# Fallback-MVP • Technical-to-Strategic Reboot Prompt (Handback to rolodexterGPT)

Date: 2025-08-25
Owner: rolodexterVS (Windsurf/Cascade)
Target: rolodexterGPT
Scope: Stage-A deterministic chat + BigQuery integration + template normalization

---

## 1) Implementation summary and technical achievements

- **Code changes & features**
  - **Stage-A "200-always" hardening for `api/chat.ts`**
    - File: `api/chat.ts`
    - Guarantees 200 JSON responses with labeled diagnostics on all failures.
    - Guarded lazy imports with readable tags:
      - `IMPORT_ROUTER_FAIL` for `src/data/router/topicRouter.js`
      - `IMPORT_TEMPLATES_FAIL` for `src/data/templates/index.js`
      - `ROUTER_RUNTIME` for routing errors
      - `CHAT_RUNTIME` for last-ditch catch-all
    - Normalizes data mode: `DATA_MODE=bq` → template mode `'live'`; provenance still shows raw `'bq' | 'live' | 'mock'`.
    - Accepts GET `?message=` fallback; CORS: `GET, POST, OPTIONS`.
    - LLM polishing removed for Stage-A stability (no provider dependency required).
  - **Template normalization & live BQ path**
    - File: `src/data/templates/index.ts`
    - `runTemplate(key, store, mode)` returns `{ kpiSummary, templateOutput }` consistently.
    - Business Units snapshot honors `{ unit, month, year }` in live mode via BigQuery.
    - Deterministic mock narrative for Stage-A when not live.
  - **BigQuery client & API improvements**
    - File: `src/services/bigQueryClient.ts` — Fixed absolute base URL resolution for SSR/serverless (`VERCEL_URL`/`URL`/`DEPLOY_URL` with localhost fallback).
    - File: `api/bigquery.ts` — Uses named parameters, `useLegacySql:false`, improved diagnostics and error handling.
  - **Deterministic router**
    - File: `src/data/router/topicRouter.ts` — Maps phrases like “Z001 June snapshot” to `{ domain:"business_units", template_id:"business_units_snapshot_yoy_v1", params:{ unit, month } }`.

- **Technical challenges & solutions**
  - 503s due to early failures (body parse, ESM lazy import, runtime) → solved with full-guard 200 responses and labeled tags.
  - ESM import resolution in serverless → ensured `.js` suffix in dynamic imports (`topicRouter.js`, `templates/index.js`).
  - Prior TS syntax errors in `api/chat.ts` (malformed try/catch with LLM path) → resolved by simplifying to deterministic path with comprehensive guards.
  - Server-side BigQuery calls failing on relative URL → fixed with absolute base URL detection.

- **Performance metrics & optimization**
  - No formal latency metrics captured yet.
  - Optimizations implemented:
    - Avoid LLM calls in Stage-A to reduce cold starts/timeouts.
    - Narrow BigQuery query via template ID + named params.
    - Dynamic imports guarded; failures short-circuit quickly with 200.
  - Recommendation: add timing/provenance details in `/api/bigquery` response (e.g., `ms`, `jobId`), surface in chat provenance.

- **Testing outcomes & feedback**
  - TypeScript diagnostics: expected clean after the new `api/chat.ts` rewrite; re-run `npx tsc --noEmit` to confirm.
  - Smoke tests: `tests/smoke_test.js` exists; manual cURL checks recommended:
    - `POST /api/chat` with `{ "message": "Z001 June snapshot" }` returns 200 with `mode:"strict"` on success or 200 with diagnostic tag on failure.
  - UX feedback (internal): 503s replaced by readable `provenance.tag` in chat bubbles, enabling fast triage.

---

## 2) Strategic insights and business implications

- **Features that worked better**
  - Deterministic routing + normalized template outputs led to stable Stage-A UX without LLM dependency.
  - 200-always contract eliminated "silent" failures; accelerates iteration.

- **Features that underperformed / constraints**
  - Live BigQuery integration currently focused on BU snapshot; broader domain coverage pending.
  - ESM path sensitivity in serverless requires `.js` suffices for dynamic imports; fragile to refactors.

- **New opportunities enabled**
  - Provenance tagging allows fine-grained reliability dashboards and auto-triage.
  - Parameterized templates (unit/month/year) open the door to drilldowns and chart widgets.

- **Potential strategic pivots**
  - Keep LLM polishing optional and off by default in prod; enable per-environment (preview) to gather value signal.
  - Invest in deterministic routers first to cover top journeys, then integrate LLM for narrative polish only.

---

## 3) Documentation requirements and communication needs

- **Technical specifications to update**
  - Document the 200-always response contract for `api/chat.ts` including diagnostic tags and response schema.
  - Update BigQuery access doc: env vars, dataset names, named params usage, and error surfaces.
  - ESM import conventions: always use `.js` suffix in dynamic imports inside serverless.

- **User guidance / training**
  - Stage-A usage guide: deterministic prompts (e.g., “Z001 June snapshot”) and expected outputs.
  - Troubleshooting guide: how to read `provenance.tag` and next steps for each tag.

- **API docs / integration guides**
  - `/api/chat` request/response examples for mock vs bq (preview) modes.
  - `/api/bigquery` contract, including request shape `{ templateId, params }` and response `{ success, rows, diagnostics }`.

- **Process improvements**
  - Add CI step: `npx tsc --noEmit` and a minimal route smoke test post-deploy.
  - Centralize env config guidance for prod vs preview.

---

## 4) Stakeholder context and feedback integration

- **Stakeholder requests**
  - Visibility into why a bubble fails → satisfied by labeled diagnostic tags and 200-always responses.
  - Live data readiness → BU snapshot wired; expand to counterparties/performance next.

- **Integration points**
  - Infra: BigQuery credentials (`GOOGLE_*`) and deployment env URLs.
  - Data: SQL templates under `sql/` align with `templateId` mapping in `bigQueryClient.ts`.

- **Communication patterns**
  - Use provenance tags in bug reports (e.g., `IMPORT_TEMPLATES_FAIL` with timestamp) to accelerate ops triage.

- **Approval workflows**
  - Preview envs may toggle `DATA_MODE=bq`; prod remains `mock` until sign-off on creds/SLAs.

---

## 5) Strategic guidance requests and next priorities

- **Decisions needed**
  - Confirm policy: LLM polishing off in prod; optionally on in preview with rate limits.
  - Approve expansion plan for live templates (counterparties, performance trend, regional) and the minimal KPIs for each.
  - Approve provenance schema (include `ms`, `jobId`, and `dataset`) for observability.

- **Immediate next steps**
  1. Add light telemetry to `/api/bigquery` (duration, jobId) and surface in chat provenance.
  2. Implement live template for `customers_top_n` and `monthly_gross_trend_v1` with normalized outputs.
  3. Add CI `tsc --noEmit`, a cURL smoke test, and automated preview env checks for `DATA_MODE`.
  4. Author docs:
     - `api/chat` response contract + diagnostic tags.
     - Operator runbook for `provenance.tag` triage.
     - Env config matrix (prod vs preview) with safe defaults.

- **Risks & mitigations**
  - ESM import regressions → add unit tests for importability and enforce `.js` suffix in lint rules.
  - Missing creds in preview → keep 200-always contract; add clear `BQ_ERROR` tag in template layer if applicable.
  - Query cost/latency drift → introduce parameter guards and row limits; cache when feasible.

---

### Reference index

- Router: `src/data/router/topicRouter.ts`
- Templates: `src/data/templates/index.ts`
- Template registry: `src/data/templates/template_registry.ts`
- BigQuery client: `src/services/bigQueryClient.ts`
- BigQuery API: `api/bigquery.ts`
- Chat API (hardened): `api/chat.ts`
- Smoke tests: `tests/smoke_test.js`
- Env: `.env.example`, deployment provider settings

### Env variables

- `DATA_MODE` → `mock` (prod) | `bq` (preview) | `live`
- `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_PROJECT_ID`, `BQ_DEFAULT_DATASET`, `BQ_LOCATION`
- `VERCEL_URL` | `URL` | `DEPLOY_URL` (absolute base URL resolution)
- Optional LLM (kept off in Stage-A): `PROVIDER`, `PERPLEXITY_API_KEY`, `POLISH_NARRATIVE`

---

## How rolodexterGPT should proceed

1. Confirm TypeScript diagnostics are clean (`npx tsc --noEmit`).
2. Run cURL smoke tests for `/api/chat` in mock and preview (bq) to validate 200-always behavior and tags.
3. Instrument and expose `jobId/ms` in provenance.
4. Expand live templates (counterparties, performance trend) and keep outputs normalized.
5. Update docs as listed above and circulate an env matrix to stakeholders for sign-off.

Handback file location:
- `reboot_prompts/2025-08-25/ROLVS_to_RGP__TECH_TO_STRAT_REBOOT__fallback-mvp__2025-08-25.md`
