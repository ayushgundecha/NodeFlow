"""Compatibility graph analysis endpoint for the Phase 1 canvas."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ....services.graph import is_directed_acyclic_graph

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


class Node(BaseModel):
    id: str
    type: str
    position: dict[str, Any] | None = Field(default_factory=dict)


class Edge(BaseModel):
    source: str
    target: str


class Pipeline(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


class PipelineAnalysis(BaseModel):
    num_nodes: int
    num_edges: int
    is_dag: bool


@router.post("/parse", response_model=PipelineAnalysis)
def parse_pipeline(pipeline: Pipeline) -> PipelineAnalysis:
    return PipelineAnalysis(
        num_nodes=len(pipeline.nodes),
        num_edges=len(pipeline.edges),
        is_dag=is_directed_acyclic_graph(
            [node.id for node in pipeline.nodes],
            [(edge.source, edge.target) for edge in pipeline.edges],
        ),
    )
