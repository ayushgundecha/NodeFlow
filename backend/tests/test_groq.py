import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

import httpx
import pytest

from app.models.workflow import WorkflowDefinition, WorkflowNode
from app.services.deterministic_adapters import AdapterExecutionError
from app.services.groq import (
    DEFAULT_MODEL,
    MAX_OUTPUT_CHARS,
    GroqProvider,
    LlmAdapter,
    LlmGeneration,
    render_prompt,
)
from app.services.rate_limits import SlidingWindowRateLimiter
from app.services.scheduler import NodeExecutionContext


@dataclass
class FakeProvider:
    generation: LlmGeneration = field(
        default_factory=lambda: LlmGeneration(
            text="Clear summary", model=DEFAULT_MODEL, prompt_tokens=12, completion_tokens=4
        )
    )
    calls: list[dict[str, str]] = field(default_factory=list)

    async def generate(self, *, system_prompt: str, prompt: str) -> LlmGeneration:
        self.calls.append({"system_prompt": system_prompt, "prompt": prompt})
        return self.generation


def node(prompt: str = "Summarize {{ input.incident }}") -> WorkflowNode:
    return WorkflowDefinition.model_validate(
        {
            "schemaVersion": "1.0",
            "id": "ai.test",
            "name": "AI test",
            "nodes": [
                {
                    "id": "brief",
                    "type": "llm",
                    "position": {"x": 0, "y": 0},
                    "config": {
                        "systemPrompt": "Return a concise operational brief.",
                        "promptTemplate": prompt,
                    },
                }
            ],
            "edges": [],
        }
    ).nodes[0]


def execute(adapter: LlmAdapter, workflow_node: WorkflowNode, *, rate_key: str = "visitor"):
    return asyncio.run(
        adapter.execute(
            workflow_node,
            NodeExecutionContext(
                inputs={"context": ({"incident": {"service": "checkout"}},)},
                run_input=None,
                cancellation=asyncio.Event(),
                rate_key=rate_key,
            ),
        )
    )


def test_llm_adapter_renders_context_and_returns_usage() -> None:
    provider = FakeProvider()
    adapter = LlmAdapter(provider, SlidingWindowRateLimiter(5, 3600))

    result = execute(adapter, node())

    assert provider.calls == [
        {
            "system_prompt": "Return a concise operational brief.",
            "prompt": 'Summarize {"service":"checkout"}',
        }
    ]
    assert result.outputs == {
        "response": {
            "text": "Clear summary",
            "model": DEFAULT_MODEL,
            "usage": {"promptTokens": 12, "completionTokens": 4},
        }
    }


def test_prompt_rendering_is_bounded_and_has_no_expression_language() -> None:
    assert render_prompt("Input: {{ input }}", {"safe": True}) == 'Input: {"safe":true}'
    assert render_prompt("Context: {{ input }}", {"release": {"tag": "v1"}}) == (
        'Context: {"release":{"tag":"v1"}}'
    )
    with pytest.raises(AdapterExecutionError) as missing:
        render_prompt("{{ input.missing }}", {})
    assert missing.value.code == "ai_prompt_invalid"

    with pytest.raises(AdapterExecutionError) as unsafe:
        render_prompt("{{ execute(input) }}", {})
    assert unsafe.value.code == "ai_prompt_invalid"

    with pytest.raises(AdapterExecutionError) as large:
        render_prompt("{{ input }}", "x" * 4_001)
    assert large.value.code == "ai_prompt_too_large"


def test_five_per_hour_limit_is_enforced_per_anonymous_visitor() -> None:
    provider = FakeProvider()
    limiter = SlidingWindowRateLimiter(5, 3600)
    adapter = LlmAdapter(provider, limiter)

    for _ in range(5):
        execute(adapter, node())
    with pytest.raises(AdapterExecutionError) as error:
        execute(adapter, node())

    assert error.value.code == "ai_rate_limited"
    assert len(provider.calls) == 5
    assert execute(adapter, node(), rate_key="another-visitor").outputs


def test_sliding_window_releases_expired_entries() -> None:
    now = [0.0]
    limiter = SlidingWindowRateLimiter(1, 10, clock=lambda: now[0])

    assert limiter.allow("visitor")
    assert not limiter.allow("visitor")
    now[0] = 10.0
    assert limiter.allow("visitor")


def groq_client(handler: Any, *, model: str = DEFAULT_MODEL) -> GroqProvider:
    def factory() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url="https://api.groq.com/openai/v1", transport=httpx.MockTransport(handler)
        )

    return GroqProvider(model=model, client_factory=factory)


def run_generation(provider: GroqProvider) -> LlmGeneration:
    return asyncio.run(
        provider.generate(system_prompt="Be concise.", prompt="Summarize this incident.")
    )


def test_groq_verifies_model_and_sends_bounded_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "private-test-key")
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": DEFAULT_MODEL}]})
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "Real Groq output"}}],
                "usage": {"prompt_tokens": 8, "completion_tokens": 3},
            },
        )

    generation = run_generation(groq_client(handler))

    assert generation.text == "Real Groq output"
    assert len(requests) == 2
    request_body = json.loads(requests[1].content)
    assert request_body["model"] == DEFAULT_MODEL
    assert request_body["max_tokens"] == 512
    assert requests[0].headers["authorization"] == "Bearer private-test-key"
    assert requests[1].headers["authorization"] == "Bearer private-test-key"
    assert "private-test-key" not in repr(generation)


def test_model_catalog_is_cached_for_one_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    model_calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal model_calls
        if request.url.path.endswith("/models"):
            model_calls += 1
            return httpx.Response(200, json={"data": [{"id": DEFAULT_MODEL}]})
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    provider = groq_client(handler)
    run_generation(provider)
    run_generation(provider)

    assert model_calls == 1


def test_groq_fails_honestly_without_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    with pytest.raises(AdapterExecutionError) as error:
        run_generation(groq_client(lambda _: httpx.Response(500)))

    assert error.value.code == "ai_unavailable"


def test_groq_rejects_unavailable_or_invalid_models(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    with pytest.raises(AdapterExecutionError) as invalid:
        groq_client(lambda _: httpx.Response(500), model="missing-provider")
    assert invalid.value.code == "ai_model_invalid"

    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"id": "other/model"}]})

    with pytest.raises(AdapterExecutionError) as unavailable:
        run_generation(groq_client(handler))
    assert unavailable.value.code == "ai_model_unavailable"


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (429, "ai_provider_rate_limited"),
        (401, "ai_configuration_error"),
        (403, "ai_configuration_error"),
        (400, "ai_request_rejected"),
        (503, "ai_provider_unavailable"),
    ],
)
def test_groq_statuses_become_typed_safe_errors(
    monkeypatch: pytest.MonkeyPatch, status: int, code: str
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": DEFAULT_MODEL}]})
        return httpx.Response(status, text="private provider details")

    with pytest.raises(AdapterExecutionError) as error:
        run_generation(groq_client(handler))

    assert error.value.code == code
    assert "private provider details" not in error.value.message


def test_groq_timeout_and_oversized_output_fail_safely(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    async def timeout_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": DEFAULT_MODEL}]})
        raise httpx.ReadTimeout("provider detail", request=request)

    with pytest.raises(AdapterExecutionError) as timeout:
        run_generation(groq_client(timeout_handler))
    assert timeout.value.code == "ai_timeout"

    async def large_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": DEFAULT_MODEL}]})
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "x" * (MAX_OUTPUT_CHARS + 1)}}]},
        )

    with pytest.raises(AdapterExecutionError) as large:
        run_generation(groq_client(large_handler))
    assert large.value.code == "ai_output_too_large"
