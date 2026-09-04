"""Hardened outbound HTTP execution for public, credential-free workflows."""

from __future__ import annotations

import asyncio
import ipaddress
import json
import socket
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import quote, urljoin, urlsplit, urlunsplit

import httpx
from pydantic import TypeAdapter, ValidationError

from ..models.base import JsonValue
from ..models.workflow import HttpRequestNode, WorkflowNode
from .deterministic_adapters import AdapterExecutionError
from .rate_limits import SlidingWindowRateLimiter
from .scheduler import NodeExecutionContext, NodeExecutionResult

REQUEST_TIMEOUT_SECONDS = 8.0
MAX_RESPONSE_BYTES = 1024 * 1024
MAX_REDIRECTS = 3
MAX_HEADERS = 16
MAX_HEADER_VALUE_BYTES = 1024
HTTP_EXECUTIONS_PER_HOUR = 20
HTTP_RATE_LIMITER = SlidingWindowRateLimiter(HTTP_EXECUTIONS_PER_HOUR, 60 * 60)
RETRYABLE_STATUSES = frozenset({429, 500, 502, 503, 504})
REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
SAFE_REQUEST_HEADERS = frozenset({"accept", "content-type", "if-none-match", "user-agent"})
JSON_ADAPTER: TypeAdapter[JsonValue] = TypeAdapter(JsonValue)


@dataclass(frozen=True, slots=True)
class PublicDestination:
    url: str
    hostname: str
    port: int
    addresses: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class BoundedHttpResponse:
    status_code: int
    headers: Mapping[str, str]
    content: bytes
    url: str


class DestinationResolver(Protocol):
    async def resolve(self, hostname: str, port: int) -> tuple[str, ...]: ...


class HttpTransport(Protocol):
    async def request(
        self,
        method: str,
        destination: PublicDestination,
        *,
        headers: Mapping[str, str],
        body: JsonValue,
    ) -> BoundedHttpResponse: ...


class SystemDestinationResolver:
    async def resolve(self, hostname: str, port: int) -> tuple[str, ...]:
        def lookup() -> tuple[str, ...]:
            records = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
            return tuple(sorted({str(record[4][0]) for record in records}))

        try:
            return await asyncio.to_thread(lookup)
        except socket.gaierror as error:
            raise AdapterExecutionError(
                "http_dns_failed", "The HTTP destination could not be resolved."
            ) from error


def _is_public_address(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).is_global
    except ValueError:
        return False


async def validate_public_destination(url: str, resolver: DestinationResolver) -> PublicDestination:
    try:
        parsed = urlsplit(url)
        port = parsed.port or 443
    except ValueError as error:
        raise AdapterExecutionError("http_url_invalid", "The HTTP URL is invalid.") from error

    hostname = parsed.hostname
    if parsed.scheme.lower() != "https":
        raise AdapterExecutionError("http_scheme_blocked", "HTTP requests must use HTTPS.")
    if not hostname:
        raise AdapterExecutionError("http_url_invalid", "The HTTP URL requires a hostname.")
    if parsed.username or parsed.password:
        raise AdapterExecutionError(
            "http_credentials_blocked", "Credentials are not allowed in HTTP URLs."
        )
    if parsed.fragment:
        parsed = parsed._replace(fragment="")
        url = urlunsplit(parsed)

    addresses = await resolver.resolve(hostname, port)
    if not addresses or any(not _is_public_address(address) for address in addresses):
        raise AdapterExecutionError(
            "http_destination_blocked",
            "The HTTP destination must resolve only to public internet addresses.",
        )
    return PublicDestination(
        url=url,
        hostname=hostname,
        port=port,
        addresses=addresses,
    )


def _safe_headers(headers: Mapping[str, str]) -> dict[str, str]:
    if len(headers) > MAX_HEADERS:
        raise AdapterExecutionError(
            "http_headers_invalid", f"HTTP requests allow at most {MAX_HEADERS} headers."
        )
    safe: dict[str, str] = {}
    for name, value in headers.items():
        normalized = name.strip().lower()
        if normalized not in SAFE_REQUEST_HEADERS:
            raise AdapterExecutionError(
                "http_header_blocked", f"HTTP header {name!r} is not allowed."
            )
        if "\r" in name or "\n" in name or "\r" in value or "\n" in value:
            raise AdapterExecutionError(
                "http_headers_invalid", "HTTP headers may not contain line breaks."
            )
        if len(value.encode("utf-8")) > MAX_HEADER_VALUE_BYTES:
            raise AdapterExecutionError(
                "http_headers_invalid", "An HTTP header value exceeds the 1 KB limit."
            )
        safe[normalized] = value
    return safe


def _lookup(value: JsonValue, path: str) -> JsonValue:
    current = value
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            raise AdapterExecutionError(
                "http_template_invalid", f"URL value {path!r} is not available."
            )
    return current


def render_url(template: str, incoming: JsonValue) -> str:
    """Render only explicit ``{{ input.path }}`` placeholders into URL components."""

    import re

    pattern = re.compile(r"{{\s*input\.([A-Za-z0-9_.]+)\s*}}")

    def replace(match: re.Match[str]) -> str:
        value = _lookup(incoming, match.group(1))
        if isinstance(value, (dict, list)):
            rendered = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        elif value is None:
            rendered = ""
        else:
            rendered = str(value)
        return quote(rendered, safe="")

    rendered = pattern.sub(replace, template)
    if "{{" in rendered or "}}" in rendered:
        raise AdapterExecutionError(
            "http_template_invalid", "URL templates must use {{ input.path }} placeholders."
        )
    return rendered


