import asyncio
from dataclasses import dataclass, field
from typing import Any

import pytest
from vercel.headers import HeadersContext, get_headers

from app.models.workflow import WorkflowDefinition
from app.services import sandbox_javascript
from app.services.deterministic_adapters import AdapterExecutionError
from app.services.rate_limits import SlidingWindowRateLimiter
from app.services.sandbox_javascript import (
    LOG_LIMIT_BYTES,
    JavaScriptAdapter,
    JavaScriptSandboxRunner,
    VercelSandboxFactory,
)
from app.services.scheduler import NodeExecutionContext


@dataclass
class Completed:
    returncode: int = 0
    stdout: str = ""
    stderr: str = ""


@dataclass
class FakeFilesystem:
    files: dict[str, str] = field(default_factory=dict)

    async def write_text(self, path: str, text: str, **_: Any) -> None:
        self.files[path] = text

    async def read_text(self, path: str, **_: Any) -> str:
        return self.files[path]


@dataclass
class FakeBox:
    completed: Completed = field(default_factory=Completed)
    fs: FakeFilesystem = field(default_factory=FakeFilesystem)
    destroyed: bool = False
    run_arguments: tuple[str, list[str], dict[str, Any]] | None = None

    async def run_process(self, command: str, args: list[str], **kwargs: Any) -> Completed:
        self.run_arguments = (command, args, kwargs)
        return self.completed

    async def destroy(self) -> None:
        self.destroyed = True


@dataclass
class FakeFactory:
    box: FakeBox
    created: bool = False

    async def create(self) -> FakeBox:
        self.created = True
        return self.box


def run(coroutine: Any) -> Any:
    return asyncio.run(coroutine)


def test_javascript_adapter_uses_files_not_host_shell_and_returns_json() -> None:
    box = FakeBox(completed=Completed(stdout="analysis complete\n"))
    box.fs.files["output.json"] = '{"severity":"high"}'
    adapter = JavaScriptAdapter(JavaScriptSandboxRunner(FakeFactory(box)))
    node = WorkflowDefinition.model_validate(
        {
            "schemaVersion": "1.0",
            "id": "sandbox.test",
            "name": "Sandbox test",
            "nodes": [
                {
                    "id": "script",
                    "type": "javascript",
                    "position": {"x": 0, "y": 0},
                    "config": {"source": "return { severity: input.severity };"},
                }
            ],
            "edges": [],
        }
    ).nodes[0]

    result = run(
        adapter.execute(
            node,
            NodeExecutionContext(
                inputs={"input": ({"severity": "high"},)},
                run_input=None,
                cancellation=asyncio.Event(),
            ),
        )
    )

    assert result.outputs == {"output": {"severity": "high"}}
    assert result.logs == ("analysis complete\n",)
    assert box.run_arguments is not None
    command, args, kwargs = box.run_arguments
    assert command == "node"
    assert "--no-warnings" in args
    assert args[-1] == "runner.mjs"
    assert kwargs["kill_after"] == 3
    assert "return { severity: input.severity };" in box.fs.files["user.mjs"]
    assert '"severity":"high"' in box.fs.files["input.json"]
    assert box.destroyed


def test_javascript_execution_has_a_per_visitor_limit() -> None:
    box = FakeBox()
    box.fs.files["output.json"] = "null"
    adapter = JavaScriptAdapter(
        JavaScriptSandboxRunner(FakeFactory(box)),
        limiter=SlidingWindowRateLimiter(1, 3600),
    )
    node = WorkflowDefinition.model_validate(
        {
            "schemaVersion": "1.0",
            "id": "sandbox.limit",
            "name": "Sandbox limit",
            "nodes": [
                {
                    "id": "script",
                    "type": "javascript",
                    "position": {"x": 0, "y": 0},
                    "config": {"source": "return null;"},
                }
            ],
            "edges": [],
        }
    ).nodes[0]
    context = NodeExecutionContext(
        inputs={}, run_input=None, cancellation=asyncio.Event(), rate_key="visitor"
    )
    run(adapter.execute(node, context))

    with pytest.raises(AdapterExecutionError) as error:
        run(adapter.execute(node, context))

    assert error.value.code == "sandbox_rate_limited"


def test_javascript_runtime_error_is_bounded_and_sandbox_is_destroyed() -> None:
    box = FakeBox(completed=Completed(returncode=1, stderr="TypeError: bad input\n"))
    runner = JavaScriptSandboxRunner(FakeFactory(box))

    with pytest.raises(AdapterExecutionError, match="TypeError: bad input") as error:
        run(runner.execute("throw new TypeError('bad input');", {"input": None}))

    assert error.value.code == "javascript_failed"
    assert box.destroyed


