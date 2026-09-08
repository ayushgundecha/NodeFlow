# NodeFlow: making visual workflows explainable

## Problem

Visual builders can make a workflow easy to draw while leaving execution opaque. When a result is wrong, a developer needs more than green nodes: the exact values, branch decisions, timings, and failure that produced it.

## Product

NodeFlow is a public visual workflow debugger. A visitor edits typed nodes, runs a real FastAPI DAG, inspects ordered server events, fixes a failure, and replays or compares retained traces. It uses browser-local drafts and history so the first visit does not require an account.

[Open the studio](https://node-flow-liard.vercel.app) · [Watch the real walkthrough](media/walkthrough.mp4)

## Engineering decisions

**Separate editing from execution.** React and TypeScript own the graph editor. FastAPI owns validated execution. Pydantic/OpenAPI-generated frontend types make the boundary explicit and detect contract drift in CI.

**Make the trace authoritative.** The canvas follows ordered SSE events rather than timers. A failed, skipped, or disconnected step remains distinguishable from successful work. Replay reads recorded events and makes no provider calls.

**Treat untrusted work as a first-class constraint.** JavaScript runs in a fresh air-gapped Vercel Sandbox. HTTP destinations are validated and pinned to public IP addresses. AI is bounded text generation with a server-only Groq key and no tools or paid fallback.

**Keep the scope demonstrable.** Ten node types, three meaningful templates, a 25-node graph limit, four concurrent ready nodes, and a 30-second deadline make the public demo tractable without claiming production-scale orchestration.

## What the release audit improved

The full browser and security review found issues that unit happy paths had missed: a DNS-rebinding window, undo history polluted by node measurements, nested interactive controls, low contrast in skipped nodes, incomplete keyboard tab navigation, storage-denied startup, weak typed SSE payload checks, and damaged trace handling. The fixes include targeted regression coverage and real browser journeys.

## Measured evidence

The local production build reached Lighthouse **100 Performance / 96 Accessibility**, with CLS approximately **0.00009**. Ten sampled editor clicks reached two animation frames in **29.3–44.6 ms** on the recorded local setup. That is an interaction-feedback proxy, not field INP or a hardware-independent latency promise.

A development-mode React profile recorded a worst canvas render of **6.3 ms** in the sampled six-node editing sequence; its first click measured 111.6 ms with development overhead. This is not a per-node rerender-isolation claim. A separate browser journey executes the maximum 25-node graph and edits it afterward.

See [the release report](RELEASE.md) for test counts, browser/OS conditions, reproducible commands, and the pending deployment/review gates. These measurements are local laboratory evidence, not production traffic statistics.

## Suggested portfolio copy

> Built NodeFlow, a React/TypeScript and FastAPI visual workflow debugger with ten typed node kinds, bounded concurrent DAG execution, live SSE traces, and browser-local replay and run comparison. Isolated user JavaScript in Vercel Sandbox and hardened outbound HTTP with public-IP validation and DNS pinning.

## Suggested resume bullets

- Built a visual workflow debugger with React, TypeScript, and FastAPI, supporting ten typed nodes, three executable templates, streamed node-level traces, and local replay/comparison.
- Implemented bounded DAG execution with four concurrent ready nodes, schema-generated API contracts, isolated JavaScript execution, and public HTTPS requests protected against DNS rebinding.
- Added real-browser workflow, accessibility, and visual-regression coverage; measured 100 Lighthouse Performance and 96 Accessibility on a local production build under documented conditions.

Do not claim production adoption, global rate limiting, guaranteed AI correctness, a formal security certification, or a completed launch approval. Those claims are not established by this work.
