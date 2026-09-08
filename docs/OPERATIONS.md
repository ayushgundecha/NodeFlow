# Deployment and operations

## Deployment shape

The root `vercel.json` defines two Vercel Services: the Vite frontend and the FastAPI backend. `/api/*` goes to the Python service; other paths go to the SPA. Frontend response protections are defined in `frontend/vercel.json`; API/local static protections are applied by FastAPI middleware.

The linked project is **node-flow**, with repository root `.` and framework **Services**. The public alias is [node-flow-liard.vercel.app](https://node-flow-liard.vercel.app). Use the project on Vercel Hobby and a dedicated Groq free-tier project only.

## Required configuration

Set these separately in **Production** and **Preview**:

- `NODEFLOW_CORS_ORIGINS`: exact permitted origins, without paths, wildcards, credentials, or trailing slashes. Include the public production origin in Production and the intended preview origin in Preview.
- `NODEFLOW_RATE_LIMIT_SALT`: a private value containing at least 32 random characters. For example, generate a value locally with `openssl rand -hex 32`; store it as a Vercel secret.
- `GROQ_API_KEY`: a dedicated free-tier key for environments that must execute AI. An environment without the key deliberately returns a typed AI failure.
- Optional `NODEFLOW_AI_MODEL`: defaults to `openai/gpt-oss-20b`.

Vercel request-scoped OIDC supplies Sandbox authentication. Do not store copied OIDC tokens. Direct local FastAPI requires `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `VERCEL_TEAM_ID` instead.

Before promotion, confirm the account is still Hobby, provider keys remain free-tier, and no paid overages, top-ups, or fallback providers are enabled. Quota totals can change: verify the current [Vercel Hobby documentation](https://vercel.com/docs/plans/hobby) and the Groq project's Limits page. No specific external quota is guaranteed by this repository.

## Repeatable deployment

From a clean checkout of the intended source revision:

```bash
npm ci --prefix frontend
python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements-dev.txt
# Run the checks in README.md and docs/RELEASE.md first.
vercel deploy --prod --skip-domain --yes
```

`--skip-domain` prepares a Production-environment deployment without moving the public alias. Verify the returned deployment URL before promotion:

```bash
cd frontend
NODEFLOW_TEST_URL=https://YOUR-DEPLOYMENT.vercel.app \
NODEFLOW_PROVIDER_SMOKE=1 npx playwright test e2e/production.spec.ts
```

Deployment protection may require an owner-managed bypass or a browser authenticated to Vercel. Do not weaken production application checks to make a smoke test pass. Promote the verified artifact with `vercel promote <deployment-url>` only as part of an authorized release. Git commit/push and Dolt sync remain separate actions governed by the repository's conservative profile.

## Abuse controls

The application allows 20 workflow starts/hour and 20 HTTP executions/hour per anonymous visitor key, per process. Limits cannot guarantee a distributed budget. The limiter stores at most 10,000 client keys and refuses new clients while all tracked windows remain active.

The Phase 5 release prepares this edge rule:

```bash
vercel firewall rules add 'NodeFlow public run burst limit' \
  --condition '{"type":"path","op":"eq","value":"/api/v1/runs"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action rate_limit --rate-limit-window 60 --rate-limit-requests 20 \
  --rate-limit-keys ip --rate-limit-action rate_limit --yes
vercel firewall diff
```

The rule is a 20-starts/minute/IP burst guard. Review the draft before `vercel firewall publish`; publishing applies **all** draft changes. Avoid creating duplicates: inspect `vercel firewall rules ls` first. The aggregated `firewall overview` command may fail on Hobby because it also queries paid-only IP Bypass; direct rule listing remains available. Never upgrade to fix that inspection error.

Use only included [Vercel rate-limiting capabilities](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting). Leave automatic platform DDoS protection enabled. Check plan-specific capabilities before modifying billing-related settings.

## Limits enforced by this code

| Resource | Bound |
| --- | --- |
| API request body | 512 KiB |
| JSON value | 256 KiB, 20 levels deep |
| Graph | 25 nodes, 40 edges |
| Scheduling | 4 concurrent nodes; 30-second run deadline |
| JavaScript | 10 KiB source; 3-second process timeout; 64 KiB output; 32 KiB logs |
| Sandbox | Fresh disposable VM; deny-all network; empty injected environment |
| HTTP | HTTPS; 8-second operation timeout; 3 redirects; 1 MiB response; one status retry |
| AI | 4,000-character rendered prompt; 512 output tokens; 8,192-character result |
| Browser retention | Latest 10 terminal traces |
| JSON display | 20,000-character preview |

Three-second execution is a process timeout, not a promise of three CPU-seconds or end-to-end provider latency. Sandbox startup and teardown add overhead. Actual provider allowances may be reached sooner than application limits.

## Observability and recovery

Application runtime records contain correlation ID, generated run ID, node type, status, duration, serialized byte count, and safe error code. They omit payload bodies, source, prompts, keys, raw IP addresses, and anonymous client hashes. Access logs and platform logs follow their own retention settings.

```bash
vercel logs <deployment-url> --level error --since 1h
vercel inspect <deployment-url>
vercel firewall rules ls
```

Use Vercel's Functions/Observability views to inspect errors, invocation volume, and duration. Use Groq's Limits dashboard for remaining provider allowance. NodeFlow does not ship a separate monitoring service, alerts backend, or paid log drain.

| Signal | Recovery |
| --- | --- |
| `workflow_rate_limited` / `http_rate_limited` | Wait for the applicable window; inspect unusual volume before changing limits |
| Groq quota or unavailable error | Check free-tier allowance and credential validity; retry after reset |
| `sandbox_unavailable` | Check project OIDC and Sandbox entitlement/allowance; use Data Quality Gate while unavailable |
| HTTP timeout / blocked destination | Inspect the URL and destination; keep SSRF checks enabled |
| Increasing failures after a release | Inspect safe metadata, reproduce locally, then roll back to the previous verified deployment |

To disable AI during an incident, remove/revoke its dedicated key and redeploy; the adapter fails visibly. To stop **all new runs**, stage a firewall deny rule for `POST /api/v1/runs`, inspect the draft, and publish through the owner-approved incident process. Keep the read-only studio available where possible. Do not run destructive failure probes or rotate working credentials merely to demonstrate a procedure.

## Rollback

Record the previous ready deployment URL before promoting. Restore it using:

```bash
vercel rollback <previous-ready-deployment-url>
```

Then check health, SPA refresh, and one deterministic run. Rollback changes the served deployment; browser drafts remain on the visitor's device. Schema migration compatibility must be reviewed separately. This procedure is documented; it is not claimed as a destructive production rollback drill.
