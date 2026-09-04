"""Controlled Groq adapter for bounded, zero-cost text generation."""

from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

import httpx
from pydantic import TypeAdapter

from ..models.base import JsonValue
from ..models.workflow import LlmNode, WorkflowNode
from .deterministic_adapters import AdapterExecutionError
from .scheduler import NodeExecutionContext, NodeExecutionResult

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MODEL = "openai/gpt-oss-20b"
MAX_PROMPT_CHARS = 4_000
MAX_OUTPUT_TOKENS = 512
MAX_OUTPUT_CHARS = 8_192
GROQ_TIMEOUT_SECONDS = 20.0
TEMPLATE_EXPRESSION = re.compile(r"{{\s*input(?:\.([A-Za-z0-9_.]+))?\s*}}")
MODEL_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*/[A-Za-z0-9][A-Za-z0-9._:-]*$")
JSON_ADAPTER: TypeAdapter[JsonValue] = TypeAdapter(JsonValue)


@dataclass(frozen=True, slots=True)
class LlmGeneration:
    text: str
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


class LlmProvider(Protocol):
    async def generate(self, *, system_prompt: str, prompt: str) -> LlmGeneration: ...


def _lookup(value: JsonValue, path: str | None) -> JsonValue:
    current = value
    if not path:
        return current
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            raise AdapterExecutionError(
                "ai_prompt_invalid", f"Prompt value {path!r} is not available."
            )
    return current


def render_prompt(template: str, incoming: JsonValue) -> str:
    residue = TEMPLATE_EXPRESSION.sub("", template)
    if "{{" in residue or "}}" in residue:
        raise AdapterExecutionError(
            "ai_prompt_invalid", "Prompts must use {{ input }} or {{ input.path }} placeholders."
        )

    def replace(match: re.Match[str]) -> str:
        value = _lookup(incoming, match.group(1))
        if isinstance(value, str):
            return value
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

    rendered = TEMPLATE_EXPRESSION.sub(replace, template)
    if len(rendered) > MAX_PROMPT_CHARS:
        raise AdapterExecutionError(
            "ai_prompt_too_large", "The rendered AI prompt exceeds 4,000 characters."
        )
    return rendered


class GroqProvider:
    """Small OpenAI-compatible Groq client with no client-visible credential."""

    def __init__(
        self,
        *,
        model: str | None = None,
        client_factory: Callable[[], httpx.AsyncClient] | None = None,
    ) -> None:
        self._model = model or os.environ.get("NODEFLOW_AI_MODEL", DEFAULT_MODEL)
        if not MODEL_PATTERN.fullmatch(self._model):
            raise AdapterExecutionError(
                "ai_model_invalid", "NODEFLOW_AI_MODEL must use provider/model format."
            )
        self._client_factory = client_factory or self._create_client
        self._model_verified = False

    @staticmethod
    def _create_client() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=GROQ_BASE_URL,
            timeout=httpx.Timeout(GROQ_TIMEOUT_SECONDS),
            trust_env=False,
        )

    @staticmethod
    def _headers() -> dict[str, str]:
        token = os.environ.get("GROQ_API_KEY")
        if not token:
            raise AdapterExecutionError(
                "ai_unavailable", "AI generation is unavailable until Groq is configured."
            )
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async def _verify_model(self, client: httpx.AsyncClient, headers: dict[str, str]) -> None:
        if self._model_verified:
            return
        try:
            response = await client.get("/models", headers=headers)
        except httpx.TimeoutException as error:
            raise AdapterExecutionError(
                "ai_timeout", "Groq model verification timed out."
            ) from error
        except httpx.RequestError as error:
            raise AdapterExecutionError(
                "ai_provider_unavailable", "Groq model verification failed."
            ) from error
        if response.status_code != 200:
            raise self._map_status(response.status_code, verifying_model=True)
        try:
            payload = response.json()
            model_ids = {
                item["id"]
                for item in payload["data"]
                if isinstance(item, dict) and isinstance(item.get("id"), str)
            }
        except (KeyError, TypeError, ValueError) as error:
            raise AdapterExecutionError(
                "ai_model_check_failed", "Groq returned an invalid model catalog."
            ) from error
        if self._model not in model_ids:
            raise AdapterExecutionError(
                "ai_model_unavailable",
                "The configured AI model is not available through Groq.",
            )
        self._model_verified = True

    @staticmethod
    def _map_status(status_code: int, *, verifying_model: bool = False) -> AdapterExecutionError:
        if status_code == 429:
            return AdapterExecutionError(
                "ai_provider_rate_limited",
                "Groq's free AI quota is busy or exhausted; try again later.",
            )
        if status_code in {401, 403}:
            return AdapterExecutionError(
                "ai_configuration_error",
                "Groq authentication or model access is not configured correctly.",
            )
        if status_code == 400:
            return AdapterExecutionError(
                "ai_request_rejected", "Groq rejected the configured generation request."
            )
        if verifying_model:
            return AdapterExecutionError("ai_model_check_failed", "Groq model verification failed.")
        return AdapterExecutionError(
            "ai_provider_unavailable", "AI generation is temporarily unavailable."
        )

    async def generate(self, *, system_prompt: str, prompt: str) -> LlmGeneration:
        headers = self._headers()
        body = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": MAX_OUTPUT_TOKENS,
            "stream": False,
        }
        try:
            async with self._client_factory() as client:
                await self._verify_model(client, headers)
                response = await client.post("/chat/completions", headers=headers, json=body)
        except AdapterExecutionError:
            raise
        except httpx.TimeoutException as error:
            raise AdapterExecutionError(
                "ai_timeout", "AI generation exceeded the twenty-second timeout."
            ) from error
        except httpx.RequestError as error:
            raise AdapterExecutionError(
                "ai_provider_unavailable", "Groq could not complete the request."
            ) from error
        if response.status_code != 200:
            raise self._map_status(response.status_code)
        try:
            payload = response.json()
            text = payload["choices"][0]["message"]["content"]
            if not isinstance(text, str) or not text:
                raise TypeError
            usage = payload.get("usage", {})
            prompt_tokens = usage.get("prompt_tokens")
            completion_tokens = usage.get("completion_tokens")
        except (IndexError, KeyError, TypeError, ValueError) as error:
            raise AdapterExecutionError(
                "ai_response_invalid", "Groq returned an invalid generation response."
            ) from error
        if len(text) > MAX_OUTPUT_CHARS:
            raise AdapterExecutionError(
                "ai_output_too_large", "AI output exceeds the configured response limit."
            )
        return LlmGeneration(
            text=text,
            model=self._model,
            prompt_tokens=prompt_tokens if isinstance(prompt_tokens, int) else None,
            completion_tokens=completion_tokens if isinstance(completion_tokens, int) else None,
        )


class LlmAdapter:
    def __init__(
        self,
        provider: LlmProvider | None = None,
    ) -> None:
        self._provider = provider or GroqProvider()

    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult:
        if not isinstance(node, LlmNode):
            raise AdapterExecutionError("adapter_mismatch", "LLM adapter received wrong node.")
        if context.cancellation.is_set():
            raise asyncio.CancelledError
        prompt = render_prompt(
            node.config.prompt_template,
            context.first_input("context"),
        )
        generation = await self._provider.generate(
            system_prompt=node.config.system_prompt,
            prompt=prompt,
        )
        output: JsonValue = {
            "text": generation.text,
            "model": generation.model,
            "usage": {
                "promptTokens": generation.prompt_tokens,
                "completionTokens": generation.completion_tokens,
            },
        }
        return NodeExecutionResult(outputs={"response": JSON_ADAPTER.validate_python(output)})
