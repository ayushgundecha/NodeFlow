# Phase 5 release evidence

**Audit date:** 2026-09-08. **Decision:** local implementation and source-isolation checks pass; publishing the updated deployment and the final human acceptance remain pending.

Verification preceded the local release commit. An independent source snapshot was installed and tested under `/tmp/nodeflow-release-audit`. This verifies fresh installation without relying on the working tree's dependencies; it is not presented as a clean checkout of a new published commit.

## Verified results

| Check | Result | Reproduce / evidence |
| --- | --- | --- |
| Frontend lint and strict types | Pass | `npm run lint` and `npm run typecheck` in `frontend/` |
| Frontend unit/component tests | **77 passed** across 19 files | `npm run test -- --coverage` |
| Frontend coverage | **75.66% lines**, 68.03% statements, 59.44% branches | Vitest V8 report; exercised-source scope, not total application coverage |
| Production build | Pass | `npm run build`; JS 384.87 kB / 120.34 kB gzip, CSS 93.77 kB / 15.34 kB gzip |
| Backend lint, format, strict types | Pass | Ruff check/format check and mypy |
| Backend tests | **126 passed** | `venv/bin/pytest --cov --cov-report=term-missing` |
| Backend coverage | **89% combined statement/branch coverage** | Coverage.py, `source = app`, branch coverage enabled |
| Contract drift | Pass | Backend OpenAPI check; generated frontend contract byte-matches the source contract |
| Local browser suite | **15 passed**, 3 provider tests deliberately skipped | `npm run test:e2e`; real compiled frontend and FastAPI |
| Existing production provider smoke | **3 passed** | Incident Response Demo, GitHub Release Digest, Data Quality Gate; explicit production smoke command below |
| Real DNS-pinned HTTPS request | **HTTP 200** | New transport called public GitHub, retained original hostname; 2,479 response bytes in this sample |
| Dependency audit | **0 known npm or Python production vulnerabilities** | [Audit summary](evidence/dependency-audit.json); `npm audit`, `pip-audit -r requirements.txt` |
| Local desktop Lighthouse | **100 Performance / 96 Accessibility** | [Recorded settings and results](evidence/lighthouse-local.json) |
| Local CLS | **0.0000908** | Lighthouse sample, below 0.1 target |
| Sampled production editor feedback | **29.3–44.6 ms** | [Ten click-to-two-animation-frame samples](evidence/editor-production.json) |
| Sampled React canvas render | **6.3 ms worst** | [Development profile](evidence/editor-profile.json), six-node editing sequence |
| Demo media | **62.32 seconds** | [MP4](media/walkthrough.mp4), [GIF excerpt](media/demo.gif), [studio](media/studio.png), [debugger](media/debugger.png) |

Numbers are local measurements or explicitly identified live checks. They are not guarantees for other hardware, networks, provider load, or production traffic. The old live deployment's successful smoke tests do **not** certify that the new Phase 5 changes have been deployed.

## Browser coverage

The Playwright suite exercises first visit, template replacement, real deterministic execution, changed branch outcome, node output inspection, runtime failure and repair, replay, comparison, history deletion, refresh persistence, import/export, malformed import, storage denial/corruption, offline retry, stop and rerun, keyboard graph connection, duplicate/undo, tab navigation, and a maximum 25-node graph.

Axe checks WCAG 2 A/AA and WCAG 2.1 AA rules at **375, 768, 1024, and 1440 pixels**, plus a completed debugger/inspector view. There were no violations in those checks. Eight saved screenshots cover the four initial layouts and real running/queued, stopped, completed/skipped, and failed states. Time-dependent text is masked in execution snapshots; node and run states are genuine backend output.

Visual baselines are macOS/Chromium-specific. The browser CI job uses `macos-14`; Linux/Windows need separately reviewed baselines. CI configuration has been updated but has not run on GitHub for these unpushed changes. Desktop editing starts above 900 pixels; compact layouts are intentional workflow viewers. Manual screen-reader testing and additional browser engines are not claimed.

### Reproduce browser checks

```bash
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e
```

For an intentional visual change, review screenshot diffs first, then use `npm run test:e2e:update`. Never regenerate baselines merely to conceal a regression.

For real provider verification after an authorized deployment:

```bash
cd frontend
NODEFLOW_TEST_URL=https://node-flow-liard.vercel.app \
NODEFLOW_PROVIDER_SMOKE=1 npx playwright test e2e/production.spec.ts
```

These three tests consume real included Sandbox/Groq allowance. The normal local suite provides empty provider credentials and does not replace unavailable providers with successful fake results.

