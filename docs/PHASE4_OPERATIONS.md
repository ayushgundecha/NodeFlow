# Phase 4 production safety

NodeFlow is a public demo, so execution is intentionally bounded. Limits are enforced by the FastAPI service even when platform controls are unavailable.

| Boundary | Limit |
| --- | --- |
| API request | 512 KB |
| JSON value | 256 KB and 20 levels deep |
| Workflow graph | 25 nodes and 40 edges |
| Scheduler | 4 concurrent nodes and 30 seconds per run |
| Visitor workflow runs | 20 per hour |
| JavaScript | 5 runs/hour, 10 KB source, 3 seconds CPU, 64 KB output, 32 KB logs, no network |
| HTTP | 20 runs/hour, HTTPS only, 8 seconds, 3 redirects, 1 MB response |
| AI | 5 runs/hour, 4,000-character prompt, 512 output tokens, 8,192-character result |
| Browser history | Latest 10 terminal traces, stored locally in IndexedDB |

Application rate limits are a best-effort per-instance guard. Production must add a Vercel Firewall rule for `POST /api/v1/runs`; counters are regional, so the application checks remain required.

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

## Zero-spend and quota alerts

- Deploy on Vercel Hobby and use only included platform quotas. Do not upgrade the plan or enable paid overages.
- Use a dedicated free-tier Groq project with `openai/gpt-oss-20b`. Do not add a payment method, enable paid fallback, or use a paid provider key.
- Monitor `workflow_rate_limited`, `sandbox_rate_limited`, `http_rate_limited`, `ai_rate_limited`, provider quota errors, function duration, and Firewall action counts.
- Free-quota exhaustion must remain a visible typed failure in the debugger; it must never fall back to fabricated output or a paid provider.
