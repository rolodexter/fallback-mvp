# ROLVS Save Point — fallback-mvp — 2025-08-25T06:13:29-0700

Use this as the FIRST message in a brand new conversation to fully reload context for rolodexterVS (Windsurf/Cascade) and Joe. It captures working memory, task flow, critical files, constraints, naming conventions, and open threads so you can resume with zero loss.

---

## Role and Objective

You are rolodexterVS (Windsurf/Cascade), pair-programming with Joe. Objective: finalize and verify BigQuery integration for business-unit snapshots with `{ unit, month, year }`, ensure template outputs are normalized to structured objects for consistent UI rendering, guarantee the chat API returns 200 with diagnostic payloads in Stage-A (even on failures), and validate via TypeScript diagnostics and smoke tests.

---

## Working Memory State (What’s true right now)

- **Stage-A Contract (200-always)**
  - `api/chat.ts` is hardened to always return HTTP 200 with JSON, even on import failures or runtime errors.
  - Diagnostic tags: `IMPORT_ROUTER_FAIL`, `ROUTER_RUNTIME`, `IMPORT_TEMPLATES_FAIL`, `CHAT_RUNTIME`, `NO_GROUNDING`.
- **Data mode semantics**
  - `DATA_MODE` accepted values: `mock`, `live`, `bq` (alias for live execution).
  - Template runner receives `mock` or `live`; provenance reflects raw mode: `mock` | `live` | `bq`.
- **Router and Templates**
  - Router: `src/data/router/topicRouter.ts` exports `routeMessage(msg)`; deterministic mapping for phrases like “Z001 June snapshot”.
  - Templates: `src/data/templates/index.ts` exports `runTemplate(key, store, mode)` returning `{ kpiSummary, templateOutput }`.
  - Business Units live path honors `{ unit, month, year }` (month used for label; BigQuery template currently keyed primarily by `year`).
- **LLM Polishing**
  - Removed from `api/chat.ts` for Stage-A stability. No external provider dependency required to produce responses.
- **BigQuery plumbing**
  - Server-side BigQuery API `api/bigquery.ts`: named parameters, `useLegacySql:false`, improved error diagnostics.
  - Client `src/services/bigQueryClient.ts`: absolute base URL resolution for SSR/serverless using `VERCEL_URL` | `URL` | `DEPLOY_URL`, with localhost fallback.
- **File import convention**
  - Dynamic imports in serverless use explicit `.js` suffix (ESM output).

---

## Task Flow Summary (What we did)

1. Hardened `api/chat.ts` to guarantee 200 JSON responses with meaningful tags and simplified deterministic path.
2. Normalized `DATA_MODE='bq'` → template `'live'` while provenance shows `'bq'` for visibility.
3. Verified router and template exports exist and match dynamic imports.
4. Implemented live BU snapshot generation honoring `{ unit, month, year }` and kept mock narrative for Stage-A.
5. Fixed SSR/serverless URL resolution and BigQuery API named parameters.

---

## Relevant Project Files (What matters)

- `api/chat.ts` — Stage-A chat handler. 200-always JSON, guarded dynamic imports, provenance tagging, normalized template outputs.
- `api/bigquery.ts` — BigQuery serverless endpoint; named params; error diagnostics.
- `src/services/bigQueryClient.ts` — Executes BigQuery via API; absolute base URL resolution for SSR.
- `src/data/router/topicRouter.ts` — Deterministic router; extracts domain/template/params (e.g., BU snapshot).
- `src/data/templates/index.ts` — `runTemplate`; returns `{ kpiSummary, templateOutput }`; BU live path + Stage-A mocks.
- `tests/smoke_test.js` — Manual smoke tests/utilities for environment and chat flows.
- `sql/*.sql` — Source templates: `business_units_snapshot_yoy_v1.sql`, `customers_top_n.sql`, etc.
- `.env.example` — Reference for required env vars.

---

## System Constraints & Conventions (Guardrails)