def test_log_and_output_limits_are_enforced_without_leaking_unbounded_data() -> None:
    box = FakeBox(completed=Completed(stdout="x" * (LOG_LIMIT_BYTES + 100)))
    box.fs.files["output.json"] = '"' + "x" * (64 * 1024) + '"'
    runner = JavaScriptSandboxRunner(FakeFactory(box))

    with pytest.raises(AdapterExecutionError) as error:
        run(runner.execute("return input;", {"input": None}))

    assert error.value.code == "output_too_large"
    assert box.destroyed


def test_log_flood_is_truncated_and_a_timeout_still_destroys_the_microvm() -> None:
    box = FakeBox(
        completed=Completed(
            returncode=137,
            stdout="x" * (LOG_LIMIT_BYTES + 100),
            stderr="Execution terminated after the configured time limit.",
        )
    )
    runner = JavaScriptSandboxRunner(FakeFactory(box))

    with pytest.raises(AdapterExecutionError) as error:
        run(runner.execute("while (true) {}", {"input": None}))

    assert error.value.code == "javascript_failed"
    assert "[output truncated]" in error.value.message
    assert len(error.value.message.encode("utf-8")) <= (
        LOG_LIMIT_BYTES + len(b"\n[output truncated]")
    )
    assert box.run_arguments is not None
    assert box.run_arguments[2]["kill_after"] == 3
    assert box.destroyed


def test_process_timeout_has_an_actionable_error_and_destroys_the_microvm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class SlowBox(FakeBox):
        async def run_process(self, command: str, args: list[str], **kwargs: Any) -> Completed:
            self.run_arguments = (command, args, kwargs)
            await asyncio.Event().wait()
            return self.completed

    monkeypatch.setattr(sandbox_javascript, "CODE_TIMEOUT_SECONDS", 0.01)
    box = SlowBox()

    with pytest.raises(AdapterExecutionError) as error:
        run(JavaScriptSandboxRunner(FakeFactory(box)).execute("while (true) {}", {"input": None}))

    assert error.value.code == "javascript_timeout"
    assert box.destroyed


def test_source_limit_rejects_before_creating_a_microvm() -> None:
    box = FakeBox()
    factory = FakeFactory(box)
    runner = JavaScriptSandboxRunner(factory)

    with pytest.raises(AdapterExecutionError) as error:
        run(runner.execute("x" * (10 * 1024 + 1), {"input": None}))

    assert error.value.code == "source_too_large"
    assert not factory.created
    assert not box.destroyed


def test_cancellation_destroys_the_microvm() -> None:
    class BlockingBox(FakeBox):
        async def run_process(self, command: str, args: list[str], **kwargs: Any) -> Completed:
            self.run_arguments = (command, args, kwargs)
            await asyncio.Event().wait()
            return self.completed

    async def exercise() -> None:
        box = BlockingBox()
        task = asyncio.create_task(
            JavaScriptSandboxRunner(FakeFactory(box)).execute("return input;", {"input": None})
        )
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert box.destroyed

    run(exercise())


def test_vercel_factory_fails_closed_without_sandbox_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def missing_credentials() -> None:
        raise RuntimeError("missing credentials")

    monkeypatch.setattr(sandbox_javascript, "get_credentials", missing_credentials)

    with pytest.raises(AdapterExecutionError) as error:
        run(VercelSandboxFactory().create())

    assert error.value.code == "sandbox_unavailable"


def test_vercel_factory_creates_a_fresh_air_gapped_microvm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    box = FakeBox()

    async def create_sandbox(**kwargs: Any) -> FakeBox:
        captured.update(kwargs)
        return box

    def credentials_from_vercel_request() -> object:
        assert get_headers() == {"x-vercel-oidc-token": "runtime-token"}
        return object()

    monkeypatch.setattr(sandbox_javascript, "get_credentials", credentials_from_vercel_request)
    monkeypatch.setattr(sandbox_javascript.sandbox, "create_sandbox", create_sandbox)

    with HeadersContext({"x-vercel-oidc-token": "runtime-token"}).use():
        assert run(VercelSandboxFactory().create()) is box
    assert captured["execution_time_limit"] == 5
    assert captured["persistent"] is False
    assert captured["env"] == {}
    assert captured["tags"] == {"workload": "nodeflow-javascript"}
    assert captured["network_policy"].mode == "deny-all"
    assert captured["resources"].vcpus == 1
    assert captured["resources"].memory == 2048


def test_vercel_factory_maps_sdk_failures_to_a_safe_recoverable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def create_sandbox(**_: Any) -> FakeBox:
        raise RuntimeError("provider details must not reach the client")

    monkeypatch.setattr(sandbox_javascript, "get_credentials", lambda: object())
    monkeypatch.setattr(sandbox_javascript.sandbox, "create_sandbox", create_sandbox)

    with pytest.raises(AdapterExecutionError) as error:
        run(VercelSandboxFactory().create())

    assert error.value.code == "sandbox_unavailable"
    assert (
        error.value.message == "JavaScript execution is temporarily unavailable; try again later."
    )
