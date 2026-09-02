from copy import deepcopy

import pytest

from app.models.workflow import WorkflowDefinition
from app.services.workflow_validation import validate_workflow


def javascript_node(index: int) -> dict[str, object]:
    return {
        "id": f"node.{index:02d}",
        "type": "javascript",
        "position": {"x": index * 10, "y": 0},
        "config": {"source": "return input;"},
    }


def graph_payload(size: int, shape: str) -> dict[str, object]:
    nodes = [javascript_node(index) for index in range(size)]
    edges: list[dict[str, str]] = []
    for target in range(1, size):
        if shape == "chain":
            source = target - 1
        elif shape == "tree":
            source = (target - 1) // 2
        else:
            source = max(0, target - 3)
        edges.append(
            {
                "id": f"edge.{source:02d}.{target:02d}",
                "source": f"node.{source:02d}",
                "sourceHandle": "output",
                "target": f"node.{target:02d}",
                "targetHandle": "input",
            }
        )
    return {
        "schemaVersion": "1.0",
        "id": f"property.{shape}.{size}",
        "name": "Generated property graph",
        "nodes": nodes,
        "edges": edges,
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }


@pytest.mark.parametrize("size", [1, 2, 3, 8, 16, 25])
@pytest.mark.parametrize("shape", ["chain", "tree", "skip"])
def test_generated_dag_shapes_have_complete_stable_topological_layers(
    size: int, shape: str
) -> None:
    payload = graph_payload(size, shape)
    workflow = WorkflowDefinition.model_validate(payload)
    before = workflow.model_dump(mode="json", by_alias=True)

    first = validate_workflow(workflow)
    second = validate_workflow(workflow)

    assert first.valid is True
    assert first == second
    assert workflow.model_dump(mode="json", by_alias=True) == before
    flattened = [node_id for layer in first.execution_order for node_id in layer]
    assert sorted(flattened) == sorted(node["id"] for node in payload["nodes"])
    layer_for = {
        node_id: layer_index
        for layer_index, layer in enumerate(first.execution_order)
        for node_id in layer
    }
    for edge in payload["edges"]:
        assert layer_for[edge["source"]] < layer_for[edge["target"]]


@pytest.mark.parametrize("size", [2, 3, 8, 16, 25])
def test_injecting_a_back_edge_into_generated_chain_always_finds_a_cycle(size: int) -> None:
    payload = graph_payload(size, "chain")
    payload["edges"].append(
        {
            "id": "edge.back",
            "source": f"node.{size - 1:02d}",
            "sourceHandle": "output",
            "target": "node.00",
            "targetHandle": "input",
        }
    )
    submitted = deepcopy(payload)

    result = validate_workflow(WorkflowDefinition.model_validate(payload))

    assert result.valid is False
    assert "graph_cycle" in [issue.code for issue in result.errors]
    assert result.execution_order == []
    assert payload == submitted
