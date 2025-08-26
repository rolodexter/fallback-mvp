---
description: Technical-to-Strategic reboot prompt for rolodexterGPT to continue fallback-mvp without loss of context
---

# 1) Implementation summary and technical achievements

- __Serverless chat function hardening__
  - File: `netlify/functions/chat.ts`
  - Fix: Normalize `templateOutput` to a string (`templateText`) before use; preserve `widgets` passthrough. Prevents the “[object Object]” artifact and stabilizes polishing.
  - Routing precedence: explicit `template_id` → deterministic `topicRouter` → domain route.
  - Semantic rewrite integration: `src/services/semanticRewrite.ts` canonicalizes free-form BU aliases (e.g., “liferafts” → `Z001`) and injects unit codes after rewrite.
  - CORS + OPTIONS preflight handled consistently. Methods restricted to GET/POST/OPTIONS.
  - Strict-mode mock/template responses include `text`, `widgets`, `meta`, and `provenance`.

- __Template runtime__
  - File: `src/data/templates/index.ts`
  - `runTemplate()` returns `{ kpiSummary, templateOutput, provenance }`, where `templateOutput` may be string or `{ text, widgets? }`. Serverless layer now coerces to string for LLM/UI safety.

- __Deterministic routing and aliases__
  - File: `src/data/router/topicRouter.ts` – catches BU-list patterns and common business phrasing.
  - File: `src/data/router/bu_aliases.ts` – maps aliases (e.g., liferafts → Z001). Heuristic rewrite always attempted when `NARRATIVE_MODE != 'llm'` (lower acceptance threshold 0.5).

- __Deployment + config__
  - Netlify configuration: `netlify.toml` ensures `/api/*` → `/.netlify/functions/:splat` before SPA fallback.
  - Deployment script: `deploy_windsurf.ps1` sets `DATA_MODE`, `PROVIDER`, `PERPLEXITY_API_KEY`, `POLISH_NARRATIVE`, `VITE_API_BASE`, links project ID from `windsurf_deployment.yaml`.
  - Smoke tests: `run_smoke_tests.ps1` sets `CHAT_ENDPOINT` based on `-SiteUrl` and runs `reports/STAGE_A_MOCK_20250823/smoke_test.js`.

- __Technical challenge & solution__
  - Challenge: LLM polishing interpolated non-string `templateOutput`, producing UI “[object Object]”.
  - Solution: Always coerce `templateOutput` to string (`templateText`), pass that to polishing and live-mode prompts; preserve `widgets` unchanged.

- __Testing status__
  - Scripts present: `run_smoke_tests.ps1`, `reports/STAGE_A_MOCK_20250823/smoke_test.js`.
  - Recommended probes:
    - Health: `GET https://fallback-mvp-dashboard.windsurf.build/api/health`
    - Chat (mock deterministic): POST `{ "message": "Z001 June snapshot" }` → expect `mode:"strict"`, proper `text`, `provenance.template_id`.

- __Performance metrics__
  - Not yet benchmarked. Log statements added around routing/grounding; recommend capturing duration and cache hits in next iteration.

# 2) Strategic insights and business implications

- __Higher coverage via deterministic routing__
  - Explicit template IDs and topic routing reduce abstains; improves perceived reliability for dashboard Q&A.

- __Alias canonicalization improves UX__
  - Users can use colloquial BU names; rewrite layer maps to canonical codes, reducing friction and training overhead.

- __Polishing optionality__
  - `POLISH_NARRATIVE` toggles LLM rewrite for narrative clarity. Keeping it off in mock mode avoids unnecessary token costs and reduces risk of hallucination.

- __Data mode clarity__
  - `DATA_MODE=mock` predictable outputs support demos and onboarding; `live` requires verified BigQuery creds and provider keys.

# 3) Documentation requirements and communication needs

- __API response contract__ (Update README/API docs)
  - `POST /api/chat` returns object with: `mode`, `text` (string), `widgets` (optional), `meta`, `provenance` (includes `template_id`, `source`). Clarify mock vs live behavior.

- __Template output contract__
  - Document that templates may return string or `{ text, widgets }`. Serverless layer guarantees string `text` to client.

- __Environment variables__
  - `DATA_MODE` (mock|live), `POLISH_NARRATIVE` (true|false), `PROVIDER`, `PERPLEXITY_API_KEY`, `VITE_API_BASE`, `NARRATIVE_MODE`.
  - Guidance: In mock mode, prefer `POLISH_NARRATIVE=false`.

- __Operator runbooks__
  - Deployment steps with `deploy_windsurf.ps1` and Netlify CLI (token, env vars, link by project ID).
  - Smoke tests usage: `./run_smoke_tests.ps1 -SiteUrl https://fallback-mvp-dashboard.windsurf.build`.

# 4) Stakeholder context and feedback integration

- __Integration touchpoints__
  - Frontend: ensure `VITE_API_BASE` matches site origin; `/api/*` redirect precedence confirmed in `netlify.toml`.
  - Data/Infra: BigQuery credentials required for `live`; provider API key management.

- __Feedback drivers__
  - Primary UX complaint addressed: “[object Object]” appearing in narrative prompts.
  - Next feedback to validate: clarity of narratives with/without polishing, adequacy of alias coverage, correctness of deterministic routing.

# 5) Strategic guidance requests and next priorities

- __Decisions needed__
  - Whether to enable `POLISH_NARRATIVE` in mock mode (trade-off: readability vs. cost/latency and risk of deviation).
  - Prioritize expansion of `bu_aliases.ts` and topic patterns to increase first-try answer rate.

- __Next engineering tasks__
  - Add observability: duration metrics, route decision logs, and polishing on/off traces.
  - Expand e2e tests for strict/nodata/abstain paths; verify widgets rendering across key templates.
  - Live mode readiness: validate BigQuery execution in templates; add error surfaces for quota/auth failures.
  - Harden input schema for `/api/chat` (validate `template`, `params`, `history`).

- __Scalability and ops__
  - Netlify Functions runtime: monitor cold starts; consider response caching for deterministic mock outputs.
  - If moving to live data scale, consider BigQuery query caching and pre-aggregation.

---

## Reference index (files and paths)
- Serverless handler: `netlify/functions/chat.ts`
- Templates runtime: `src/data/templates/index.ts`
- Topic router: `src/data/router/topicRouter.ts`
- BU aliases: `src/data/router/bu_aliases.ts`
- Semantic rewrite: `src/services/semanticRewrite.ts`
- Netlify config: `netlify.toml`
- Deploy script: `deploy_windsurf.ps1`
- Smoke tests: `run_smoke_tests.ps1`, `reports/STAGE_A_MOCK_20250823/smoke_test.js`
- Deployment metadata: `windsurf_deployment.yaml`

## Operational notes
- Deployed site (prod): `https://fallback-mvp-dashboard.windsurf.build`
- Health endpoint: `/api/health`
- Chat endpoint: `/api/chat`

## Handback instructions for rolodexterGPT
- Validate the deployed API: health → chat probe with canonical prompt → run smoke tests.
- Confirm frontend `VITE_API_BASE` points to the Netlify site origin.
- Decide on `POLISH_NARRATIVE` default for mock; if enabled, monitor for drift.
- Expand alias coverage and deterministic routes per stakeholder vocabulary.
- Prepare brief stakeholder update summarizing the fix, current stability, and the above decision points.
