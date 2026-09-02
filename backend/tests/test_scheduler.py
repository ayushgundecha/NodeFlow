import asyncio
from collections.abc import Mapping
from copy import deepcopy

from app.models.workflow import WorkflowDefinition, WorkflowNode
from app.services.scheduler import (
    NodeExecutionContext,
    NodeExecutionResult,
    NodeRunState,
    NodeTransition,
    RunTerminalTransition,
    WorkflowRunStatus,
    WorkflowScheduler,
)
from app.services.workflow_validation import create_execution_plan


def node(node_id: str, node_type: str) -> dict[str, object]:
    configs: dict[str, dict[str, object]] = {
        "manualInput": {"inputKey": node_id, "defaultValue": None},
        "transform": {"expression": "@"},
        "condition": {"rule": {}},
        "merge": {"strategy": "array"},
        "delay": {"milliseconds": 0},
        "output": {"label": node_id, "format": "json"},
    }
    return {
        "id": node_id,
        "type": node_type,
        "position": {"x": 0, "y": 0},
        "config": configs[node_type],
    }


def edge(
    edge_id: str,
    source: str,
    source_handle: str,
    target: str,
    target_handle: str,
) -> dict[str, str]:
    return {
        "id": edge_id,
        "source": source,
        "sourceHandle": source_handle,
        "target": target,
        "targetHandle": target_handle,
    }


