# SAVE POINT — fallback-mvp
Created: 2025-08-25T08-35-49-0700
Owner: rolodexterVS (Cascade)
Participants: Joe (user), rolodexterVS (assistant)
Intended consumer: rolodexterGPT (for reboot)

---

## USE THIS PROMPT AS THE FIRST MESSAGE IN A NEW CHAT
You are rolodexterVS (Windsurf/Cascade). Resume the project exactly where it left off using the context below. Maintain continuity of tasks, architecture, and testing plan without re-discovery.

---

## 1) Working Memory State — Objective and Current TODOs
- __Primary objective__: Finalize BigQuery Templates integration and validation for an executive pilot GO decision.
- __Goals__:
  - Clean TypeScript build.
  - ESM import specifiers correctness in `api/*` (use `.js`).
  - Router parameter extraction correctness for BU snapshot (`{ unit, year, month }`).
  - Telemetry plumbing with sanitized provenance.
  - Deterministic mock outputs and validated live BQ outputs.

- __Active TODO list__ (carry these forward):
  - [in_progress] Run TypeScript diagnostics: `npx tsc --noEmit --pretty false` (validate clean build)
  - [pending] Run local mock smoke tests against dev server (4 prompts)
  - [pending] Run Preview/live BQ smoke tests (3 prompts) with `DATA_MODE=bq`
  - [completed] Generate strategic reboot prompt for rolodexterGPT (done)
  - [in_progress -> complete on load] Create conversation Save Point reboot prompt (this file)

- __Canonical smoke prompts__:
  - "Z001 June snapshot"
  - "Z001 2024"
  - "Monthly gross trend"
  - "Top customers YTD"

---

## 2) Task Flow and How To Resume
- __Dev server model__:
  - Vite dev (port 5173 by default) serves UI only and will 404 `/api/*`.
  - Use Vercel dev to serve `api/*` locally.
    - Recommended: `npx vercel dev --listen 5173` so existing scripts hitting 5173 work unchanged.
    - Sanity check: `GET http://localhost:5173/api/health` → 200 JSON.

- __Execution steps__:
  1. Run `npx tsc --noEmit --pretty false` and ensure no type errors.
  2. Start `vercel dev` as above.
  3. Run 4 mock smoke prompts via `POST /api/chat` and verify deterministic text, expected widgets, sanitized provenance.
  4. Switch to live BigQuery:
     - Set `DATA_MODE=bq` and required env: `GOOGLE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `BQ_DEFAULT_DATASET`, `BQ_LOCATION`.
     - Run the 3 canonical prompts. Confirm `provenance.source:"bq"` and `provenance.bq` fields.

- __Pass/Fail gating__:
  - PASS when TS is clean and all live prompts return non-empty `text`, correct widgets/KPIs, and sanitized `provenance.bq` including `ms` and dataset/location.

---

## 3) Relevant Project Files and Responsibilities
- __Serverless APIs (Vercel style)__:
  - `api/chat.ts` — routes messages, runs templates, normalizes to `{ text, widgets }`, 200-always with diagnostic tags.
  - `api/bigquery.ts` — executes SQL from `sql/`, returns `rows` and sanitized `diagnostics` (`ms`, `jobId`, `dataset`, `location`, `bytesProcessed?`, `cacheHit?`).
  - `api/health.ts` — health check.

- __Templates and registry__:
  - `src/data/templates/business_units_snapshot_yoy_v1.ts`
  - `src/data/templates/monthly_gross_trend_v1.ts`
  - `src/data/templates/top_counterparties_gross_v1.ts`
  - `src/data/templates/template_registry.ts` — maps domain/template IDs; imports with `.js` when referenced by `api/*`.
  - `src/data/templates/index.ts` — `runTemplate()` orchestration.

- __Router__:
  - `src/data/router/topicRouter.ts` — deterministic mapping from NL → `{ domain, template_id, params }`; extracts `{ unit, year, month }`.
  - `src/data/router/router.ts` — topic detection utilities.

- __BigQuery client__:
  - `src/services/bigQueryClient.ts` — calls `/api/bigquery`, returns rows + sanitized telemetry for templates.

- __SQL templates__:
  - `sql/*.sql` — includes `business_units_snapshot_yoy_v1.sql`, `monthly_gross_trend_v1.sql`, `customers_top_n.sql`, etc.

- __Config & dev__:
  - `tsconfig.json` — narrowed includes, excludes tests/scripts/vite config; ESM/bundler resolution.
  - `vite.config.ts` — UI build config.
  - `netlify.toml` — redirects present; current validated local flow uses `api/*` via Vercel dev.
  - `scripts/dev_detached.ps1` — utility for detached dev server.

---

## 4) System Constraints and Naming Conventions
- __ESM imports in serverless__:
  - In `api/*`, dynamic imports must use `.js` specifiers when pulling from `src/*` built output.
- __Telemetry privacy__:
  - Provenance whitelist only: `ms, jobId?, rows?, dataset?, location?, bytesProcessed?, cacheHit?`.
  - No raw SQL, no sensitive params exposed to UI.
- __HTTP semantics__:
  - `/api/chat` returns 200 for both success and tagged failures with diagnostic context.
- __Output normalization__:
  - Always flatten to `{ text, widgets }` for UI consumption; maintain legacy fallback if needed.
- __Router defaults__:
  - If `month` provided without `year`, infer year; omit undefined params to avoid BigQuery named param mismatches.
- __File naming for save points__:
  - `reboot_prompts/YYYY-MM-DD/SAVE_POINT__fallback-mvp__<timestamp>.md`.

---

## 5) Architectural Discoveries and Integration Notes
- __Design decisions__:
  - Template-driven execution with mock/live split; registry-based extensibility.
  - Sanitized telemetry propagated from BigQuery → templates → API response.
  - Exec-friendly router aliases.
- __Integration success__:
  - BigQuery API path working with sanitized diagnostics.
- __Complications__:
  - Local 404s when using Vite for `/api/*`; resolved by using `vercel dev`.
- __Scalability insights__:
  - Telemetry fields enable SLO monitoring and caching decisions; registry eases addition of templates/domains.

---

## 6) Unresolved Threads / Open Items
- Confirm TS diagnostics are clean.
- Complete mock and live smoke runs; capture example responses for docs.
- Consider adding `provenance.freshness` and numeric alignment in table widgets.
- Optional: CI guard to enforce `.js` import specifiers under `api/*`.

---

## 7) Agent Assignments
- __Joe (user)__: Stakeholder/operator running smokes, validating outputs, setting env for live BigQuery, driving GO decision.
- __rolodexterVS (assistant)__: Guide setup, run diagnostics/smokes, fix TypeScript/ESM issues, ensure telemetry and normalization contracts, prepare documentation.
- __rolodexterGPT (next)__: Continue strategic docs, stakeholder updates, coordinate GO/NO-GO, and drive any polish items.

---

## 8) How rolodexterVS Should Proceed on Resume
- Start with TS diagnostics. If clean, boot `vercel dev` and run mock smokes.
- Switch to live BQ and run canonical prompts. Verify `provenance.bq` fields.
- If any test fails, capture full JSON response and address narrowly (imports, router params, telemetry packing).

---

## 9) Quick Reference
- Health: `GET /api/health`
- Chat: `POST /api/chat` with `{ message: string }`
- BigQuery: `POST /api/bigquery` with template and params (as per template contract)
- Env keys: `DATA_MODE`, `GOOGLE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `BQ_DEFAULT_DATASET`, `BQ_LOCATION`

---

This save point captures the working memory and lets you resume seamlessly without losing technical or strategic context.
