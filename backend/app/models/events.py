"""Immutable run-event contracts streamed by the execution API."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, TypeAlias

from pydantic import Field, model_validator

from .base import ContractModel, JsonValue


class RunEventBase(ContractModel):
    run_id: str = Field(min_length=1, max_length=120)
    sequence: int = Field(ge=0)
    occurred_at: datetime


class RunStartedEvent(RunEventBase):
    type: Literal["run.started"] = "run.started"
    client_run_id: str = Field(min_length=1, max_length=120)


class NodeEventBase(RunEventBase):
    node_id: str = Field(min_length=1, max_length=120)


class NodeQueuedEvent(NodeEventBase):
    type: Literal["node.queued"] = "node.queued"


class NodeStartedEvent(NodeEventBase):
    type: Literal["node.started"] = "node.started"
    input: JsonValue = None


class NodeLogEvent(NodeEventBase):
    type: Literal["node.log"] = "node.log"
    stream: Literal["stdout", "stderr", "system"] = "system"
    message: str = Field(max_length=32_768)
    truncated: bool = False


class NodeCompletedEvent(NodeEventBase):
    type: Literal["node.completed"] = "node.completed"
    output: JsonValue = None
    duration_ms: int = Field(ge=0)


class RunError(ContractModel):
    code: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=1_000)
    retryable: bool = False


class NodeFailedEvent(NodeEventBase):
    type: Literal["node.failed"] = "node.failed"
    error: RunError
    duration_ms: int = Field(ge=0)


class NodeSkippedEvent(NodeEventBase):
    type: Literal["node.skipped"] = "node.skipped"
    reason: str = Field(min_length=1, max_length=500)


class RunCompletedEvent(RunEventBase):
    type: Literal["run.completed"] = "run.completed"
    outputs: dict[str, JsonValue] = Field(default_factory=dict)
    duration_ms: int = Field(ge=0)


class RunFailedEvent(RunEventBase):
    type: Literal["run.failed"] = "run.failed"
    error: RunError
    duration_ms: int = Field(ge=0)


RunEvent: TypeAlias = Annotated[
    RunStartedEvent
    | NodeQueuedEvent
    | NodeStartedEvent
    | NodeLogEvent
    | NodeCompletedEvent
    | NodeFailedEvent
    | NodeSkippedEvent
    | RunCompletedEvent
    | RunFailedEvent,
    Field(discriminator="type"),
]


class RunEventStream(ContractModel):
    """A replayable event sequence with strict ordering and run ownership."""

    events: list[RunEvent] = Field(default_factory=list, max_length=1_000)

    @model_validator(mode="after")
    def validate_sequence(self) -> RunEventStream:
        if not self.events:
            return self

        expected_run_id = self.events[0].run_id
        for expected_sequence, event in enumerate(self.events):
            if event.run_id != expected_run_id:
                raise ValueError("All events in a stream must belong to the same runId")
            if event.sequence != expected_sequence:
                raise ValueError(
                    "Run event sequences must be contiguous, unique, and start at zero"
                )
        return self
