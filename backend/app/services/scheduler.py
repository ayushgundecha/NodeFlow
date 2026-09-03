"""Bounded, deterministic workflow scheduling over validated execution plans."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from enum import Enum
from time import monotonic
from typing import Protocol, cast

from ..models.base import JsonValue
from ..models.workflow import WorkflowEdge, WorkflowNode
from .workflow_validation import NODE_PORTS, ExecutionPlan

MAX_CONCURRENCY = 4
DEFAULT_RUN_TIMEOUT_SECONDS = 30.0


class NodeRunState(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


class WorkflowRunStatus(str, Enum):
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


@dataclass(frozen=True, slots=True)
class NodeExecutionContext:
    inputs: Mapping[str, tuple[JsonValue, ...]]
    run_input: JsonValue
    cancellation: asyncio.Event

    def first_input(self, handle: str, default: JsonValue = None) -> JsonValue:
        values = self.inputs.get(handle, ())
        return values[0] if values else default


@dataclass(frozen=True, slots=True)
class NodeExecutionResult:
    outputs: Mapping[str, JsonValue] = field(default_factory=dict)
    active_output_handles: frozenset[str] | None = None
    logs: tuple[str, ...] = ()

    def is_output_active(self, handle: str) -> bool:
        return self.active_output_handles is None or handle in self.active_output_handles


class NodeAdapter(Protocol):
    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult: ...


@dataclass(frozen=True, slots=True)
class NodeRunRecord:
    node_id: str
    state: NodeRunState
    inputs: Mapping[str, tuple[JsonValue, ...]] = field(default_factory=dict)
    outputs: Mapping[str, JsonValue] = field(default_factory=dict)
    logs: tuple[str, ...] = ()
    duration_ms: int = 0
    error_code: str | None = None
    error: str | None = None
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class NodeTransition:
    node_id: str
    state: NodeRunState
    record: NodeRunRecord | None = None


@dataclass(frozen=True, slots=True)
class WorkflowRunResult:
    status: WorkflowRunStatus
    nodes: Mapping[str, NodeRunRecord]
    outputs: Mapping[str, JsonValue]
    duration_ms: int
    error: str | None = None


@dataclass(frozen=True, slots=True)
class RunTerminalTransition:
    status: WorkflowRunStatus
    result: WorkflowRunResult


SchedulerTransition = NodeTransition | RunTerminalTransition
TransitionObserver = Callable[[SchedulerTransition], Awaitable[None]]


@dataclass(slots=True)
class _MutableNodeState:
    state: NodeRunState = NodeRunState.PENDING
    inputs: dict[str, tuple[JsonValue, ...]] = field(default_factory=dict)
    result: NodeExecutionResult | None = None
    duration_ms: int = 0
    error_code: str | None = None
    error: str | None = None
    reason: str | None = None
    blocking_skip: bool = False

    def freeze(self, node_id: str) -> NodeRunRecord:
        return NodeRunRecord(
            node_id=node_id,
            state=self.state,
            inputs=dict(self.inputs),
            outputs=dict(self.result.outputs) if self.result else {},
            logs=self.result.logs if self.result else (),
            duration_ms=self.duration_ms,
            error_code=self.error_code,
            error=self.error,
            reason=self.reason,
        )


class WorkflowScheduler:
    """Execute a validated plan while owning all dependency state transitions."""

    def __init__(
        self,
        adapters: Mapping[str, NodeAdapter],
        *,
        max_concurrency: int = MAX_CONCURRENCY,
        timeout_seconds: float = DEFAULT_RUN_TIMEOUT_SECONDS,
        observer: TransitionObserver | None = None,
    ) -> None:
        if not 1 <= max_concurrency <= MAX_CONCURRENCY:
            raise ValueError(f"max_concurrency must be between 1 and {MAX_CONCURRENCY}")
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        self._adapters = dict(adapters)
        self._max_concurrency = max_concurrency
        self._timeout_seconds = timeout_seconds
        self._observer = observer

    async def run(
        self,
        plan: ExecutionPlan,
        *,
        run_input: JsonValue = None,
        cancellation: asyncio.Event | None = None,
    ) -> WorkflowRunResult:
        started_at = monotonic()
        cancellation = cancellation or asyncio.Event()
        try:
            result = await asyncio.wait_for(
                self._run(plan, run_input, cancellation, started_at),
                timeout=self._timeout_seconds,
            )
        except TimeoutError:
            cancellation.set()
            result = WorkflowRunResult(
                status=WorkflowRunStatus.TIMED_OUT,
                nodes={},
                outputs={},
                duration_ms=_duration_ms(started_at),
                error=f"Run exceeded the {self._timeout_seconds:g}s limit.",
            )
        await self._emit(RunTerminalTransition(status=result.status, result=result))
        return result

    async def _emit(self, transition: SchedulerTransition) -> None:
        if self._observer:
            await self._observer(transition)

    async def _run(
        self,
        plan: ExecutionPlan,
        run_input: JsonValue,
        cancellation: asyncio.Event,
        started_at: float,
    ) -> WorkflowRunResult:
        workflow = plan.workflow
        nodes = {node.id: node for node in workflow.nodes}
        order = {
            node_id: index
            for index, node_id in enumerate(node_id for layer in plan.layers for node_id in layer)
        }
        incoming: dict[str, list[WorkflowEdge]] = defaultdict(list)
        dependents: dict[str, set[str]] = defaultdict(set)
        for edge in workflow.edges:
            incoming[edge.target].append(edge)
            dependents[edge.source].add(edge.target)
        for edges in incoming.values():
            edges.sort(key=lambda edge: edge.id)

        states = {node_id: _MutableNodeState() for node_id in nodes}
        ready = sorted(
            (node_id for node_id in nodes if not incoming[node_id]), key=order.__getitem__
        )
        queued: set[str] = set(ready)
        for node_id in ready:
            states[node_id].state = NodeRunState.QUEUED
            await self._emit(NodeTransition(node_id, NodeRunState.QUEUED))

        active: dict[asyncio.Task[NodeExecutionResult], tuple[str, float]] = {}
        completed: set[str] = set()
        try:
            while ready or active:
                if cancellation.is_set():
                    await self._cancel_active(active, states)
                    return self._result(
                        WorkflowRunStatus.CANCELLED,
                        states,
                        nodes,
                        started_at,
                        "Run cancelled.",
                    )

                while ready and len(active) < self._max_concurrency:
                    node_id = ready.pop(0)
                    queued.discard(node_id)
                    state = states[node_id]
                    state.state = NodeRunState.RUNNING
                    await self._emit(NodeTransition(node_id, NodeRunState.RUNNING))
                    task = asyncio.create_task(
                        self._execute(nodes[node_id], state.inputs, run_input, cancellation),
                        name=f"nodeflow:{node_id}",
                    )
                    active[task] = (node_id, monotonic())

                if not active:
                    break

                cancellation_waiter = asyncio.create_task(cancellation.wait())
                done, _ = await asyncio.wait(
                    [*active, cancellation_waiter], return_when=asyncio.FIRST_COMPLETED
                )
                if cancellation_waiter in done and cancellation.is_set():
                    await self._cancel_active(active, states)
                    return self._result(
                        WorkflowRunStatus.CANCELLED,
                        states,
                        nodes,
                        started_at,
                        "Run cancelled.",
                    )
                cancellation_waiter.cancel()
                await asyncio.gather(cancellation_waiter, return_exceptions=True)

                finished = sorted(
                    (
                        cast(asyncio.Task[NodeExecutionResult], task)
                        for task in done
                        if task in active
                    ),
                    key=lambda task: order[active[task][0]],
                )
                for task in finished:
                    node_id, node_started_at = active.pop(task)
                    state = states[node_id]
                    state.duration_ms = _duration_ms(node_started_at)
                    try:
                        state.result = task.result()
                        state.state = NodeRunState.COMPLETED
                    except asyncio.CancelledError:
                        state.state = NodeRunState.CANCELLED
                        state.reason = "Run cancelled while this node was active."
                        state.blocking_skip = True
                    except Exception as adapter_error:  # adapters are an isolation boundary
                        state.state = NodeRunState.FAILED
                        code = getattr(adapter_error, "code", "adapter_failed")
                        state.error_code = code if isinstance(code, str) else "adapter_failed"
                        state.error = str(adapter_error) or "Node adapter failed."
                        state.blocking_skip = True
                    completed.add(node_id)
                    await self._emit(
                        NodeTransition(node_id, state.state, state.freeze(node_id))
                    )

                propagated = True
                while propagated:
                    propagated = False
                    candidates = {
                        candidate
                        for source in completed
                        for candidate in dependents[source]
                        if candidate not in completed and candidate not in queued
                    }
                    for node_id in sorted(candidates, key=order.__getitem__):
                        if any(edge.source not in completed for edge in incoming[node_id]):
                            continue
                        decision = self._prepare_node(node_id, incoming[node_id], states, nodes)
                        if decision == "ready":
                            states[node_id].state = NodeRunState.QUEUED
                            ready.append(node_id)
                            ready.sort(key=order.__getitem__)
                            queued.add(node_id)
                            await self._emit(NodeTransition(node_id, NodeRunState.QUEUED))
                        elif decision == "skipped":
                            completed.add(node_id)
                            propagated = True
                            await self._emit(
                                NodeTransition(
                                    node_id,
                                    NodeRunState.SKIPPED,
                                    states[node_id].freeze(node_id),
                                )
                            )
            status = self._terminal_status(states, nodes)
            status_error = (
                None
                if status is WorkflowRunStatus.COMPLETED
                else "Required outputs unavailable."
            )
            return self._result(status, states, nodes, started_at, status_error)
        finally:
            for task in active:
                task.cancel()
            if active:
                await asyncio.gather(*active, return_exceptions=True)

    async def _execute(
        self,
        node: WorkflowNode,
        inputs: Mapping[str, tuple[JsonValue, ...]],
        run_input: JsonValue,
        cancellation: asyncio.Event,
    ) -> NodeExecutionResult:
        adapter = self._adapters.get(node.type)
        if adapter is None:
            raise RuntimeError(f"No adapter registered for node type {node.type!r}")
        return await adapter.execute(
            node,
            NodeExecutionContext(
                inputs=dict(inputs), run_input=run_input, cancellation=cancellation
            ),
        )

    def _prepare_node(
        self,
        node_id: str,
        edges: list[WorkflowEdge],
        states: Mapping[str, _MutableNodeState],
        nodes: Mapping[str, WorkflowNode],
    ) -> str:
        state = states[node_id]
        if any(states[edge.source].blocking_skip for edge in edges):
            state.state = NodeRunState.SKIPPED
            state.reason = "A required dependency failed or was cancelled."
            state.blocking_skip = True
            return "skipped"

        active_edges: list[WorkflowEdge] = []
        for edge in edges:
            source_state = states[edge.source]
            source_result = source_state.result
            if (
                source_state.state is NodeRunState.COMPLETED
                and source_result is not None
                and source_result.is_output_active(edge.source_handle)
            ):
                active_edges.append(edge)
        inputs: dict[str, list[JsonValue]] = defaultdict(list)
        for edge in active_edges:
            source_result = states[edge.source].result
            if source_result and edge.source_handle in source_result.outputs:
                inputs[edge.target_handle].append(source_result.outputs[edge.source_handle])

        required_handles = {
            port.id
            for port in NODE_PORTS[nodes[node_id].type]
            if port.direction.value == "input" and port.required
        }
        if any(not inputs[handle] for handle in required_handles):
            state.state = NodeRunState.SKIPPED
            state.reason = "No value arrived on an active required branch."
            state.blocking_skip = False
            return "skipped"
        state.inputs = {handle: tuple(values) for handle, values in sorted(inputs.items())}
        return "ready"

    async def _cancel_active(
        self,
        active: Mapping[asyncio.Task[NodeExecutionResult], tuple[str, float]],
        states: Mapping[str, _MutableNodeState],
    ) -> None:
        for task in active:
            task.cancel()
        if active:
            await asyncio.gather(*active, return_exceptions=True)
        for _, (node_id, started_at) in active.items():
            state = states[node_id]
            state.state = NodeRunState.CANCELLED
            state.duration_ms = _duration_ms(started_at)
            state.reason = "Run cancelled while this node was active."
            state.blocking_skip = True
            await self._emit(NodeTransition(node_id, state.state, state.freeze(node_id)))

    def _terminal_status(
        self, states: Mapping[str, _MutableNodeState], nodes: Mapping[str, WorkflowNode]
    ) -> WorkflowRunStatus:
        output_ids = [node_id for node_id, node in nodes.items() if node.type == "output"]
        outputs_completed = all(
            states[node_id].state is NodeRunState.COMPLETED for node_id in output_ids
        )
        if output_ids and outputs_completed:
            return WorkflowRunStatus.COMPLETED
        return WorkflowRunStatus.FAILED

    def _result(
        self,
        status: WorkflowRunStatus,
        states: Mapping[str, _MutableNodeState],
        nodes: Mapping[str, WorkflowNode],
        started_at: float,
        error: str | None,
    ) -> WorkflowRunResult:
        outputs: dict[str, JsonValue] = {}
        for node_id, node in nodes.items():
            if node.type != "output" or states[node_id].state is not NodeRunState.COMPLETED:
                continue
            values = states[node_id].inputs.get("value", ())
            if values:
                outputs[node.config.label] = values[0]
        return WorkflowRunResult(
            status=status,
            nodes={node_id: state.freeze(node_id) for node_id, state in sorted(states.items())},
            outputs=outputs,
            duration_ms=_duration_ms(started_at),
            error=error,
        )


def _duration_ms(started_at: float) -> int:
    return max(0, round((monotonic() - started_at) * 1_000))
