# Stage-A Technical-to-Strategic Reboot Prompt for rolodexterGPT (fallback-mvp)

Timestamp: 2025-08-24T07:22:08-07:00
Owner (current): rolodexterVS (Windsurf/Cascade)
Handoff Target: rolodexterGPT

---

## 1) Implementation summary and technical achievements

- __Deterministic Stage-A chat locked__
  - Routing: `src/data/router/topicRouter.ts`
    - Canonical prompts covered deterministically:
      - `business_units_snapshot_yoy_v1` ("Z001 June snapshot")
      - `top_counterparties_gross_v1` ("Top counterparties YTD")
      - `monthly_gross_trend_v1` ("Monthly gross trend")
    - New synonym route added (Stage-A safe):
      - "list all business units" → `{ domain: 'profitability', template_id: 'profitability_summary_v1' }`
- __Chat UI polish (Stage-A)__
  - `src/components/chat/ChatPanel.tsx`
    - Added a deterministic 5-widget rail (`WidgetRail`) that renders exactly five domain-relevant cards with skeleton placeholders.
    - Enforced minimal Intro chips only when no route is detected; never appended after strict answers.
    - Added dev-only domain tag in header.
  - `src/components/chat/ChatPanel.css`
    - Forced single-row rail with horizontal scroll on narrow screens; removed shimmer by disabling pseudo-element animation.
    - Increased chat panel height for readability: `height: 720px` (proposes `clamp()` alternative if desired).
    - High-contrast message text for light theme + dark-mode media query.
  - `src/layouts/Dashboard.tsx`
    - Removed legacy static widget row so only the chat + 5-widget rail remains.
- __APIs and templates__
  - No new deps.
  - Template registry already exposes `profitability_summary_v1` routing path.
- __Technical challenges & fixes__
  - Avoided duplicate widget rows by deleting legacy dashboard grid.
  - Eliminated skeleton shimmer to reduce distraction and potential GPU overhead.
  - Ensured deterministic routing precedence over keyword router in `routeToTemplate()` path.
- __Performance notes__
  - Skeleton shimmer removed → fewer repaints; smoother scrolling in rail.
  - Single render pass per message; memoization not necessary at current scale.
- __Testing outcomes (current state)__
  - Manual UI checks performed locally.
  - TypeScript CLI run could not be captured via tool (no output returned); needs a quick local run to log `logs/tsc_latest.log`.
  - Visual checks passed for: single rail, contrast increase, no shimmer, dev-domain tag appears.

---

## 2) Strategic insights and business implications

- __What worked better than expected__
  - Deterministic rail greatly reduces user confusion; clear 5-card summary per domain.
  - High-contrast message colors improved legibility on both light/dark without a full theme system.
- __What underperformed / gaps__
  - Non-canonical prompts still fall to Intro unless explicitly mapped (by design for Stage-A). Users may expect broader understanding.
- __Opportunities unlocked__
  - Clean separation of Stage-A UI and routing primes Stage-B to swap mock outputs for BigQuery without UI refactor.
  - Synonym pattern (e.g., BU list) offers a scalable approach to expand perceived coverage safely.
- __Constraints with implications__
  - Stage-A does not synthesize parameters beyond hard-coded routes; expectations must be managed until Stage-B/C.

---

## 3) Documentation requirements and communication needs

- __Technical specs to update__
  - Update Stage-A contract to include the new synonym route behavior and UI polish rules:
    - Exactly 5 widgets.
    - No Intro chips appended after strict answers.
    - Skeletons without shimmer.
  - Add dev-only domain tag note in debugging section.
- __User guidance__
  - Short “What can I ask?” card for Stage-A with 3 canonical prompts (+ BU list synonym), explaining deterministic scope.
- __API/integration docs__
  - Confirm `api/chat.ts` behavior: honors incoming `router`/`template` hints; returns `{mode:'nodata'}` if router says none/low confidence.
  - Document template registry with mapping to domains and template IDs.
