"""Vercel Sandbox-backed execution for user-authored JavaScript nodes.

This module is deliberately the only boundary that sends JavaScript to an
executor.  It never evaluates or starts a subprocess on the API host: source,
input, and the fixed runner are written as files in a fresh Vercel microVM.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol, cast

from pydantic import TypeAdapter, ValidationError
from vercel import sandbox
from vercel.sandbox import NetworkPolicy, SandboxResources

from ..models.base import JsonValue
from ..models.workflow import JavaScriptNode, WorkflowNode
from .deterministic_adapters import AdapterExecutionError
from .scheduler import NodeExecutionContext, NodeExecutionResult

SOURCE_LIMIT_BYTES = 10 * 1024
OUTPUT_LIMIT_BYTES = 64 * 1024
LOG_LIMIT_BYTES = 32 * 1024
CODE_TIMEOUT_SECONDS = 3
SANDBOX_LIFETIME_SECONDS = 5
JSON_ADAPTER: TypeAdapter[JsonValue] = TypeAdapter(JsonValue)
_ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")

# The user source is a function body. It is put in a module file, never into a
# command string; ``runner.mjs`` has no dynamic code evaluation capability.
RUNNER_SOURCE = """import runUserCode from './user.mjs';
import { readFile, writeFile } from 'node:fs/promises';

const payload = JSON.parse(await readFile('./input.json', 'utf8'));
const result = await runUserCode(payload.input, payload.context);
await writeFile('./output.json', JSON.stringify(result), { encoding: 'utf8', flag: 'w' });
"""


class SandboxFilesystem(Protocol):
    async def write_text(self, path: str, text: str, **kwargs: Any) -> Any: ...

    async def read_text(self, path: str, **kwargs: Any) -> Any: ...


class SandboxBox(Protocol):
    fs: SandboxFilesystem

    async def run_process(self, command: str, args: list[str], **kwargs: Any) -> Any: ...

    async def destroy(self) -> Any: ...


class SandboxFactory(Protocol):
    async def create(self) -> SandboxBox: ...


@dataclass(frozen=True, slots=True)
class SandboxExecution:
    output: JsonValue
    logs: str


def _bounded_text(value: str | bytes | None, limit: int) -> str:
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    text = _ANSI_ESCAPE.sub("", value or "").replace("\r\n", "\n")
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) <= limit:
        return text
    return encoded[:limit].decode("utf-8", errors="ignore") + "\n[output truncated]"


def _user_module(source: str) -> str:
    return "export default async function nodeflowUserCode(input, context) {\n" + source + "\n}\n"


class VercelSandboxFactory:
    """Creates a single-use, air-gapped microVM for one JavaScript node."""

    async def create(self) -> SandboxBox:
        has_oidc = bool(os.environ.get("VERCEL_OIDC_TOKEN"))
        has_access_token = all(
            os.environ.get(name)
            for name in ("VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID")
        )
        if not (has_oidc or has_access_token):
            raise AdapterExecutionError(
                "sandbox_unavailable",
                "JavaScript execution is unavailable until Vercel Sandbox credentials "
                "are configured.",
            )
        return cast(SandboxBox, await sandbox.create_sandbox(
            execution_time_limit=SANDBOX_LIFETIME_SECONDS,
            resources=SandboxResources(vcpus=1, memory=1024),
            persistent=False,
            network_policy=NetworkPolicy.deny_all(),
            # Do not project API-host configuration or credentials into the VM.
            env={},
            tags={"workload": "nodeflow-javascript"},
        ))


class JavaScriptSandboxRunner:
    """Run exactly one code node in a fresh sandbox and always destroy it."""

    def __init__(self, factory: SandboxFactory | None = None) -> None:
        self._factory = factory or VercelSandboxFactory()

    async def execute(self, source: str, payload: Mapping[str, JsonValue]) -> SandboxExecution:
        if len(source.encode("utf-8")) > SOURCE_LIMIT_BYTES:
            raise AdapterExecutionError(
                "source_too_large", "JavaScript source exceeds the 10 KB limit."
            )

        box = await self._factory.create()
        try:
            await box.fs.write_text("user.mjs", _user_module(source), mode=0o600)
            await box.fs.write_text(
                "input.json",
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                mode=0o600,
            )
            await box.fs.write_text("runner.mjs", RUNNER_SOURCE, mode=0o600)
            completed = await box.run_process(
                "node",
                ["--disable-proto=throw", "--frozen-intrinsics", "runner.mjs"],
                capture_output=True,
                kill_after=CODE_TIMEOUT_SECONDS,
                env={},
            )
            logs = _bounded_text(getattr(completed, "stdout", None), LOG_LIMIT_BYTES)
            stderr = _bounded_text(getattr(completed, "stderr", None), LOG_LIMIT_BYTES)
            if stderr:
                logs = _bounded_text(f"{logs}\n{stderr}" if logs else stderr, LOG_LIMIT_BYTES)
            if getattr(completed, "returncode", 1) != 0:
                diagnostic = logs or "JavaScript exited without a diagnostic."
                raise AdapterExecutionError("javascript_failed", diagnostic)
            try:
                raw_output = await box.fs.read_text("output.json")
            except Exception as error:
                raise AdapterExecutionError(
                    "javascript_no_output", "JavaScript must return a JSON-serializable value."
                ) from error
            if len(raw_output.encode("utf-8")) > OUTPUT_LIMIT_BYTES:
                raise AdapterExecutionError(
                    "output_too_large", "JavaScript output exceeds the 64 KB limit."
                )
            try:
                output = JSON_ADAPTER.validate_python(json.loads(raw_output))
            except (json.JSONDecodeError, ValidationError) as error:
                raise AdapterExecutionError(
                    "output_invalid", "JavaScript must return a JSON-serializable value."
                ) from error
            return SandboxExecution(output=output, logs=logs)
        except asyncio.CancelledError:
            raise
        finally:
            await box.destroy()


class JavaScriptAdapter:
    """Scheduler adapter for user code; it only delegates to a microVM runner."""

    def __init__(self, runner: JavaScriptSandboxRunner | None = None) -> None:
        self._runner = runner or JavaScriptSandboxRunner()

    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult:
        if not isinstance(node, JavaScriptNode):
            raise AdapterExecutionError(
                "adapter_mismatch", "JavaScript adapter received wrong node."
            )
        if context.cancellation.is_set():
            raise asyncio.CancelledError
        execution = await self._runner.execute(
            node.config.source,
            {
                "input": context.first_input("input"),
                "context": {"nodeId": node.id},
            },
        )
        # Logs are retained for the execution-inspection task; this adapter's
        # public data contract remains the existing single output handle.
        logs = (execution.logs,) if execution.logs else ()
        return NodeExecutionResult(outputs={"output": execution.output}, logs=logs)
