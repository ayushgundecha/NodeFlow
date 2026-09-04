import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx
import pytest

from app.models.workflow import WorkflowDefinition, WorkflowNode
from app.services.deterministic_adapters import AdapterExecutionError
from app.services.http_request import (
    MAX_RESPONSE_BYTES,
    BoundedHttpResponse,
    HttpRequestAdapter,
    HttpxTransport,
    PublicDestination,
    render_url,
    validate_public_destination,
)
from app.services.rate_limits import SlidingWindowRateLimiter
from app.services.scheduler import NodeExecutionContext


@dataclass
class FakeResolver:
    addresses: dict[str, tuple[str, ...]]
    calls: list[tuple[str, int]] = field(default_factory=list)

    async def resolve(self, hostname: str, port: int) -> tuple[str, ...]:
        self.calls.append((hostname, port))
        return self.addresses.get(hostname, ())


@dataclass
class FakeTransport:
    responses: list[BoundedHttpResponse]
    calls: list[tuple[str, PublicDestination, dict[str, str], Any]] = field(default_factory=list)

    async def request(
        self,
        method: str,
        destination: PublicDestination,
        *,
        headers: dict[str, str],
        body: Any,
    ) -> BoundedHttpResponse:
        self.calls.append((method, destination, dict(headers), body))
        return self.responses.pop(0)


def response(
    status: int = 200,
    *,
    body: bytes = b'{"ok":true}',
    headers: dict[str, str] | None = None,
    url: str = "https://api.example.com/data",
) -> BoundedHttpResponse:
    return BoundedHttpResponse(
        status_code=status,
        headers=headers or {"content-type": "application/json"},
        content=body,
        url=url,
    )


def make_node(config: dict[str, Any]) -> WorkflowNode:
    return WorkflowDefinition.model_validate(
        {
            "schemaVersion": "1.0",
            "id": "http.test",
            "name": "HTTP test",
            "nodes": [
                {
                    "id": "request",
                    "type": "httpRequest",
                    "position": {"x": 0, "y": 0},
                    "config": config,
                }
            ],
            "edges": [],
        }
    ).nodes[0]


def execute(adapter: HttpRequestAdapter, node: WorkflowNode, body: Any = None):
    return asyncio.run(
        adapter.execute(
            node,
            NodeExecutionContext(
                inputs={"body": (body,)} if body is not None else {},
                run_input=None,
                cancellation=asyncio.Event(),
            ),
        )
    )


def test_public_json_get_returns_bounded_structured_output() -> None:
    resolver = FakeResolver({"api.example.com": ("93.184.216.34",)})
    transport = FakeTransport([response()])
    node = make_node(
        {
            "method": "GET",
            "url": "https://api.example.com/data",
            "headers": {"Accept": "application/json"},
            "body": None,
        }
    )

    result = execute(HttpRequestAdapter(resolver=resolver, transport=transport), node)

    assert result.outputs == {
        "response": {
            "statusCode": 200,
            "url": "https://api.example.com/data",
            "contentType": "application/json",
            "body": {"ok": True},
        }
    }
    assert resolver.calls == [("api.example.com", 443)]
    assert transport.calls[0][2] == {"accept": "application/json"}


def test_http_execution_has_a_per_visitor_limit() -> None:
    resolver = FakeResolver({"api.example.com": ("93.184.216.34",)})
    transport = FakeTransport([response()])
    adapter = HttpRequestAdapter(
        resolver=resolver,
        transport=transport,
        limiter=SlidingWindowRateLimiter(1, 3600),
    )
    node = make_node({"method": "GET", "url": "https://api.example.com/data"})
    execute(adapter, node)

    with pytest.raises(AdapterExecutionError) as error:
        execute(adapter, node)

    assert error.value.code == "http_rate_limited"


@pytest.mark.parametrize(
    "url",
    [
        "http://api.example.com/data",
        "ftp://api.example.com/data",
        "https://user:password@api.example.com/data",
    ],
)
def test_non_https_and_embedded_credentials_are_blocked(url: str) -> None:
    resolver = FakeResolver({"api.example.com": ("93.184.216.34",)})

    with pytest.raises(AdapterExecutionError):
        asyncio.run(validate_public_destination(url, resolver))


@pytest.mark.parametrize(
    "address",
    ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.2", "::1", "fc00::1"],
)
def test_non_public_dns_answers_are_blocked(address: str) -> None:
    resolver = FakeResolver({"blocked.example": (address,)})

    with pytest.raises(AdapterExecutionError) as error:
        asyncio.run(validate_public_destination("https://blocked.example", resolver))

    assert error.value.code == "http_destination_blocked"


def test_mixed_public_and_private_dns_answers_fail_closed() -> None:
    resolver = FakeResolver({"mixed.example": ("93.184.216.34", "127.0.0.1")})

    with pytest.raises(AdapterExecutionError) as error:
        asyncio.run(validate_public_destination("https://mixed.example", resolver))

    assert error.value.code == "http_destination_blocked"