def plan(
    nodes: list[dict[str, object]], edges: list[dict[str, str]]
):
    workflow = WorkflowDefinition.model_validate(
        {
            "schemaVersion": "1.0",
            "id": "scheduler.test",
            "name": "Scheduler test",
            "nodes": nodes,
            "edges": edges,
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    return create_execution_plan(workflow)


class ProbeAdapter:
    def __init__(
        self,
        *,
        delays: Mapping[str, float] | None = None,
        gates: Mapping[str, asyncio.Event] | None = None,
        started_signals: Mapping[str, asyncio.Event] | None = None,
        failures: set[str] | None = None,
        active_condition_handle: str = "true",
    ) -> None:
        self.delays = dict(delays or {})
        self.gates = dict(gates or {})
        self.started_signals = dict(started_signals or {})
        self.failures = failures or set()
        self.active_condition_handle = active_condition_handle
        self.active = 0
        self.maximum_active = 0
        self.started: list[str] = []
        self.cancelled: list[str] = []

    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult:
        self.active += 1
        self.maximum_active = max(self.maximum_active, self.active)
        self.started.append(node.id)
        if node.id in self.started_signals:
            self.started_signals[node.id].set()
        try:
            if node.id in self.gates:
                await self.gates[node.id].wait()
            elif self.delays.get(node.id, 0):
                await asyncio.sleep(self.delays[node.id])
            if node.id in self.failures:
                raise RuntimeError(f"deliberate failure in {node.id}")
            if node.type == "manualInput":
                return NodeExecutionResult(outputs={"value": {"source": node.id}})
            if node.type == "condition":
                value = context.first_input("input")
                return NodeExecutionResult(
                    outputs={"true": value, "false": value},
                    active_output_handles=frozenset({self.active_condition_handle}),
                )
            if node.type == "merge":
                return NodeExecutionResult(outputs={"output": list(context.inputs["items"])})
            if node.type in {"delay", "transform"}:
                return NodeExecutionResult(outputs={"output": context.first_input("input")})
            return NodeExecutionResult()
        except asyncio.CancelledError:
            self.cancelled.append(node.id)
            raise
        finally:
            self.active -= 1


def adapters(adapter: ProbeAdapter):
    return {
        node_type: adapter
        for node_type in ["manualInput", "transform", "condition", "merge", "delay", "output"]
    }


def test_scheduler_caps_concurrency_and_waits_for_dependencies() -> None:
    roots = [node(f"input.{index}", "manualInput") for index in range(5)]
    nodes = [*roots, node("merge", "merge"), node("result", "output")]
    edges = [
        edge(f"edge.{index}", f"input.{index}", "value", "merge", "items")
        for index in range(5)
    ]
    edges.append(edge("edge.result", "merge", "output", "result", "value"))
    async def scenario():
        gates = {f"input.{index}": asyncio.Event() for index in range(5)}
        signals = {f"input.{index}": asyncio.Event() for index in range(5)}
        adapter = ProbeAdapter(gates=gates, started_signals=signals)
        task = asyncio.create_task(WorkflowScheduler(adapters(adapter)).run(plan(nodes, edges)))
        await asyncio.wait_for(
            asyncio.gather(*(signals[f"input.{index}"].wait() for index in range(4))),
            timeout=1,
        )
        assert adapter.maximum_active == 4
        for index in range(4):
            gates[f"input.{index}"].set()
        await asyncio.wait_for(signals["input.4"].wait(), timeout=1)
        gates["input.4"].set()
        return await task, adapter

    result, adapter = asyncio.run(scenario())

    assert result.status is WorkflowRunStatus.COMPLETED
    assert adapter.maximum_active == 4
    assert adapter.started.index("merge") > max(
        adapter.started.index(f"input.{index}") for index in range(5)
    )
    assert len(result.outputs["result"]) == 5


def test_inactive_condition_branch_is_skipped_but_merge_completes() -> None:
    nodes = [
        node("input", "manualInput"),
        node("condition", "condition"),
        node("true-branch", "delay"),
        node("false-branch", "delay"),
        node("merge", "merge"),
        node("result", "output"),
    ]
    edges = [
        edge("1", "input", "value", "condition", "input"),
        edge("2", "condition", "true", "true-branch", "input"),
        edge("3", "condition", "false", "false-branch", "input"),
        edge("4", "true-branch", "output", "merge", "items"),
        edge("5", "false-branch", "output", "merge", "items"),
        edge("6", "merge", "output", "result", "value"),
    ]
    adapter = ProbeAdapter(active_condition_handle="true")

    result = asyncio.run(WorkflowScheduler(adapters(adapter)).run(plan(nodes, edges)))

    assert result.status is WorkflowRunStatus.COMPLETED
    assert result.nodes["false-branch"].state is NodeRunState.SKIPPED
    assert result.nodes["merge"].state is NodeRunState.COMPLETED
    assert result.outputs["result"] == [{"source": "input"}]


def test_failure_skips_dependents_while_independent_branch_finishes() -> None:
    nodes = [
        node("input.a", "manualInput"),
        node("input.b", "manualInput"),
        node("transform.a", "transform"),
        node("transform.b", "transform"),
        node("output.a", "output"),
        node("output.b", "output"),
    ]
    edges = [
        edge("1", "input.a", "value", "transform.a", "input"),
        edge("2", "transform.a", "output", "output.a", "value"),
        edge("3", "input.b", "value", "transform.b", "input"),
        edge("4", "transform.b", "output", "output.b", "value"),
    ]
    adapter = ProbeAdapter(failures={"transform.a"})

    result = asyncio.run(WorkflowScheduler(adapters(adapter)).run(plan(nodes, edges)))

    assert result.status is WorkflowRunStatus.FAILED
    assert result.nodes["transform.a"].state is NodeRunState.FAILED
    assert result.nodes["output.a"].state is NodeRunState.SKIPPED
    assert result.nodes["output.b"].state is NodeRunState.COMPLETED
    assert result.outputs == {"output.b": {"source": "input.b"}}


def test_cancellation_stops_active_nodes_and_never_starts_dependents() -> None:
    nodes = [node("input", "manualInput"), node("transform", "transform"), node("out", "output")]
    edges = [
        edge("1", "input", "value", "transform", "input"),
        edge("2", "transform", "output", "out", "value"),
    ]
    async def scenario():
        cancellation = asyncio.Event()
        gate = asyncio.Event()
        started = asyncio.Event()
        adapter = ProbeAdapter(gates={"input": gate}, started_signals={"input": started})
        task = asyncio.create_task(
            WorkflowScheduler(adapters(adapter)).run(
                plan(deepcopy(nodes), deepcopy(edges)), cancellation=cancellation
            )
        )
        await asyncio.wait_for(started.wait(), timeout=1)
        cancellation.set()
        return await task, adapter

    result, adapter = asyncio.run(scenario())

    assert result.status is WorkflowRunStatus.CANCELLED
    assert result.nodes["input"].state is NodeRunState.CANCELLED
    assert result.nodes["transform"].state is NodeRunState.PENDING
    assert adapter.cancelled == ["input"]


def test_total_timeout_cancels_adapter_cleanup() -> None:
    nodes = [node("input", "manualInput"), node("out", "output")]
    edges = [edge("1", "input", "value", "out", "value")]
    adapter = ProbeAdapter(delays={"input": 1})

    result = asyncio.run(
        WorkflowScheduler(adapters(adapter), timeout_seconds=0.01).run(plan(nodes, edges))
    )

    assert result.status is WorkflowRunStatus.TIMED_OUT
    assert adapter.active == 0
    assert adapter.cancelled == ["input"]


def test_completion_timing_does_not_change_results_and_emits_one_terminal_transition() -> None:
    nodes = [
        node("input.a", "manualInput"),
        node("input.b", "manualInput"),
        node("merge", "merge"),
        node("result", "output"),
    ]
    edges = [
        edge("a", "input.a", "value", "merge", "items"),
        edge("b", "input.b", "value", "merge", "items"),
        edge("result", "merge", "output", "result", "value"),
    ]

    async def run_with(completion_order: tuple[str, str]):
        transitions = []
        gates = {node_id: asyncio.Event() for node_id in completion_order}
        started = {node_id: asyncio.Event() for node_id in completion_order}
        completed = {node_id: asyncio.Event() for node_id in completion_order}

        async def observe(transition):
            transitions.append(transition)
            if (
                isinstance(transition, NodeTransition)
                and transition.state is NodeRunState.COMPLETED
                and transition.node_id in completed
            ):
                completed[transition.node_id].set()

        adapter = ProbeAdapter(gates=gates, started_signals=started)
        task = asyncio.create_task(
            WorkflowScheduler(adapters(adapter), observer=observe).run(
                plan(deepcopy(nodes), deepcopy(edges))
            )
        )
        await asyncio.wait_for(
            asyncio.gather(*(signal.wait() for signal in started.values())), timeout=1
        )
        for node_id in completion_order:
            gates[node_id].set()
            await asyncio.wait_for(completed[node_id].wait(), timeout=1)
        result = await task
        return result, transitions

    first, first_transitions = asyncio.run(run_with(("input.a", "input.b")))
    second, second_transitions = asyncio.run(run_with(("input.b", "input.a")))

    assert first.outputs == second.outputs
    assert {key: value.state for key, value in first.nodes.items()} == {
        key: value.state for key, value in second.nodes.items()
    }
    assert sum(isinstance(item, RunTerminalTransition) for item in first_transitions) == 1
    assert sum(isinstance(item, RunTerminalTransition) for item in second_transitions) == 1