- **Stage-A behavior**: No 5xx from `/api/chat`; deterministic routing; no LLM required.
- **ESM import rule**: Use `.js` suffix in dynamic imports within serverless handlers.
- **Env variables**:
  - Data: `DATA_MODE` (`mock` | `bq` | `live`) — prod uses `mock`; preview may use `bq`.
  - BigQuery: `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_PROJECT_ID`, `BQ_DEFAULT_DATASET`, `BQ_LOCATION`.
  - Deployment URLs: `VERCEL_URL` | `URL` | `DEPLOY_URL` for absolute base resolution.
  - LLM (optional/off in Stage-A): `PROVIDER`, `PERPLEXITY_API_KEY`, `POLISH_NARRATIVE`.
- **Provenance tags**: `TEMPLATE_RUN`, `IMPORT_ROUTER_FAIL`, `ROUTER_RUNTIME`, `IMPORT_TEMPLATES_FAIL`, `CHAT_RUNTIME`, `NO_GROUNDING`.
- **Template/Domain naming**:
  - Template IDs like `business_units_snapshot_yoy_v1`, `customers_top_n`, `monthly_gross_trend_v1`.
  - Domains like `business_units`, `counterparties`, `performance`, `regional`, `profitability`.

---

## Unresolved Threads (What’s next / open)

- Expand live BigQuery support to:
  - `customers_top_n` (counterparties) with normalized text + widgets.
  - `monthly_gross_trend_v1` (performance trend) and regional templates.
- Surface telemetry in provenance:
  - Add `ms`, `jobId`, and possibly `dataset` from `/api/bigquery` to `/api/chat` provenance.
- Verify build health:
  - Run `npx tsc --noEmit` and address any issues.
  - Run smoke tests (local and preview) for canonical prompts.
- Router coverage:
  - Widen deterministic router to catch near-variants (e.g., “snapshot for Z001 in June”).
- Documentation:
  - `/api/chat` 200-always contract + diagnostic tags.
  - BigQuery env + named-params guide.
  - Operator runbook for `provenance.tag` triage.

---

## How to Resume (Immediate steps)

1. Local sanity:
   - `curl -s http://localhost:5173/api/health`
   - `curl -s -X POST http://localhost:5173/api/chat -H "Content-Type: application/json" -d '{"message":"Z001 June snapshot"}'`
   - Expect 200 with `mode:"strict"` on success; otherwise 200 with diagnostic `provenance.tag`.
2. TypeScript diagnostics:
   - `npx tsc --noEmit --pretty false`
   - Fix any errors in `api/chat.ts` or adjacent imports.
3. Preview (BigQuery on):
   - Set `DATA_MODE=bq`; redeploy; re-run the cURL above; provenance `source:"bq"` expected.
4. Add `/api/bigquery` duration and `jobId` to response and surface in chat provenance.
5. Implement next live templates (counterparties, trend) with normalized outputs.

---

## Agent Assignments

- **rolodexterVS**: Maintain 200-always behavior; expand live templates; add telemetry; grow deterministic router; keep outputs normalized; write/update docs.
- **Joe**: Validate behavior via smoke tests; confirm env configurations per environment; review docs; coordinate stakeholder approvals for enabling `bq` in preview.

---

## Minimal Prompt for Continuation (Paste into new chat if needed)

"""
You are rolodexterVS (Windsurf/Cascade). Continue Stage-A work on fallback-mvp with the following invariants:
- `/api/chat` returns HTTP 200 JSON always, with diagnostic tags on failure.
- `DATA_MODE=bq` maps to template mode `'live'`; provenance shows `'bq'`.
- Use deterministic router and normalized template outputs `{ kpiSummary, templateOutput }`.
- No LLM dependency required in Stage-A.

Immediate tasks:
1) Add `/api/bigquery` timing/jobId to chat provenance.
2) Implement live `customers_top_n` and `monthly_gross_trend_v1` template outputs.
3) Run `npx tsc --noEmit` and local/preview smoke tests for “Z001 June snapshot”.
4) Update docs: 200-always contract, env guide, operator runbook for `provenance.tag`.
"""

---

### Reference Index

- `api/chat.ts`
- `api/bigquery.ts`
- `src/services/bigQueryClient.ts`
- `src/data/router/topicRouter.ts`
- `src/data/templates/index.ts`
- `tests/smoke_test.js`
- `sql/`
- `.env.example`