- __Process improvements__
  - Add smoke-test script outputs and screenshot steps to `reports/STAGE_A_CHAT_AUDIT_*/` pattern.
  - Create `logs/tsc_latest.log` and `logs/build_latest.log` as part of CI.

---

## 4) Stakeholder context and feedback integration

- __Stakeholder signals__
  - Preference for surgical UI changes without touching pipeline.
  - Accessibility/readability concerns addressed (higher contrast; bubble differentiation).
  - Desire to avoid duplicated widgets and distracting animations.
- __Integration points__
  - Stage-B will require BigQuery credentials and SQL templates in `sql/` tied to registry IDs.
  - Ensure `DATA_MODE` env handling is documented for mock vs live execution.
- __Communication patterns__
  - Keep deterministic scope explicit in product demos; set expectations for Stage-B live data and Stage-C synthesis.
- __Approvals/workflows__
  - Stage-A freeze should include screenshots, payload JSONs, router logs, and CI logs for reproducibility.

---

## 5) Strategic guidance requests and next priorities

- __Decisions needed__
  - Approve Stage-A freeze with the new synonym route.
  - Confirm whether to adopt `clamp(640px, 75vh, 900px)` for panel height or keep fixed 720px.
  - Decide on additional synonym routes to reduce Intro hits (e.g., “show business units”, “what are the business units”).
- __Immediate next steps (Stage-B)__
  - Wire BigQuery credentials and switch templates to live queries.
  - Implement `runTemplate(domain, params)` → BQ execution path for the three canonical templates first.
  - Add report artifacts to `reports/STAGE_A_CHAT_AUDIT_YYYYMMDD/` and finalize PR.
- __Short-term deliverables__
  - CI: add type-check and build logs to `logs/`.
  - Docs: Stage-A contract page updated; Quick Start for Smoke Tests.
- __Risks & mitigation__
  - Risk: Users expect broader chat understanding.
    - Mitigation: More synonym routes in Stage-A; communicate roadmap to Stage-B/C.
  - Risk: Live data integration complexity.
    - Mitigation: Start with the three templates; add a small adapter layer and strong error handling (`mode:'abstain'`).

---

## Pointers to relevant code (for rolodexterGPT)

- UI:
  - `src/components/chat/ChatPanel.tsx` — message handling, route usage, 5-widget rail.
  - `src/components/chat/ChatPanel.css` — rail layout, contrast, height, no-shimmer skeletons.
  - `src/layouts/Dashboard.tsx` — removed legacy static grid.
- Routing:
  - `src/data/router/topicRouter.ts` — deterministic routes + new BU list synonym.
  - `src/data/router/router.ts` — keyword-based domain detection used server-side as fallback.
- API Path:
  - `api/chat.ts` — data mode check, grounding, strict vs nodata, provenance.
- Templates & Registry:
  - `src/data/templates/registry.ts` — maps IDs to domain run functions.
  - `src/templates/profitability_summary_v1.ts` — referenced by synonym route.

---

## Freeze artifacts to collect (actionable checklist)

- [ ] `npx tsc -p tsconfig.json --noEmit` → save to `logs/tsc_latest.log`.
- [ ] `npm run build` → save to `logs/build_latest.log`.
- [ ] Screenshots: 5-widget rail; answers for 3 canonicals + BU list synonym.
- [ ] Router logs (`[ROUTE]` objects) pasted into `reports/STAGE_A_CHAT_AUDIT_YYYYMMDD/02_TEST_VERIFICATION.md`.
- [ ] Network payload request/response JSON saved to `reports/.../payloads/`.
- [ ] Update `STATUS.md` with freeze timestamp.

---

## Handoff ask to rolodexterGPT

1) Convert this summary into the Stage-A freeze PR (attach artifacts above).
2) Update docs:
   - Stage-A contract page with UI and routing rules.
   - Quick Start Smoke Test guide.
3) Prepare Stage-B plan:
   - Credential checklist; BQ adapter skeleton; error handling spec.
4) Propose 5–10 synonym routes that preserve Stage-A safety but broaden perceived capability.

End of reboot prompt.
