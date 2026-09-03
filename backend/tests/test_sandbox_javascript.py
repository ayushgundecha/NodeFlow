import asyncio
from dataclasses import dataclass, field
from typing import Any

import pytest

from app.models.workflow import WorkflowDefinition
from app.services.deterministic_adapters import AdapterExecutionError
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

    async def create(self) -> FakeBox:
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
    assert args[-1] == "runner.mjs"
    assert kwargs["kill_after"] == 3
    assert 'return { severity: input.severity };' in box.fs.files["user.mjs"]
    assert '"severity":"high"' in box.fs.files["input.json"]
    assert box.destroyed


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
    for name in ("VERCEL_OIDC_TOKEN", "VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"):
        monkeypatch.delenv(name, raising=False)

    with pytest.raises(AdapterExecutionError) as error:
        run(VercelSandboxFactory().create())

    assert error.value.code == "sandbox_unavailable"
