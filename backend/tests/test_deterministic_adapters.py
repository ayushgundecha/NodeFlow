import asyncio

import pytest
from pydantic import ValidationError

from app.models.workflow import WorkflowDefinition, WorkflowNode
from app.services.deterministic_adapters import (
    AdapterExecutionError,
    ConditionAdapter,
    DelayAdapter,
    ManualInputAdapter,
    MergeAdapter,
    OutputAdapter,
    TemplateAdapter,
    TransformAdapter,
    deterministic_adapters,
)
from app.services.scheduler import (
    NodeExecutionContext,
    NodeRunState,
    WorkflowRunStatus,
    WorkflowScheduler,
)
from app.services.workflow_validation import create_execution_plan


def make_node(node_type: str, config: dict[str, object], node_id: str = "node") -> WorkflowNode:
    workflow = WorkflowDefinition.model_validate(
        {
            "schemaVersion": "1.0",
            "id": "adapters.test",
            "name": "Adapter test",
            "nodes": [
                {
                    "id": node_id,
                    "type": node_type,
                    "position": {"x": 0, "y": 0},
                    "config": config,
                }
            ],
            "edges": [],
        }
    )
    return workflow.nodes[0]


def execute(
    adapter: object,
    node: WorkflowNode,
    *,
    inputs: dict[str, tuple[object, ...]] | None = None,
    run_input: object = None,
):
    context = NodeExecutionContext(
        inputs=inputs or {}, run_input=run_input, cancellation=asyncio.Event()
    )
    return asyncio.run(adapter.execute(node, context))


def test_manual_input_resolves_key_and_falls_back_to_default() -> None:
    node = make_node("manualInput", {"inputKey": "incident", "defaultValue": {"id": 1}})

    supplied = execute(ManualInputAdapter(), node, run_input={"incident": {"id": 2}})
    defaulted = execute(ManualInputAdapter(), node, run_input={"other": True})

    assert supplied.outputs == {"value": {"id": 2}}
    assert defaulted.outputs == {"value": {"id": 1}}


def test_template_renders_safe_paths_and_rejects_missing_or_unsafe_expressions() -> None:
    node = make_node("template", {"template": "Hello {{ input.user.name }} (#{{ input.id }})"})
    rendered = execute(
        TemplateAdapter(), node, inputs={"input": ({"user": {"name": "Ada"}, "id": 7},)}
    )

    assert rendered.outputs == {"output": "Hello Ada (#7)"}
    with pytest.raises(AdapterExecutionError, match="does not exist"):
        execute(TemplateAdapter(), node, inputs={"input": ({"id": 7},)})

    unsafe = make_node("template", {"template": "{{ input[user] }}"})
    with pytest.raises(AdapterExecutionError, match="safe dotted lookups"):
        execute(TemplateAdapter(), unsafe, inputs={"input": ({"user": "Ada"},)})


def test_transform_supports_paths_and_json_projections_without_eval() -> None:
    path = make_node("transform", {"expression": "@.user.name"})
    projection = make_node(
        "transform",
        {"expression": '{"name":"@.user.name","score":"@.metrics.0"}'},
    )
    incoming = {"user": {"name": "Ada"}, "metrics": [98]}

    assert execute(TransformAdapter(), path, inputs={"input": (incoming,)}).outputs == {
        "output": "Ada"
    }
    assert execute(TransformAdapter(), projection, inputs={"input": (incoming,)}).outputs == {
        "output": {"name": "Ada", "score": 98}
    }

    malformed = make_node("transform", {"expression": "input.user"})
    with pytest.raises(AdapterExecutionError) as error:
        execute(TransformAdapter(), malformed, inputs={"input": (incoming,)})
    assert error.value.code == "transform_invalid"


