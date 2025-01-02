from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from typing import List, Dict, Optional
from collections import defaultdict, deque

# FastAPI app instance
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# Sets the templates directory to the `build` folder from `npm run build`
# this is where you'll find the index.html file.
templates = Jinja2Templates(directory="public")

# Mounts the `static` folder within the `build` folder to the `/static` route.
app.mount('/static', StaticFiles(directory="public/static"), 'static')

# Pydantic models for request validation
class Node(BaseModel):
    id: str
    type: str
    position: Optional[Dict] = Field(default_factory=dict)

class Edge(BaseModel):
    source: str
    target: str

class Pipeline(BaseModel):
    nodes: List[Node]
    edges: List[Edge]

@app.post('/pipelines/parse')
async def parse_pipeline(pipeline: Pipeline):
    """
    Parse and analyze a pipeline graph:
    - Count nodes and edges
    - Check if the graph is a Directed Acyclic Graph (DAG)

    Args:
        pipeline (Pipeline): Contains nodes and edges of the graph

    Returns:
        JSON response with node/edge count and DAG status
    """
    try:
        # Extract nodes and edges
        num_nodes = len(pipeline.nodes)
        num_edges = len(pipeline.edges)

        # Validate that graph is a DAG
        is_dag = check_if_dag(pipeline.nodes, pipeline.edges)

        return {"num_nodes": num_nodes, "num_edges": num_edges, "is_dag": is_dag}
    except ValidationError as e:
        raise HTTPException(status_code=422, detail="Invalid pipeline structure.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def check_if_dag(nodes: List[Node], edges: List[Edge]) -> bool:
    """
    Check if the graph formed by nodes and edges is a Directed Acyclic Graph (DAG).
    
    Uses Kahn's Algorithm for cycle detection.

    Args:
        nodes (List[Node]): List of nodes
        edges (List[Edge]): List of edges

    Returns:
        bool: True if the graph is a DAG, False otherwise
    """
    # Build adjacency list and in-degree map
    graph = defaultdict(list)
    in_degree = defaultdict(int)

    for node in nodes:
        graph[node.id] = []  # Initialize adjacency list
        in_degree[node.id] = 0  # Initialize in-degree

    for edge in edges:
        graph[edge.source].append(edge.target)
        in_degree[edge.target] += 1

    # Topological sorting using Kahn's algorithm
    queue = deque([node.id for node in nodes if in_degree[node.id] == 0])
    visited_count = 0

    while queue:
        current = queue.popleft()
        visited_count += 1

        for neighbor in graph[current]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # If all nodes are visited, it is a DAG
    return visited_count == len(nodes)

@app.get("/{rest_of_path:path}")
async def react_app(req: Request, rest_of_path: str):
    return templates.TemplateResponse('index.html', { 'request': req })