"""Pure validation and deterministic planning for NodeFlow workflows."""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any

from pydantic import ValidationError

from ..models.base import to_camel
from ..models.migrations import UnsupportedSchemaVersion, migrate_workflow_payload
from ..models.workflow import (
    PortDataType,
    PortDefinition,
    PortDirection,
    ValidationIssue,
    ValidationResult,
    ValidationSeverity,
    WorkflowDefinition,
    WorkflowNode,
)

MAX_WORKFLOW_NODES = 25
MAX_WORKFLOW_EDGES = 40


def _input(
    port_id: str,
    data_type: PortDataType,
    *,
    required: bool = True,
    multiple: bool = False,
) -> PortDefinition:
    return PortDefinition(
        id=port_id,
        label=port_id.replace("_", " ").title(),
        direction=PortDirection.INPUT,
        data_type=data_type,
        required=required,
        multiple=multiple,
    )


def _output(port_id: str, data_type: PortDataType) -> PortDefinition:
    return PortDefinition(
        id=port_id,
        label=port_id.replace("_", " ").title(),
        direction=PortDirection.OUTPUT,
        data_type=data_type,
    )


NODE_PORTS: Mapping[str, tuple[PortDefinition, ...]] = MappingProxyType(
    {
        "manualInput": (_output("value", PortDataType.JSON),),
        "template": (
            _input("input", PortDataType.ANY, required=False),
            _output("output", PortDataType.STRING),
        ),
        "httpRequest": (
            _input("body", PortDataType.JSON, required=False),
            _output("response", PortDataType.JSON),
        ),
        "transform": (
            _input("input", PortDataType.JSON),
            _output("output", PortDataType.JSON),
        ),
        "condition": (
            _input("input", PortDataType.ANY),
            _output("true", PortDataType.ANY),
            _output("false", PortDataType.ANY),
        ),
        "merge": (
            _input("items", PortDataType.JSON, multiple=True),
            _output("output", PortDataType.JSON),
        ),
        "javascript": (
            _input("input", PortDataType.ANY, required=False),
            _output("output", PortDataType.ANY),
        ),
        "delay": (
            _input("input", PortDataType.ANY),
            _output("output", PortDataType.ANY),
        ),
        "llm": (
            _input("context", PortDataType.JSON, required=False),
            _output("response", PortDataType.JSON),
        ),
        "output": (_input("value", PortDataType.ANY),),
    }
)


@dataclass(frozen=True, slots=True)
class ExecutionPlan:
    """Immutable scheduler input produced only for a valid workflow."""

    workflow: WorkflowDefinition
    layers: tuple[tuple[str, ...], ...]


def _issue(
    code: str,
    message: str,
    *,
    node_id: str | None = None,
    edge_id: str | None = None,
    field: str | None = None,
) -> ValidationIssue:
    return ValidationIssue(
        code=code,
        severity=ValidationSeverity.ERROR,
        message=message,
        node_id=node_id,
        edge_id=edge_id,
        field=field,
    )


def _port(node: WorkflowNode, port_id: str, direction: PortDirection) -> PortDefinition | None:
    return next(
        (
            port
            for port in NODE_PORTS[node.type]
            if port.id == port_id and port.direction is direction
        ),
        None,
    )


def _compatible(source: PortDataType, target: PortDataType) -> bool:
    return source is PortDataType.ANY or target is PortDataType.ANY or source is target


def _topological_layers(
    node_ids: set[str], edges: set[tuple[str, str]]
) -> tuple[tuple[tuple[str, ...], ...], set[str]]:
    adjacency: dict[str, set[str]] = defaultdict(set)
    in_degree = dict.fromkeys(node_ids, 0)
    for source, target in edges:
        if source not in node_ids or target not in node_ids:
            continue
        if target not in adjacency[source]:
            adjacency[source].add(target)
            in_degree[target] += 1

    current = sorted(node_id for node_id, degree in in_degree.items() if degree == 0)
    layers: list[tuple[str, ...]] = []
    visited: set[str] = set()
    while current:
        layer = tuple(current)
        layers.append(layer)
        next_nodes: set[str] = set()
        for node_id in layer:
            visited.add(node_id)
            for neighbor in sorted(adjacency[node_id]):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    next_nodes.add(neighbor)
        current = sorted(next_nodes)
    return tuple(layers), visited


