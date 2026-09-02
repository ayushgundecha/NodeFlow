#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -x "$project_dir/backend/venv/bin/uvicorn" ]]; then
  echo "Backend environment missing. Follow the Local setup steps in README.md." >&2
  exit 1
fi

cleanup() {
  kill "$api_pid" "$web_pid" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

(
  cd "$project_dir/backend"
  venv/bin/uvicorn main:app --reload --port 8000
) &
api_pid=$!

(
  cd "$project_dir/frontend"
  npm run dev
) &
web_pid=$!

echo "NodeFlow frontend: http://localhost:3000"
echo "NodeFlow API:      http://127.0.0.1:8000/api/v1/health"

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 1
done

cleanup
status=0
wait "$api_pid" || status=$?
wait "$web_pid" || status=$?
exit "$status"