class HttpxTransport:
    """Small HTTPX boundary with no proxies, cookies, redirects, or unbounded reads."""

    def __init__(self, client_factory: Callable[[], httpx.AsyncClient] | None = None) -> None:
        self._client_factory = client_factory or self._create_client

    @staticmethod
    def _create_client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(REQUEST_TIMEOUT_SECONDS),
            limits=httpx.Limits(max_connections=4, max_keepalive_connections=0),
            trust_env=False,
        )

    async def request(
        self,
        method: str,
        destination: PublicDestination,
        *,
        headers: Mapping[str, str],
        body: JsonValue,
    ) -> BoundedHttpResponse:
        response_data: BoundedHttpResponse | None = None
        response_too_large = False
        try:
            async with (
                self._client_factory() as client,
                client.stream(
                    method,
                    destination.url,
                    headers=dict(headers),
                    json=body if method == "POST" else None,
                ) as response,
            ):
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_RESPONSE_BYTES:
                        response_too_large = True
                        break
                if not response_too_large:
                    response_data = BoundedHttpResponse(
                        status_code=response.status_code,
                        headers=dict(response.headers),
                        content=bytes(content),
                        url=str(response.url),
                    )
        except AdapterExecutionError:
            raise
        except httpx.TimeoutException as error:
            raise AdapterExecutionError(
                "http_timeout", "The HTTP request exceeded the eight-second timeout."
            ) from error
        except httpx.RequestError as error:
            raise AdapterExecutionError(
                "http_request_failed", "The public HTTP request could not be completed."
            ) from error
        if response_too_large:
            raise AdapterExecutionError(
                "http_response_too_large", "The HTTP response exceeds the 1 MB limit."
            )
        assert response_data is not None
        return response_data


def _response_body(response: BoundedHttpResponse) -> JsonValue:
    content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type == "application/json" or content_type.endswith("+json"):
        try:
            return JSON_ADAPTER.validate_python(json.loads(response.content))
        except (UnicodeDecodeError, json.JSONDecodeError, ValidationError) as error:
            raise AdapterExecutionError(
                "http_response_invalid", "The endpoint returned invalid JSON."
            ) from error
    if content_type.startswith("text/"):
        return response.content.decode("utf-8", errors="replace")
    raise AdapterExecutionError(
        "http_content_type_blocked", "The endpoint must return JSON or UTF-8 text."
    )


class HttpRequestAdapter:
    def __init__(
        self,
        *,
        resolver: DestinationResolver | None = None,
        transport: HttpTransport | None = None,
        limiter: SlidingWindowRateLimiter | None = None,
    ) -> None:
        self._resolver = resolver or SystemDestinationResolver()
        self._transport = transport or HttpxTransport()
        self._limiter = limiter or HTTP_RATE_LIMITER

    async def _request_once(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: JsonValue,
    ) -> BoundedHttpResponse:
        redirects = 0
        current_method = method
        current_url = url
        current_body = body
        while True:
            destination = await validate_public_destination(current_url, self._resolver)
            response = await self._transport.request(
                current_method, destination, headers=headers, body=current_body
            )
            if response.status_code not in REDIRECT_STATUSES:
                return response
            location = response.headers.get("location")
            if not location:
                raise AdapterExecutionError(
                    "http_redirect_invalid", "The endpoint returned a redirect without a location."
                )
            redirects += 1
            if redirects > MAX_REDIRECTS:
                raise AdapterExecutionError(
                    "http_redirect_limit", f"HTTP requests allow at most {MAX_REDIRECTS} redirects."
                )
            current_url = urljoin(current_url, location)
            if response.status_code == 303 or (
                response.status_code in {301, 302} and current_method == "POST"
            ):
                current_method = "GET"
                current_body = None

    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult:
        if not isinstance(node, HttpRequestNode):
            raise AdapterExecutionError(
                "adapter_mismatch", "HTTP Request adapter received wrong node."
            )
        if context.cancellation.is_set():
            raise asyncio.CancelledError
        if not self._limiter.allow(context.rate_key):
            raise AdapterExecutionError(
                "http_rate_limited", "This visitor has reached the 20-per-hour HTTP demo limit."
            )

        body = context.first_input("body", node.config.body)
        url = render_url(node.config.url, body)
        headers = _safe_headers(node.config.headers)
        response: BoundedHttpResponse | None = None
        for attempt in range(2):
            response = await self._request_once(node.config.method, url, headers, body)
            if response.status_code not in RETRYABLE_STATUSES or attempt == 1:
                break
            if context.cancellation.is_set():
                raise asyncio.CancelledError
            await asyncio.sleep(0)

        assert response is not None
        if not 200 <= response.status_code < 300:
            raise AdapterExecutionError(
                "http_status_error",
                f"The endpoint returned HTTP {response.status_code}.",
            )
        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip()
        output: JsonValue = {
            "statusCode": response.status_code,
            "url": response.url,
            "contentType": content_type,
            "body": _response_body(response),
        }
        return NodeExecutionResult(outputs={"response": output})
