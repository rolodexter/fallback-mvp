# Technical-to-Strategic Handback — fallback-mvp
Created: 2025-08-25T08:32:03-07:00
Owner: rolodexterVS (Cascade)
Target recipient: rolodexterGPT

---

## 1) Implementation summary and technical achievements

- __BigQuery template integration__
  - Implemented three live-capable templates under `src/data/templates/`:
    - `business_units_snapshot_yoy_v1.ts` — accepts `{ unit?, year?, month? }` with default year=prev or inferred from month.
    - `monthly_gross_trend_v1.ts` — produces 6-month trend line widget.
    - `top_counterparties_gross_v1.ts` — Top-N table (default 5), respects `top` param.
  - Each template provides `runMock()` and `runBQ()` with deterministic mock outputs and sanitized telemetry provenance.

- __Runtime orchestration__
  - `src/data/templates/index.ts` exposes `runTemplate()` using a registry (`template_registry.ts`). Chooses `runMock` vs `runBQ` via `DATA_MODE` or `MODE_OVERRIDE` and normalizes outputs.
  - `api/chat.ts` orchestrates routing + template execution, ensures 200-always semantics, and flattens results to top-level `{ text, widgets }` for UI.
  
- __Router and parameter extraction__
  - `src/data/router/topicRouter.ts` deterministically maps NL prompts to `{ domain, template_id, params }`, extracting `{ unit, year, month }` for BU snapshot.
  - Exec-friendly aliases for trend/counterparties/BU supported.

- __BigQuery execution path__
  - `api/bigquery.ts` executes SQL templates from `sql/` with environment-resolved `projectId`, `defaultDataset`, and `location`. Returns sanitized `diagnostics`.
  - `src/services/bigQueryClient.ts` calls `/api/bigquery` and surfaces safe telemetry to templates.

- __Telemetry & provenance (sanitized)__
  - Provenance schema includes only safe fields: `ms, jobId?, rows?, dataset?, location?, bytesProcessed?, cacheHit?`.
  - Update made today: `src/data/templates/business_units_snapshot_yoy_v1.ts` now forwards `ms`, `dataset`, `location` from `diagnostics`, aligning with `api/bigquery.ts` output.

- __ESM correctness & TypeScript config__
  - Dynamic imports under `api/*` use `.js` specifiers (critical for NodeNext/ESM).
  - `tsconfig.json` tightened includes/excludes (excludes `vite.config.*`, tests, scripts) to prevent config bleed.

- __UI compatibility__
  - Server returns top-level `{ text, widgets }` with kpis and provenance. Widgets include `line` for trend and `table` for top counterparties.

### Technical challenges and solutions
- __ESM import errors under serverless__ — Resolved by enforcing `.js` specifiers in dynamic imports (e.g., `api/chat.ts` imports `../src/data/router/topicRouter.js`, `../src/data/templates/index.js`).
- __Telemetry privacy__ — Added explicit whitelist to provenance; templates sanitize fields before returning to UI.
- __Param defaults and robustness__ — BU snapshot carefully infers `year` from `month` when provided and omits `unit` when undefined to avoid BigQuery named parameter mismatches.
- __Flattening regression risk__ — `api/chat.ts` flattens to `text` and `widgets`, with legacy fallback from `templateOutput`.

### Performance metrics and optimization results
- Telemetry includes `ms` per query from `api/bigquery.ts`. No dedicated caching layer is active in the BQ path; guardrails exist (dataset/location scoping). Future optimization could layer caching as per `DOCS/STATUS_CACHING.md`.

### Testing outcomes
- Unit-level smoke approach prepared. Attempted local smoke via `http://localhost:5173/api/chat` returned 404 because Vite does not serve serverless routes. Correct approach: run Vercel dev (`npx vercel dev`) or adjust smoke endpoint to the port where serverless is running.
- TypeScript diagnostics to be executed: `npx tsc --noEmit --pretty false` (expecting clean build).

---

## 2) Strategic insights and business implications

- __What worked well__
  - Template-driven architecture with clear mock/live separation accelerated iteration and supports deterministic demos.
  - Router aliases improve exec usability (simple prompts reach the right templates).
  - Sanitized telemetry enables operational visibility without exposing SQL or sensitive params.

- __What needs attention__
  - Local dev mental model: Vite (static) vs. serverless (Vercel/Netlify) caused 404 on API smoke; doc callouts needed to avoid costly confusion.
  - End-to-end TS diagnostics and preview/live smoke should be routine preflight checks before stakeholder demos.