def validate_workflow(workflow: WorkflowDefinition) -> ValidationResult:
    """Validate without mutating the submitted definition and return a stable result."""

    issues: list[ValidationIssue] = []
    node_counts = Counter(node.id for node in workflow.nodes)
    edge_id_counts = Counter(edge.id for edge in workflow.edges)
    nodes = {node.id: node for node in workflow.nodes}

    if len(workflow.nodes) > MAX_WORKFLOW_NODES:
        issues.append(
            _issue(
                "graph_node_limit",
                f"Workflow has {len(workflow.nodes)} nodes; "
                f"the public demo allows {MAX_WORKFLOW_NODES}.",
                field="nodes",
            )
        )
    if len(workflow.edges) > MAX_WORKFLOW_EDGES:
        issues.append(
            _issue(
                "graph_edge_limit",
                f"Workflow has {len(workflow.edges)} edges; "
                f"the public demo allows {MAX_WORKFLOW_EDGES}.",
                field="edges",
            )
        )

    for node_id, count in node_counts.items():
        if count > 1:
            issues.append(
                _issue(
                    "duplicate_node_id",
                    f"Node ID {node_id!r} is used {count} times. Give every node a unique ID.",
                    node_id=node_id,
                    field="id",
                )
            )
    for edge_id, count in edge_id_counts.items():
        if count > 1:
            issues.append(
                _issue(
                    "duplicate_edge_id",
                    f"Edge ID {edge_id!r} is used {count} times. Give every edge a unique ID.",
                    edge_id=edge_id,
                    field="id",
                )
            )

    connection_counts: Counter[tuple[str, str]] = Counter()
    endpoint_counts: Counter[tuple[str, str, str, str]] = Counter()
    graph_edges: set[tuple[str, str]] = set()
    for edge in workflow.edges:
        endpoint = (edge.source, edge.source_handle, edge.target, edge.target_handle)
        endpoint_counts[endpoint] += 1
        connection_counts[(edge.target, edge.target_handle)] += 1
        source = nodes.get(edge.source)
        target = nodes.get(edge.target)
        if source is None:
            issues.append(
                _issue(
                    "unknown_source_node",
                    f"Source node {edge.source!r} does not exist. Reconnect or remove this edge.",
                    edge_id=edge.id,
                    field="source",
                )
            )
        if target is None:
            issues.append(
                _issue(
                    "unknown_target_node",
                    f"Target node {edge.target!r} does not exist. Reconnect or remove this edge.",
                    edge_id=edge.id,
                    field="target",
                )
            )
        if source is None or target is None:
            continue

        source_port = _port(source, edge.source_handle, PortDirection.OUTPUT)
        target_port = _port(target, edge.target_handle, PortDirection.INPUT)
        if source_port is None:
            issues.append(
                _issue(
                    "unknown_source_handle",
                    f"Node {source.id!r} has no output handle {edge.source_handle!r}.",
                    node_id=source.id,
                    edge_id=edge.id,
                    field="sourceHandle",
                )
            )
        if target_port is None:
            issues.append(
                _issue(
                    "unknown_target_handle",
                    f"Node {target.id!r} has no input handle {edge.target_handle!r}.",
                    node_id=target.id,
                    edge_id=edge.id,
                    field="targetHandle",
                )
            )
        if source_port and target_port and not _compatible(
            source_port.data_type, target_port.data_type
        ):
            issues.append(
                _issue(
                    "incompatible_port_types",
                    f"Cannot connect {source_port.data_type.value} output to "
                    f"{target_port.data_type.value} input.",
                    node_id=target.id,
                    edge_id=edge.id,
                    field="targetHandle",
                )
            )
        graph_edges.add((edge.source, edge.target))

    for endpoint, count in endpoint_counts.items():
        if count > 1:
            duplicate = next(
                edge
                for edge in workflow.edges
                if (edge.source, edge.source_handle, edge.target, edge.target_handle) == endpoint
            )
            issues.append(
                _issue(
                    "duplicate_edge",
                    "The same port-to-port connection is defined more than once. "
                    "Remove duplicates.",
                    edge_id=duplicate.id,
                )
            )

    for node in workflow.nodes:
        for port in NODE_PORTS[node.type]:
            if port.direction is not PortDirection.INPUT:
                continue
            count = connection_counts[(node.id, port.id)]
            if port.required and count == 0:
                issues.append(
                    _issue(
                        "required_input_missing",
                        f"Connect the required {port.label!r} input before running this node.",
                        node_id=node.id,
                        field=port.id,
                    )
                )
            if not port.multiple and count > 1:
                issues.append(
                    _issue(
                        "input_connection_limit",
                        f"Input {port.label!r} accepts one connection, but received {count}.",
                        node_id=node.id,
                        field=port.id,
                    )
                )

    layers, visited = _topological_layers(set(nodes), graph_edges)
    cycle_nodes = set(nodes) - visited
    if cycle_nodes:
        issues.append(
            _issue(
                "graph_cycle",
                "Workflow contains a cycle involving: "
                + ", ".join(sorted(cycle_nodes))
                + ". Remove at least one connection to continue.",
                node_id=min(cycle_nodes),
            )
        )

    for node in workflow.nodes:
        if node.type == "output" and node.id not in visited:
            issues.append(
                _issue(
                    "required_output_unreachable",
                    "This output cannot be reached from an executable workflow root.",
                    node_id=node.id,
                )
            )

    ordered_issues = sorted(
        issues,
        key=lambda issue: (
            issue.code,
            issue.node_id or "",
            issue.edge_id or "",
            issue.field or "",
            issue.message,
        ),
    )
    valid = not ordered_issues
    return ValidationResult(
        valid=valid,
        errors=ordered_issues,
        execution_order=[list(layer) for layer in layers] if valid else [],
    )


