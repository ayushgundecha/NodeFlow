# Security and privacy review

NodeFlow accepts untrusted graphs, code, URLs, prompts, and data through a public API. This review describes implemented controls and reproducible evidence. It is an engineering audit, not an external penetration-test certification.

## Evidence matrix

Run backend checks with `cd backend && venv/bin/pytest`. Run browser checks with `cd frontend && npm run test:e2e`.

| Boundary / failure | Implemented control | Evidence |
| --- | --- | --- |
| Malformed or oversized requests | 512 KB API body cap; typed JSON and graph validation | `tests/test_api.py`, `tests/test_workflow_validation.py`, `tests/test_contracts.py` |
| Cycles, invalid handles, graph abuse | Stable graph validation; 25 nodes / 40 edges | `tests/test_graph_properties.py`, `tests/test_workflow_validation.py` |
| Arbitrary JavaScript | Fresh microVM, deny-all egress, empty injected env; no execution on API host | `tests/test_sandbox_javascript.py`; Phase 4 live probes recorded in Beads gate `NodeFlow-zen.4.8` |
| Script hangs and huge output | Three-second execution timeout, bounded source/output/logs, teardown on cancellation/failure | `tests/test_sandbox_javascript.py` |
| SSRF and redirect abuse | HTTPS, reject non-public DNS answers, credential/header filtering, redirect revalidation | `tests/test_http_request.py` |
| DNS rebinding | Connect to the validated IP, retaining original Host and TLS SNI; no second hostname resolution | IPv4/IPv6 transport regression in `tests/test_http_request.py` |
| Slow or oversized HTTP response | Read timeout, response byte cap, limited redirects/retries, safe errors | `tests/test_http_request.py` |
| Provider outage / AI quota | Bounded Groq requests, safe typed errors, no mock or paid fallback | `tests/test_groq.py` |
| Prompt injection | Model is text-only, has no tools or secrets in its context; output is displayed as text | Adapter review and `tests/test_groq.py`; output correctness still requires human review |
| Log/secret leakage | Metadata-only operational logging; bounded public error messages | `tests/test_observability.py`, provider error tests |
| CORS and configuration | Explicit origins and production salt validation | `tests/test_config.py`, `tests/test_api.py` |
| Browser framing / script loading | CSP, nosniff, frame denial, referrer and permissions policies | `tests/test_release_security.py`; deployed headers checked separately |
| Rate-limiter memory exhaustion | Maximum 10,000 tracked keys; expired-key reclamation; fail closed when full | `tests/test_release_security.py` |
| Malformed / inconsistent SSE | Typed payload checks, sequence/run ownership checks, response-reader cancellation | `src/features/runtime/runEventStream.test.ts` |
| Stop, disconnection, offline | Abort and scheduler cancellation; partial runs do not become successful traces | `tests/test_scheduler.py`, browser stop/offline journeys |
| Damaged or unavailable browser storage | Safe draft recovery; validated retained traces; live-only fallback | persistence/history unit tests and browser recovery journeys |
| Dependency advisories | npm and pip-audit checks; no unresolved advisories at the recorded audit | `docs/RELEASE.md`, CI |

The DNS pinning fix follows the [HTTPX SNI extension contract](https://www.python-httpx.org/advanced/extensions/#sni_hostname). A redirected request is validated and pinned again. The transport currently chooses the first validated address; it does not attempt alternate IPs if that address fails.

## What is retained and transmitted

| Data | Location / recipient | Lifetime |
| --- | --- | --- |
| Editable workflow | Visitor localStorage | Until replaced, exported/deleted by the visitor, or browser storage is cleared |
| Corrupt draft backup | Visitor localStorage | Preserved for recovery; clearing site data removes it |
| Terminal run traces | Visitor IndexedDB | Latest ten; **Runs → Clear** deletes them |
| In-flight workflow and values | FastAPI process | Run processing; no application workflow database |
| JavaScript source and input | Vercel Sandbox | Disposable sandbox; provider/platform policies also apply |
| HTTP request | Chosen public endpoint | Recipient's policy applies |
| AI system prompt and context | Groq | Provider policy applies; do not send sensitive data |
| Runtime logs | Deployment log system | Owner-configured/platform retention; metadata only in application log records |

Exported workflows and downloaded debugger previews contain user-authored data. NodeFlow cannot recognize every secret a visitor manually pastes into a field. “Server-only secrets” means the application does not intentionally serialize its provider credentials into frontend bundles, outputs, or traces.

## Residual boundaries

- Application rate counters are per process, not distributed. Cold starts and multiple instances reset or split them. The staged edge rule is a burst guard, not a global provider budget.
- CORS restricts browser reads; it does not authenticate clients or prevent direct API calls. The public API intentionally has no login.
- Sandbox isolation protects the API host. User code can inspect its own disposable VM; NodeFlow does not offer a custom JavaScript capability language.
- Model instructions reduce unwanted output but cannot guarantee factuality or prompt-injection resistance. Generated text must be reviewed.
- HTTP timeouts apply to individual network operations; the scheduler's 30-second deadline bounds the complete run. Repeated public requests can still consume destination and provider allowance.
- Browser history is not encrypted application storage. Anyone with access to that browser profile can inspect it.
- Automated accessibility checks cover known rules and tested journeys; they do not replace a screen-reader usability audit.

Production release remains subject to the explicit final review gate. See [release evidence and open gates](RELEASE.md) and [operations](OPERATIONS.md).
