"""Small ASGI safety middleware for bounded public requests."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from vercel.headers import HeadersContext, headers_from_asgi_scope

MAX_API_REQUEST_BYTES = 512 * 1024


class RequestTooLargeError(Exception):
    pass


class VercelRequestHeadersMiddleware:
    """Expose Vercel's request-scoped OIDC token to its Python SDK.

    Vercel delivers ``x-vercel-oidc-token`` to Functions as a request header,
    rather than a long-lived process environment variable. The SDK reads that
    header from a ContextVar, which must be scoped to the full ASGI request.
    """

    def __init__(self, app: Callable[..., Awaitable[None]]) -> None:
        self.app = app

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        with HeadersContext(headers_from_asgi_scope(scope)).use():
            await self.app(scope, receive, send)


class ApiRequestSizeLimitMiddleware:
    def __init__(self, app: Callable[..., Awaitable[None]]) -> None:
        self.app = app

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        if scope.get("type") != "http" or not str(scope.get("path", "")).startswith("/api/"):
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", ()))
        content_length = headers.get(b"content-length", b"0")
        try:
            if int(content_length) > MAX_API_REQUEST_BYTES:
                await self._reject(send)
                return
        except ValueError:
            await self._reject(send)
            return

        received = 0

        async def bounded_receive() -> dict[str, Any]:
            nonlocal received
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body", b""))
                if received > MAX_API_REQUEST_BYTES:
                    raise RequestTooLargeError
            return message

        try:
            await self.app(scope, bounded_receive, send)
        except RequestTooLargeError:
            await self._reject(send)

    @staticmethod
    async def _reject(send: Callable[[dict[str, Any]], Awaitable[None]]) -> None:
        body = b'{"detail":"API request exceeds the 512 KB limit."}'
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