@pytest.mark.parametrize(
    "header",
    ["Authorization", "Cookie", "Host", "Proxy-Authorization", "X-Api-Key", "Forwarded"],
)
def test_credential_and_routing_headers_are_rejected(header: str) -> None:
    resolver = FakeResolver({"api.example.com": ("93.184.216.34",)})
    node = make_node(
        {
            "method": "GET",
            "url": "https://api.example.com",
            "headers": {header: "secret"},
            "body": None,
        }
    )

    with pytest.raises(AdapterExecutionError) as error:
        execute(HttpRequestAdapter(resolver=resolver, transport=FakeTransport([])), node)

    assert error.value.code == "http_header_blocked"


def test_each_redirect_is_resolved_and_private_redirect_is_blocked() -> None:
    resolver = FakeResolver(
        {
            "api.example.com": ("93.184.216.34",),
            "internal.example": ("127.0.0.1",),
        }
    )
    transport = FakeTransport(
        [response(302, headers={"location": "https://internal.example/secrets"})]
    )
    node = make_node(
        {"method": "GET", "url": "https://api.example.com", "headers": {}, "body": None}
    )

    with pytest.raises(AdapterExecutionError) as error:
        execute(HttpRequestAdapter(resolver=resolver, transport=transport), node)

    assert error.value.code == "http_destination_blocked"
    assert resolver.calls == [("api.example.com", 443), ("internal.example", 443)]
    assert len(transport.calls) == 1


def test_redirect_limit_and_post_to_get_semantics_are_bounded() -> None:
    resolver = FakeResolver({"api.example.com": ("93.184.216.34",)})
    redirects = [response(303, headers={"location": f"/step/{index}"}) for index in range(4)]
    transport = FakeTransport(redirects)
    node = make_node(
        {
            "method": "POST",
            "url": "https://api.example.com/start",
            "headers": {"Content-Type": "application/json"},
            "body": {"value": 1},
        }
    )

    with pytest.raises(AdapterExecutionError) as error:
        execute(HttpRequestAdapter(resolver=resolver, transport=transport), node)

    assert error.value.code == "http_redirect_limit"
    assert [call[0] for call in transport.calls] == ["POST", "GET", "GET", "GET"]
    assert transport.calls[1][3] is None


def test_retryable_status_is_retried_exactly_once() -> None:
    resolver = FakeResolver({"api.example.com": ("93.184.216.34",)})
    transport = FakeTransport([response(503), response(200)])
    node = make_node(
        {"method": "GET", "url": "https://api.example.com", "headers": {}, "body": None}
    )

    result = execute(HttpRequestAdapter(resolver=resolver, transport=transport), node)

    assert result.outputs["response"]["body"] == {"ok": True}
    assert len(transport.calls) == 2


def test_non_retryable_status_and_invalid_content_are_clear_failures() -> None:
    resolver = FakeResolver({"api.example.com": ("93.184.216.34",)})
    node = make_node(
        {"method": "GET", "url": "https://api.example.com", "headers": {}, "body": None}
    )

    with pytest.raises(AdapterExecutionError) as status_error:
        execute(
            HttpRequestAdapter(resolver=resolver, transport=FakeTransport([response(404)])),
            node,
        )
    assert status_error.value.code == "http_status_error"

    with pytest.raises(AdapterExecutionError) as content_error:
        execute(
            HttpRequestAdapter(
                resolver=resolver,
                transport=FakeTransport(
                    [response(body=b"binary", headers={"content-type": "image/png"})]
                ),
            ),
            node,
        )
    assert content_error.value.code == "http_content_type_blocked"


def test_url_template_values_are_encoded_and_post_uses_incoming_body() -> None:
    resolver = FakeResolver({"api.example.com": ("93.184.216.34",)})
    transport = FakeTransport([response()])
    node = make_node(
        {
            "method": "POST",
            "url": "https://api.example.com/users/{{ input.user }}",
            "headers": {"Content-Type": "application/json"},
            "body": {"user": "default"},
        }
    )
    incoming = {"user": "Ada Lovelace", "active": True}

    execute(HttpRequestAdapter(resolver=resolver, transport=transport), node, incoming)

    assert transport.calls[0][1].url.endswith("/users/Ada%20Lovelace")
    assert transport.calls[0][3] == incoming
    assert render_url("https://api.example.com/{{ input.user }}", incoming).endswith(
        "/Ada%20Lovelace"
    )


def test_httpx_transport_stops_oversized_streams() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=b"x" * (MAX_RESPONSE_BYTES + 1),
            headers={"content-type": "text/plain"},
        )

    def client_factory() -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler))

    transport = HttpxTransport(client_factory)
    destination = PublicDestination(
        url="https://api.example.com/large",
        hostname="api.example.com",
        port=443,
        addresses=("93.184.216.34",),
    )

    with pytest.raises(AdapterExecutionError) as error:
        asyncio.run(transport.request("GET", destination, headers={}, body=None))

    assert error.value.code == "http_response_too_large"


def test_httpx_transport_maps_timeout_without_exposing_details() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("private upstream detail", request=request)

    def client_factory() -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler))

    transport = HttpxTransport(client_factory)
    destination = PublicDestination(
        url="https://api.example.com/slow",
        hostname="api.example.com",
        port=443,
        addresses=("93.184.216.34",),
    )

    with pytest.raises(AdapterExecutionError) as error:
        asyncio.run(transport.request("GET", destination, headers={}, body=None))

    assert error.value.code == "http_timeout"
    assert "private upstream detail" not in error.value.message