@pytest.mark.parametrize(
    ("operator", "expected_handle"),
    [("gte", "true"), ("lt", "false")],
)
def test_condition_activates_exactly_one_declarative_branch(
    operator: str, expected_handle: str
) -> None:
    node = make_node("condition", {"rule": {"path": "severity", "operator": operator, "value": 4}})

    result = execute(ConditionAdapter(), node, inputs={"input": ({"severity": 5},)})

    assert result.active_output_handles == frozenset({expected_handle})
    invalid = make_node(
        "condition", {"rule": {"path": "severity", "operator": "execute", "value": 4}}
    )
    with pytest.raises(AdapterExecutionError) as error:
        execute(ConditionAdapter(), invalid, inputs={"input": ({"severity": 5},)})
    assert error.value.code == "condition_operator_invalid"


def test_merge_is_ordered_and_object_conflicts_are_explicit() -> None:
    array_node = make_node("merge", {"strategy": "array"})
    object_node = make_node("merge", {"strategy": "object"})

    array = execute(MergeAdapter(), array_node, inputs={"items": (2, 1)})
    merged = execute(MergeAdapter(), object_node, inputs={"items": ({"a": 1}, {"b": 2})})

    assert array.outputs == {"output": [2, 1]}
    assert merged.outputs == {"output": {"a": 1, "b": 2}}
    with pytest.raises(AdapterExecutionError) as error:
        execute(MergeAdapter(), object_node, inputs={"items": ({"duplicate": 1}, {"duplicate": 2})})
    assert error.value.code == "merge_conflict"


def test_delay_is_bounded_and_output_validates_json_limits() -> None:
    delay = make_node("delay", {"milliseconds": 1})
    result = execute(DelayAdapter(), delay, inputs={"input": ("value",)})

    assert result.outputs == {"output": "value"}
    with pytest.raises(ValidationError, match="less than or equal to 30000"):
        make_node("delay", {"milliseconds": 30_001})

    output = make_node("output", {"label": "Result", "format": "json"})
    captured = execute(OutputAdapter(), output, inputs={"value": ({"ok": True},)})
    assert captured.outputs == {"value": {"ok": True}}
    with pytest.raises(AdapterExecutionError) as error:
        execute(OutputAdapter(), output, inputs={"value": ("x" * (257 * 1024),)})
    assert error.value.code == "output_invalid"


def test_all_deterministic_adapters_execute_one_real_workflow() -> None:
    workflow = WorkflowDefinition.model_validate(
        {
            "schemaVersion": "1.0",
            "id": "deterministic.e2e",
            "name": "Deterministic E2E",
            "nodes": [
                {
                    "id": "input",
                    "type": "manualInput",
                    "position": {"x": 0, "y": 0},
                    "config": {"inputKey": "payload", "defaultValue": {"score": 8}},
                },
                {
                    "id": "transform",
                    "type": "transform",
                    "position": {"x": 1, "y": 0},
                    "config": {"expression": "@.score"},
                },
                {
                    "id": "condition",
                    "type": "condition",
                    "position": {"x": 2, "y": 0},
                    "config": {"rule": {"path": "", "operator": "gte", "value": 5}},
                },
                {
                    "id": "delay",
                    "type": "delay",
                    "position": {"x": 3, "y": 0},
                    "config": {"milliseconds": 0},
                },
                {
                    "id": "output",
                    "type": "output",
                    "position": {"x": 4, "y": 0},
                    "config": {"label": "decision", "format": "json"},
                },
            ],
            "edges": [
                {
                    "id": "1",
                    "source": "input",
                    "sourceHandle": "value",
                    "target": "transform",
                    "targetHandle": "input",
                },
                {
                    "id": "2",
                    "source": "transform",
                    "sourceHandle": "output",
                    "target": "condition",
                    "targetHandle": "input",
                },
                {
                    "id": "3",
                    "source": "condition",
                    "sourceHandle": "true",
                    "target": "delay",
                    "targetHandle": "input",
                },
                {
                    "id": "4",
                    "source": "delay",
                    "sourceHandle": "output",
                    "target": "output",
                    "targetHandle": "value",
                },
            ],
        }
    )

    result = asyncio.run(
        WorkflowScheduler(deterministic_adapters()).run(create_execution_plan(workflow))
    )

    assert result.status is WorkflowRunStatus.COMPLETED
    assert result.nodes["output"].state is NodeRunState.COMPLETED
    assert result.outputs == {"decision": 8}
