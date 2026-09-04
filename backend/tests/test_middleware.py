import asyncio
from typing import Any

from vercel.headers import get_headers

from app.middleware import VercelRequestHeadersMiddleware


def run(coroutine: Any) -> Any:
    return asyncio.run(coroutine)


def test_vercel_request_headers_are_available_to_sdk_context() -> None:
    seen: dict[str, str] = {}

    async def app(*_: Any) -> None:
        seen.update(get_headers() or {})

    async def receive() -> dict[str, Any]:
        return {"type": "http.request"}

    async def send(_: dict[str, Any]) -> None:
        return None

    run(
        VercelRequestHeadersMiddleware(app)(
            {"type": "http", "headers": [(b"x-vercel-oidc-token", b"runtime-token")]},
            receive,
            send,
        )
    )

    assert seen == {"x-vercel-oidc-token": "runtime-token"}
