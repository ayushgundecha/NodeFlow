"""Ordered SSE projection for genuine scheduler transitions."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
from collections.abc import AsyncIterator, Mapping
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Request

from ..models.base import JsonValue
from ..models.events import (
    NodeCompletedEvent,
    NodeFailedEvent,
    NodeLogEvent,
    NodeQueuedEvent,
    NodeSkippedEvent,
    NodeStartedEvent,
    RunCompletedEvent,
    RunError,
    RunEvent,
    RunFailedEvent,
    RunStartedEvent,
)
from ..models.workflow import RunRequest
from .deterministic_adapters import deterministic_adapters
from .observability import json_size, log_runtime_event
from .rate_limits import SlidingWindowRateLimiter
from .scheduler import (
    NodeRunState,
    NodeTransition,
    RunTerminalTransition,
    SchedulerTransition,
    WorkflowRunStatus,
    WorkflowScheduler,
)
from .workflow_validation import InvalidWorkflowError, create_execution_plan

HEARTBEAT_SECONDS = 10.0
WORKFLOW_RUNS_PER_HOUR = 20
WORKFLOW_RUN_LIMITER = SlidingWindowRateLimiter(WORKFLOW_RUNS_PER_HOUR, 60 * 60)


def anonymous_rate_key(request: Request) -> str:
    if os.environ.get("VERCEL"):
        address = request.headers.get("x-vercel-forwarded-for", "unknown").split(",", 1)[0]
    else:
        address = request.client.host if request.client else "unknown"
    salt = os.environ.get("NODEFLOW_RATE_LIMIT_SALT", "nodeflow-local-development")
    return hmac.new(salt.encode(), address.strip().encode(), hashlib.sha256).hexdigest()


class RunEventSequence:
    """Single-run event factory that owns contiguous sequence allocation."""

    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        self._next = 0

    def fields(self) -> dict[str, object]:
        fields: dict[str, object] = {
            "run_id": self.run_id,
            "sequence": self._next,
            "occurred_at": datetime.now(timezone.utc),
        }
        self._next += 1
        return fields


def encode_sse(event: RunEvent) -> str:
    data = json.dumps(
        event.model_dump(mode="json", by_alias=True),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return f"id: {event.sequence}\nevent: {event.type}\ndata: {data}\n\n"


def _node_output(transition: NodeTransition) -> JsonValue:
    record = transition.record
    if record is None or not record.outputs:
        return None
    if len(record.outputs) == 1:
        return next(iter(record.outputs.values()))
    return dict(record.outputs)


def _transition_events(
    transition: SchedulerTransition,
    sequence: RunEventSequence,
    node_types: Mapping[str, str],
) -> list[RunEvent]:
    if isinstance(transition, RunTerminalTransition):
        result = transition.result
        if result.status is WorkflowRunStatus.COMPLETED:
            return [
                RunCompletedEvent(
                    **sequence.fields(),
                    outputs=dict(result.outputs),
                    duration_ms=result.duration_ms,
                )
            ]
        codes = {
            WorkflowRunStatus.CANCELLED: "run_cancelled",
            WorkflowRunStatus.TIMED_OUT: "run_timed_out",
            WorkflowRunStatus.FAILED: "workflow_failed",
        }
        return [
            RunFailedEvent(
                **sequence.fields(),
                error=RunError(
                    code=codes[result.status],
                    message=result.error or "Workflow execution failed.",
                ),
                duration_ms=result.duration_ms,
            )
        ]

    node_id = transition.node_id
    record = transition.record
    if transition.state is NodeRunState.QUEUED:
        return [NodeQueuedEvent(**sequence.fields(), node_id=node_id)]
    if transition.state is NodeRunState.RUNNING:
        inputs = dict(record.inputs) if record else {}
        started = NodeStartedEvent(**sequence.fields(), node_id=node_id, input=inputs)
        log = NodeLogEvent(
            **sequence.fields(),
            node_id=node_id,
            message=f"Executing {node_types[node_id]} adapter.",
        )
        return [started, log]
    if transition.state is NodeRunState.COMPLETED and record:
        logs = [
            NodeLogEvent(
                **sequence.fields(),
                node_id=node_id,
                stream="stdout",
                message=message,
                truncated=message.endswith("[output truncated]"),
            )
            for message in record.logs
            if message
        ]
        return [
            *logs,
            NodeCompletedEvent(
                **sequence.fields(),
                node_id=node_id,
                output=_node_output(transition),
                duration_ms=record.duration_ms,
            ),
        ]
    if transition.state is NodeRunState.FAILED and record:
        return [
            NodeFailedEvent(
                **sequence.fields(),
                node_id=node_id,
                error=RunError(
                    code=record.error_code or "adapter_failed",
                    message=record.error or "Node adapter failed.",
                ),
                duration_ms=record.duration_ms,
            )
        ]
    if transition.state in {NodeRunState.SKIPPED, NodeRunState.CANCELLED} and record:
        return [
            NodeSkippedEvent(
                **sequence.fields(),
                node_id=node_id,
                reason=record.reason or "Node was not executed.",
            )
        ]
    return []


async def stream_run(
    run_request: RunRequest, request: Request, *, request_id: str
) -> AsyncIterator[str]:
    """Run a workflow and stream its only authoritative visual state."""

    run_id = f"run_{uuid4().hex}"
    sequence = RunEventSequence(run_id)
    log_runtime_event(
        request_id=request_id,
        run_id=run_id,
        status="started",
        payload_size=json_size(run_request.input),
    )
    yield encode_sse(RunStartedEvent(**sequence.fields(), client_run_id=run_request.client_run_id))
    rate_key = anonymous_rate_key(request)
    if not WORKFLOW_RUN_LIMITER.allow(rate_key):
        log_runtime_event(
            request_id=request_id,
            run_id=run_id,
            status="failed",
            error_code="workflow_rate_limited",
        )
        yield encode_sse(
            RunFailedEvent(
                **sequence.fields(),
                error=RunError(
                    code="workflow_rate_limited",
                    message="This visitor has reached the 20-per-hour workflow demo limit.",
                ),
                duration_ms=0,
            )
        )
        return

    try:
        plan = create_execution_plan(run_request.workflow)
    except InvalidWorkflowError as error:
        log_runtime_event(
            request_id=request_id,
            run_id=run_id,
            status="failed",
            error_code="workflow_invalid",
        )
        yield encode_sse(
            RunFailedEvent(
                **sequence.fields(),
                error=RunError(
                    code="workflow_invalid",
                    message=f"Workflow has {len(error.result.errors)} validation error(s).",
                ),
                duration_ms=0,
            )
        )
        return

    queue: asyncio.Queue[RunEvent] = asyncio.Queue()
    cancellation = asyncio.Event()
    node_types = {node.id: node.type for node in plan.workflow.nodes}

    async def observe(transition: SchedulerTransition) -> None:
        if isinstance(transition, RunTerminalTransition):
            result = transition.result
            log_runtime_event(
                request_id=request_id,
                run_id=run_id,
                status=result.status.value,
                duration_ms=result.duration_ms,
                payload_size=json_size(result.outputs),
                error_code=(
                    None if result.status is WorkflowRunStatus.COMPLETED else result.status.value
                ),
            )
        else:
            record = transition.record
            log_runtime_event(
                request_id=request_id,
                run_id=run_id,
                node_type=node_types[transition.node_id],
                status=transition.state.value,
                duration_ms=record.duration_ms if record else None,
                payload_size=json_size(
                    record.outputs
                    if record and record.outputs
                    else record.inputs
                    if record
                    else None
                ),
                error_code=record.error_code if record else None,
            )
        for event in _transition_events(transition, sequence, node_types):
            await queue.put(event)

    scheduler = WorkflowScheduler(deterministic_adapters(), observer=observe)
    run_task = asyncio.create_task(
        scheduler.run(
            plan,
            run_input=run_request.input,
            cancellation=cancellation,
            rate_key=rate_key,
        ),
        name=f"nodeflow:{run_id}",
    )
    terminal_seen = False
    try:
        while not terminal_seen:
            if await request.is_disconnected():
                cancellation.set()
            try:
                event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
            except TimeoutError:
                yield ": heartbeat\n\n"
                continue
            terminal_seen = event.type in {"run.completed", "run.failed"}
            yield encode_sse(event)
        await run_task
    finally:
        if not run_task.done():
            cancellation.set()
            try:
                await asyncio.wait_for(run_task, timeout=1)
            except TimeoutError:
                run_task.cancel()
                await asyncio.gather(run_task, return_exceptions=True)