## Measurement conditions

Fresh-source verification used **Node 22.23.2**, **Python 3.13.1**, macOS ARM64, Chromium **153.0.8010.12**, and Playwright's locked browser revision. The initial working-tree checks used Node 24.5.0; the fresh install separately exercised the supported Node 22 line. Read the committed lockfile for exact test package versions.

Lighthouse used the desktop preset against the locally served production build. Its version, browser, throttling, viewport, and CPU benchmark are recorded in the JSON evidence. LCP was approximately 619 ms and total blocking time was 0 ms in that sample. The React profile was taken in development mode with StrictMode; it is separate from the production feedback measurement. Its first click took 111.6 ms, while subsequent samples were below 33 ms. No field INP or per-node rerender-isolation claim is made.

Reproduce profiling with the local app running:

```bash
# Development build on port 3011 for React Profiler data
npm run dev --prefix frontend -- --port 3011
# In another terminal, from the repository root
node frontend/scripts/profile-editor.mjs
# Or measure the compiled app served at port 8011
NODEFLOW_PROFILE_URL=http://127.0.0.1:8011 node frontend/scripts/profile-editor.mjs
```

Run Lighthouse as a standalone development tool against the production build, with the desktop preset and the installed Chromium executable. It is intentionally absent from the application's dependency tree: tested Lighthouse dependency trees introduced advisories into the project. The isolated audit tool was used only against local NodeFlow with an already installed browser, without downloading or extracting untrusted browser archives. The version used is recorded with the results.

The demo can be recorded again with `node frontend/scripts/record-demo.mjs` while the compiled app runs at `http://127.0.0.1:8011`. It writes a raw WebM and screenshots; the checked-in MP4/GIF are compressed derivatives. All displayed workflow execution in the recording is real.

## Deployment status and the approval boundary

The existing production deployment inspected during this audit is:

- Project: **node-flow**, Vercel Services, repository root `.`.
- Public URL: [node-flow-liard.vercel.app](https://node-flow-liard.vercel.app).
- Deployment ID: `dpl_Cx33ibmmfFeZU58BvJxAn2WKtDZj`, ready, created 2026-09-05 UTC.
- Production Groq key and Production/Preview rate-limit salt are configured. Preview has no Groq key and therefore cannot be claimed to pass AI execution.
- One firewall change is staged: **NodeFlow public run burst limit**, 20 `POST /api/v1/runs` requests per minute per IP. It is **not published**.

Automatic approval review rejected this command:

```bash
vercel deploy --prod --skip-domain --yes
```

The stated reason was that uploading repository source/configuration to this production Vercel project lacked sufficiently explicit user authorization. No new deployment was created and the rejection was not bypassed. The next release step requires the user to authorize deployment to the existing `node-flow` project, verification of that artifact, promotion to its public alias, and publication of the reviewed firewall rule. No plan upgrade or payment is required or authorized.

After that approval, verify the new production artifact's three templates, health, CORS/response headers, SPA refresh, provider-error behavior, and deployed Lighthouse. Only then present the final live-product review. Beads `NodeFlow-zen.5.7` requires explicit user acceptance for portfolio launch; the Phase 5/root epics remain open until that review.

## Documented follow-up

Bead **NodeFlow-aou (P3)** tracks Python transitive dependency locking and upstream TestClient/AnyIO deprecation warnings observed in the fresh installation. All 126 backend tests passed despite the warnings; the production dependency audit has no known advisory. Broader product boundaries—process-local counters, browser-only retention, provider quotas, desktop editing, and no durable run resume—are documented in [Security](SECURITY.md) and [Operations](OPERATIONS.md).

The user authorized a local Git commit after reviewing this audit. Git push, deployment, and Dolt remote sync remain pending separate authorization under the repository's conservative profile.

## Beads handoff

| Bead | State at handoff |
| --- | --- |
| `NodeFlow-zen.5.1` | Closed: browser, responsive, accessibility and visual coverage |
| `NodeFlow-zen.5.2` | Closed: security audit and regression fixes |
| `NodeFlow-zen.5.3` | Local performance evidence complete; deployed check pending |
| `NodeFlow-zen.5.4` | Deployment approval required; firewall draft staged only |
| `NodeFlow-zen.5.5` | README/media/case study complete; closure waits on deployment dependency |
| `NodeFlow-zen.5.6` | Fresh-source checks complete; new live-product audit pending |
| `NodeFlow-zen.5.7` | Open: explicit final user review |
| `NodeFlow-aou` | Open P3 follow-up: upstream tooling and Python dependency locking |
