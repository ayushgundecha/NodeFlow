# NodeFlow

NodeFlow is becoming a visual workflow studio where people can compose typed nodes, execute a real DAG, and inspect every input, output, log, duration, failure, and retry. The current implementation is in Phase 1: its production contracts and engineering foundation are complete while the original light canvas remains available.

## Local setup

Requirements: Node.js 22.12+ and Python 3.10+ (CI uses Node 24 and Python 3.13).

```bash
cd frontend
npm ci

cd ../backend
python -m venv venv
venv/bin/pip install -r requirements-dev.txt
```

Start both services with one command:

```bash
./scripts/dev.sh
```

The Vite app runs at `http://localhost:3000` and proxies API calls to FastAPI at `http://127.0.0.1:8000`.

Configuration is server-only and validated during startup. Copy `.env.example` values into your shell or deployment environment when changing defaults. A production process must set `NODEFLOW_ENV=production` and an explicit `NODEFLOW_CORS_ORIGINS` allowlist. No `VITE_` environment variable may contain a secret.

## Deployment

The root `vercel.json` uses Vercel Services to deploy the Vite frontend and FastAPI backend atomically on one domain. Set the Vercel project framework to **Services**; `/api/*` is routed to FastAPI and every other path to the SPA. Configure `NODEFLOW_CORS_ORIGINS` for Production and Preview in Vercel before deploying; Vercel environments are treated as production-safe by default. For an authenticated local production simulation, use `vercel dev`; use `vercel dev -L` without cloud authentication.

## Quality gates

```bash
cd frontend
npm run lint
npm run typecheck
npm run test -- --coverage
npm run build
npm audit --audit-level=high
```

```bash
cd backend
venv/bin/ruff check .
venv/bin/ruff format --check .
venv/bin/mypy
venv/bin/pytest --cov --cov-report=term-missing
venv/bin/python -m scripts.check_openapi
```

To intentionally update the shared API contract:

```bash
cd backend
venv/bin/python -m scripts.export_openapi

cd ../frontend
npm run contracts:generate
```

Generated frontend bundles are written to `backend/public/` for production serving and are intentionally ignored by Git.
