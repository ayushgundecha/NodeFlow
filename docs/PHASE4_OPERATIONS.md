# Phase 4 production safety

NodeFlow is a public demo, so execution is intentionally bounded. Limits are enforced by the FastAPI service even when platform controls are unavailable.

| Boundary | Limit |
| --- | --- |
| API request | 512 KB |
| JSON value | 256 KB and 20 levels deep |
| Workflow graph | 25 nodes and 40 edges |
| Scheduler | 4 concurrent nodes and 30 seconds per run |
| Visitor workflow runs | 20 per hour |
| JavaScript | 10 KB source, 3 seconds CPU, 64 KB output, 32 KB logs, no network; Vercel Sandbox Hobby allowance applies |
| HTTP | 20 runs/hour, HTTPS only, 8 seconds, 3 redirects, 1 MB response |
| AI | 4,000-character prompt, 512 output tokens, 8,192-character result; Groq free-tier allowance applies |
| Browser history | Latest 10 terminal traces, stored locally in IndexedDB |

Application rate limits are a best-effort per-instance guard. Production must add a Vercel Firewall rule for `POST /api/v1/runs`; counters are regional, so the application checks remain required.

## Upstream free-tier boundaries

NodeFlow does not impose a separate visitor cap on JavaScript or AI nodes. For
the current personal-project configuration, those executions end only when the
relevant provider returns a quota error:

- **Vercel Sandbox Hobby:** 5,000 sandbox creations and 5 active CPU-hours per
  month. Each JavaScript node creates one fresh sandbox, so the 5,000-creation
  limit is the useful upper bound unless active CPU usage is exhausted first.
- **Groq Free / `openai/gpt-oss-20b`:** 30 requests per minute, 1,000 requests
  per day, 8,000 tokens per minute, and 200,000 tokens per day. These limits
  reset on the provider's windows; they are not a monthly credit.

Provider plans and quotas can change. Check the Vercel usage dashboard and the
Groq project Limits page before relying on a particular allowance.

## Staged Vercel Firewall rollout

After linking the project, stage a generous observation-only rule first:

```bash
vercel firewall rules add "Observe NodeFlow run volume" \
  --condition '{"type":"path","op":"eq","value":"/api/v1/runs"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action rate_limit \
  --rate-limit-window 3600 \
  --rate-limit-requests 100 \
  --rate-limit-keys ip \
  --rate-limit-action log \
  --yes
vercel firewall diff
```

Do not publish automatically. Review matched traffic in the Vercel Firewall dashboard, test enforcement in Preview, then let the project owner publish and tighten the rule. Vercel's automatic DDoS mitigation should remain enabled.

## Privacy-safe observability

Runtime logs contain only request correlation ID, generated run ID, node type, status, duration, serialized byte count, and a safe error code. They never contain workflow inputs, prompts, JavaScript source, HTTP bodies, outputs, authorization values, raw IP addresses, or the anonymous rate-limit hash.

No third-party client analytics are currently installed. If product analytics are added, the approved event vocabulary is limited to anonymous counts of run started/completed/failed, debugger view opened, and template selected. Payload content and persistent visitor tracking are prohibited.

Keep runtime-log retention at the shortest interval that supports debugging. For an incident: inspect aggregate error codes and provider timing, disable the affected integration if cost is rising, preserve no payload content, and rotate any credential suspected of exposure.

## Sandbox credential modes

JavaScript runs only in a fresh Vercel Sandbox with deny-all networking and an empty environment. Vercel deployment and `vercel dev` provide short-lived Sandbox OIDC automatically. A direct local FastAPI process instead requires all three server-only settings: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `VERCEL_TEAM_ID`.

Do not put a copied OIDC token in a persistent local environment file; it can override the short-lived token injected by `vercel dev`. Missing, invalid, or unavailable Sandbox credentials are shown as the recoverable `sandbox_unavailable` node error.

## Verification contract

The automated suite verifies deny-all Sandbox creation, empty injected environment, source/output/log caps, timeout, cancellation cleanup, and safe provider-error mapping. The end-to-end check uses `vercel dev` with the project’s server-only Groq configuration and runs:

- Alert Brief: manual input → transform → isolated JavaScript → condition → Groq → output.
- GitHub Release Digest: public GitHub HTTPS request → bounded transform → Groq → output.
- Data Quality Gate: deterministic true/false branch selection, inactive branch skip, merge, and output.

Provider-free or unavailable paths must remain visible as typed node failures; never replace them with generated sample output.

## Zero-spend and quota alerts

- Deploy on Vercel Hobby and use only included platform quotas. Do not upgrade the plan or enable paid overages.
- Use a dedicated free-tier Groq project with `openai/gpt-oss-20b`. Do not add a payment method, enable paid fallback, or use a paid provider key.
- Monitor `workflow_rate_limited`, `http_rate_limited`, provider quota errors, function duration, and Firewall action counts.
- Free-quota exhaustion must remain a visible typed failure in the debugger; it must never fall back to fabricated output or a paid provider.
