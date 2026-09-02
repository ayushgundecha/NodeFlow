"""Version 1 workflow, validation, and run-request contracts."""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, TypeAlias

from pydantic import Field, field_validator

from .base import ContractModel, JsonValue

SCHEMA_VERSION: Literal["1.0"] = "1.0"
IDENTIFIER_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]*$"


class Position(ContractModel):
    x: float
    y: float


class Viewport(Position):
    zoom: float = Field(default=1.0, gt=0, le=4)


class PortDirection(str, Enum):
    INPUT = "input"
    OUTPUT = "output"


class PortDataType(str, Enum):
    ANY = "any"
    JSON = "json"
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"


class PortDefinition(ContractModel):
    id: str = Field(min_length=1, max_length=80, pattern=IDENTIFIER_PATTERN)
    label: str = Field(min_length=1, max_length=80)
    direction: PortDirection
    data_type: PortDataType
    required: bool = True
    multiple: bool = False


class ManualInputConfig(ContractModel):
    input_key: str = Field(default="payload", min_length=1, max_length=80)
    default_value: JsonValue = None


class TemplateConfig(ContractModel):
    template: str = Field(default="", max_length=10_000)


class HttpRequestConfig(ContractModel):
    method: Literal["GET", "POST"] = "GET"
    url: str = Field(default="", max_length=2_048)
    headers: dict[str, str] = Field(default_factory=dict)
    body: JsonValue = None


class TransformConfig(ContractModel):
    expression: str = Field(default="@", min_length=1, max_length=2_000)


class ConditionConfig(ContractModel):
    rule: dict[str, JsonValue] = Field(default_factory=dict)


class MergeConfig(ContractModel):
    strategy: Literal["object", "array"] = "object"


class JavaScriptConfig(ContractModel):
    source: str = Field(
        default="return input;",
        min_length=1,
        max_length=10_000,
    )


class DelayConfig(ContractModel):
    milliseconds: int = Field(default=0, ge=0, le=3_000)


class LlmConfig(ContractModel):
    system_prompt: str = Field(default="", max_length=2_000)
    prompt_template: str = Field(default="", min_length=1, max_length=4_000)


class OutputConfig(ContractModel):
    label: str = Field(default="Result", min_length=1, max_length=80)
    format: Literal["json", "text"] = "json"


class WorkflowNodeBase(ContractModel):
    id: str = Field(min_length=1, max_length=120, pattern=IDENTIFIER_PATTERN)
    position: Position
    label: str | None = Field(default=None, max_length=120)


class ManualInputNode(WorkflowNodeBase):
    type: Literal["manualInput"] = "manualInput"
    config: ManualInputConfig = Field(default_factory=ManualInputConfig)


class TemplateNode(WorkflowNodeBase):
    type: Literal["template"] = "template"
    config: TemplateConfig = Field(default_factory=TemplateConfig)


class HttpRequestNode(WorkflowNodeBase):
    type: Literal["httpRequest"] = "httpRequest"
    config: HttpRequestConfig = Field(default_factory=HttpRequestConfig)


class TransformNode(WorkflowNodeBase):
    type: Literal["transform"] = "transform"
    config: TransformConfig = Field(default_factory=TransformConfig)


class ConditionNode(WorkflowNodeBase):
    type: Literal["condition"] = "condition"
    config: ConditionConfig = Field(default_factory=ConditionConfig)


class MergeNode(WorkflowNodeBase):
    type: Literal["merge"] = "merge"
    config: MergeConfig = Field(default_factory=MergeConfig)


class JavaScriptNode(WorkflowNodeBase):
    type: Literal["javascript"] = "javascript"
    config: JavaScriptConfig = Field(default_factory=JavaScriptConfig)


class DelayNode(WorkflowNodeBase):
    type: Literal["delay"] = "delay"
    config: DelayConfig = Field(default_factory=DelayConfig)


class LlmNode(WorkflowNodeBase):
    type: Literal["llm"] = "llm"
    config: LlmConfig = Field(default_factory=LlmConfig)


class OutputNode(WorkflowNodeBase):
    type: Literal["output"] = "output"
    config: OutputConfig = Field(default_factory=OutputConfig)


WorkflowNode: TypeAlias = Annotated[
    ManualInputNode
    | TemplateNode
    | HttpRequestNode
    | TransformNode
    | ConditionNode
    | MergeNode
    | JavaScriptNode
    | DelayNode
    | LlmNode
    | OutputNode,
    Field(discriminator="type"),
]


class WorkflowEdge(ContractModel):
    id: str = Field(min_length=1, max_length=160, pattern=IDENTIFIER_PATTERN)
    source: str = Field(min_length=1, max_length=120, pattern=IDENTIFIER_PATTERN)
    source_handle: str = Field(min_length=1, max_length=80, pattern=IDENTIFIER_PATTERN)
    target: str = Field(min_length=1, max_length=120, pattern=IDENTIFIER_PATTERN)
    target_handle: str = Field(min_length=1, max_length=80, pattern=IDENTIFIER_PATTERN)


class WorkflowDefinition(ContractModel):
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    nodes: list[WorkflowNode] = Field(default_factory=list, max_length=25)
    edges: list[WorkflowEdge] = Field(default_factory=list, max_length=40)
    viewport: Viewport = Field(default_factory=lambda: Viewport(x=0, y=0, zoom=1))

    @field_validator("schema_version", mode="before")
    @classmethod
    def reject_unknown_schema_versions(cls, value: object) -> object:
        if value != SCHEMA_VERSION:
            raise ValueError(
                f"Unsupported schemaVersion {value!r}; supported version is {SCHEMA_VERSION!r}"
            )
        return value


class ValidationSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"


class ValidationIssue(ContractModel):
    code: str = Field(min_length=1, max_length=80)
    severity: ValidationSeverity
    message: str = Field(min_length=1, max_length=500)
    node_id: str | None = None
    edge_id: str | None = None
    field: str | None = None


class ValidationResult(ContractModel):
    valid: bool
    errors: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[ValidationIssue] = Field(default_factory=list)
    execution_order: list[list[str]] = Field(default_factory=list)


class RunRequest(ContractModel):
    workflow: WorkflowDefinition
    input: JsonValue = None
    client_run_id: str = Field(min_length=1, max_length=120)


class ContractCatalog(ContractModel):
    """Schema-only envelope that keeps all public contract types discoverable."""

    workflow: WorkflowDefinition
    validation: ValidationResult
    run_request: RunRequest
    port: PortDefinition