def create_execution_plan(workflow: WorkflowDefinition) -> ExecutionPlan:
    """Return scheduler input or raise with the structured validation result."""

    result = validate_workflow(workflow)
    if not result.valid:
        raise InvalidWorkflowError(result)
    return ExecutionPlan(
        workflow=workflow.model_copy(deep=True),
        layers=tuple(map(tuple, result.execution_order)),
    )


class InvalidWorkflowError(ValueError):
    """Raised when code attempts to plan an invalid workflow."""

    def __init__(self, result: ValidationResult) -> None:
        self.result = result
        super().__init__(f"Workflow validation failed with {len(result.errors)} error(s)")


def _payload_identifier(payload: Mapping[str, Any], collection: str, index: int) -> str | None:
    items = payload.get(collection)
    if not isinstance(items, list) or index >= len(items):
        return None
    item = items[index]
    if not isinstance(item, dict):
        return None
    identifier = item.get("id")
    return identifier if isinstance(identifier, str) else None


def _contract_issue(payload: Mapping[str, Any], error: Mapping[str, Any]) -> ValidationIssue:
    location = tuple(error.get("loc", ()))
    node_id: str | None = None
    edge_id: str | None = None
    if len(location) > 1 and location[0] == "nodes" and isinstance(location[1], int):
        node_id = _payload_identifier(payload, "nodes", location[1])
    if len(location) > 1 and location[0] == "edges" and isinstance(location[1], int):
        edge_id = _payload_identifier(payload, "edges", location[1])

    field_parts = [
        to_camel(str(part))
        for part in location
        if not isinstance(part, int) and part not in NODE_PORTS
    ]
    field = ".".join(field_parts) or None
    is_node_config = "config" in location
    code = "node_config_invalid" if is_node_config else "workflow_contract_invalid"
    target = f"Node {node_id!r}" if node_id else "Workflow definition"
    return _issue(
        code,
        f"{target} has an invalid {field or 'value'}. Correct it and validate again.",
        node_id=node_id,
        edge_id=edge_id,
        field=field,
    )


def validate_workflow_payload(payload: Mapping[str, Any]) -> ValidationResult:
    """Validate the versioned contract and graph through one authoritative boundary."""

    try:
        workflow = migrate_workflow_payload(payload)
    except UnsupportedSchemaVersion:
        return ValidationResult(
            valid=False,
            errors=[
                _issue(
                    "schema_version_unsupported",
                    "Use schemaVersion '1.0' or migrate this workflow before running it.",
                    field="schemaVersion",
                )
            ],
        )
    except ValidationError as error:
        issues = [_contract_issue(payload, item) for item in error.errors()]
        unique = {
            (issue.code, issue.node_id, issue.edge_id, issue.field, issue.message): issue
            for issue in issues
        }
        return ValidationResult(
            valid=False,
            errors=sorted(
                unique.values(),
                key=lambda issue: (
                    issue.code,
                    issue.node_id or "",
                    issue.edge_id or "",
                    issue.field or "",
                ),
            ),
        )
    return validate_workflow(workflow)
