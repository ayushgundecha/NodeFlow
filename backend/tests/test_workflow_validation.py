from copy import deepcopy

import pytest

from app.models.workflow import WorkflowDefinition
from app.services.workflow_validation import (
    InvalidWorkflowError,
    create_execution_plan,
    validate_workflow,
    validate_workflow_payload,
)


def node(node_id: str, node_type: str) -> dict[str, object]:
    configs: dict[str, dict[str, object]] = {
        "manualInput": {"inputKey": "payload", "defaultValue": None},
        "template": {"template": "{{ input }}"},
        "transform": {"expression": "@"},
        "condition": {"rule": {}},
        "output": {"label": "Result", "format": "json"},
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


def workflow_payload() -> dict[str, object]:
    return {
        "schemaVersion": "1.0",
        "id": "workflow.test",
        "name": "Test workflow",
        "nodes": [
            node("input.b", "manualInput"),
            node("input.a", "manualInput"),
            node("transform", "transform"),
            node("output", "output"),
        ],
        "edges": [
            edge("edge.a", "input.a", "value", "transform", "input"),
            edge("edge.b", "transform", "output", "output", "value"),
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }


def error_codes(payload: dict[str, object]) -> list[str]:
    result = validate_workflow(WorkflowDefinition.model_validate(payload))
    return [item.code for item in result.errors]


def test_valid_workflow_produces_deterministic_layers_without_mutation() -> None:
    payload = workflow_payload()
    workflow = WorkflowDefinition.model_validate(payload)
    before = workflow.model_dump(mode="json", by_alias=True)

    result = validate_workflow(workflow)
    plan = create_execution_plan(workflow)

    assert result.valid is True
    assert result.execution_order == [["input.a", "input.b"], ["transform"], ["output"]]
    assert plan.layers == (("input.a", "input.b"), ("transform",), ("output",))
    assert workflow.model_dump(mode="json", by_alias=True) == before
    assert plan.workflow is not workflow


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (
            lambda value: value["nodes"].append(deepcopy(value["nodes"][0])),
            "duplicate_node_id",
        ),
        (
            lambda value: value["edges"].append({**deepcopy(value["edges"][0]), "id": "edge.a"}),
            "duplicate_edge_id",
        ),
        (
            lambda value: value["edges"].append({**deepcopy(value["edges"][0]), "id": "edge.copy"}),
            "duplicate_edge",
        ),
        (lambda value: value["edges"][0].update(source="missing"), "unknown_source_node"),
        (lambda value: value["edges"][0].update(sourceHandle="missing"), "unknown_source_handle"),
        (lambda value: value["edges"][0].update(targetHandle="missing"), "unknown_target_handle"),
        (lambda value: value["edges"].pop(1), "required_input_missing"),
    ],
)
def test_structural_errors_are_actionable_and_stable(mutate: object, expected: str) -> None:
    payload = workflow_payload()
    mutate(payload)  # type: ignore[operator]

    first = validate_workflow(WorkflowDefinition.model_validate(payload))
    second = validate_workflow(WorkflowDefinition.model_validate(payload))

    assert expected in [item.code for item in first.errors]
    assert first == second
    assert all(item.message for item in first.errors)
    assert first.execution_order == []


def test_incompatible_ports_cycle_and_unreachable_output_are_reported() -> None:
    payload = workflow_payload()
    payload["nodes"] = [
        node("template", "template"),
        node("transform", "transform"),
        node("output", "output"),
    ]
    payload["edges"] = [
        edge("wrong", "template", "output", "transform", "input"),
        edge("to-output", "transform", "output", "output", "value"),
        edge("cycle", "transform", "output", "template", "input"),
    ]

    codes = error_codes(payload)

    assert "incompatible_port_types" in codes
    assert "graph_cycle" in codes
    assert "required_output_unreachable" in codes


def test_public_demo_limits_return_structured_errors() -> None:
    payload = workflow_payload()
    payload["nodes"] = [node(f"input.{index}", "manualInput") for index in range(26)]
    payload["edges"] = [
        edge(f"edge.{index}", "input.0", "value", "output", "value") for index in range(41)
    ]

    assert {"graph_node_limit", "graph_edge_limit"}.issubset(error_codes(payload))


def test_invalid_workflow_cannot_become_an_execution_plan() -> None:
    payload = workflow_payload()
    payload["edges"].pop()

    with pytest.raises(InvalidWorkflowError) as error:
        create_execution_plan(WorkflowDefinition.model_validate(payload))

    assert error.value.result.valid is False


def test_contract_and_schema_failures_use_structured_canvas_errors() -> None:
    unsupported = validate_workflow_payload({**workflow_payload(), "schemaVersion": "9.0"})
    invalid_config = workflow_payload()
    invalid_config["nodes"][2]["config"] = {"expression": ""}

    config_result = validate_workflow_payload(invalid_config)

    assert unsupported.errors[0].code == "schema_version_unsupported"
    assert unsupported.errors[0].field == "schemaVersion"
    assert config_result.errors[0].code == "node_config_invalid"
    assert config_result.errors[0].node_id == "transform"
    assert config_result.errors[0].field == "nodes.config.expression"