- __New opportunities enabled__
  - Provenance fields (`ms`, `rows`, `cacheHit?`) allow simple SLO dashboards and regression detection.
  - Template registry makes adding new KPIs straightforward; can expand to more domains with minimal plumbing.

- __Potential strategic pivots__
  - If execs value near-real-time freshness visibility, add `provenance.freshness` (watermark/last_loaded_at) across templates.
  - If table readability becomes a concern, standardize numeric alignment and formatting in widget schema.

---

## 3) Documentation requirements and communication needs

- __Technical specs to update__
  - Document serverless dev paths explicitly:
    - Vercel-style `api/*` served by `vercel dev` (recommend `npx vercel dev --listen 5173` if reusing 5173 in scripts).
    - Vite’s `npm run dev` serves static UI only.
  - Add a short "Local Smoke Recipes" section to `README.md` with PowerShell and curl examples.
  - Confirm and document the sanitized telemetry contract used by templates and `/api/bigquery`.

- __User guidance / training__
  - Short cheat sheet for exec-friendly prompts and what each returns (BU snapshot, Trend, Top-N).
  - Explain `DATA_MODE` and when `mock` vs `bq` is used.

- __API/Integration docs__
  - `POST /api/chat` request/response, including flattening behavior.
  - `POST /api/bigquery` template parameters mapping, normalized `top` handling, and telemetry diagnostics schema.

- __Process improvements__
  - Pre-demo checklist: run `npx tsc`, run smoke on mock + live, verify `/api/health` on the chosen dev port.

---

## 4) Stakeholder context and feedback integration

- __Stakeholder requests captured__
  - Exec-friendly aliases and deterministic outputs in mock mode.
  - Sanitized, UI-safe telemetry for pilot confidence.
  - 200-always semantics from `/api/chat` with diagnostic tags.

- __Integration points__
  - BigQuery via `api/bigquery.ts` using environment credentials and dataset/location.
  - Deployment targets compatible with Vercel (api routes) and Netlify (redirects present), but current validated flow centers on `api/*`.

- __Collaboration & approvals__
  - GO/NO-GO gate defined:
    - TS clean build.
    - Preview/live BQ smoke success with sanitized provenance.

---

## 5) Strategic guidance requests and next priorities

- __Decisions needed__
  - Confirm GO once `npx tsc` is clean and 3 canonical live prompts pass with proper `provenance.bq`.
  - Choose dev server standardization (Vercel dev preferred for unified `/api/*` locally).

- __Immediate next steps__
  1) TypeScript diagnostics: `npx tsc --noEmit --pretty false`.
  2) Start Vercel dev locally:
     - `npx vercel dev --listen 5173` (or change smoke endpoint to the Vercel dev port).
     - Sanity: `GET /api/health` returns 200 JSON.
  3) Mock smoke (deterministic): run 4 prompts to `POST /api/chat`.
  4) Preview/live BQ smoke: set `DATA_MODE=bq`, `GOOGLE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `BQ_DEFAULT_DATASET`, `BQ_LOCATION`, then run the 3 canonical prompts.

- __Polish candidates (fast)__
  - Add `provenance.freshness` (e.g., `watermark_iso`, `last_loaded_at`).
  - Right-align numeric table columns and apply `tabular-nums` for readability.

- __Risks & mitigations__
  - Risk: ESM import regression in `api/*` → Enforce `.js` specifiers, lint rule or CI check.
  - Risk: Endpoint confusion in dev → README section with explicit commands and health check.
  - Risk: Missing telemetry in live → Template contract review; unit test for presence of `provenance.bq` when `source:"bq"`.

---

### Appendix — Key files and paths
- Router: `src/data/router/topicRouter.ts`, `src/data/router/router.ts`
- Templates: `src/data/templates/*.ts`, `src/data/templates/template_registry.ts`, `src/data/templates/index.ts`
- BigQuery client: `src/services/bigQueryClient.ts`
- Serverless handlers (Vercel style): `api/chat.ts`, `api/bigquery.ts`, `api/health.ts`
- SQL templates: `sql/*.sql`
- Dev helpers: `scripts/dev_detached.ps1`
- Config: `tsconfig.json`, `netlify.toml`, `package.json`

### Canonical smoke prompts
- "Z001 June snapshot"
- "Z001 2024"
- "Monthly gross trend"
- "Top customers YTD"

### Expected live telemetry fields
- `provenance.source:"bq"`
- `provenance.bq`: `ms, jobId?, rows?, dataset?, location?, bytesProcessed?, cacheHit?`

---

This prompt is ready for rolodexterGPT to carry forward strategic documentation, coordinate final validations, and drive the exec pilot GO decision.
