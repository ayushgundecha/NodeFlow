"""Small graph utilities retained while the v1 execution engine is built."""

from collections import defaultdict, deque


def is_directed_acyclic_graph(node_ids: list[str], edges: list[tuple[str, str]]) -> bool:
    graph: dict[str, list[str]] = defaultdict(list)
    in_degree = dict.fromkeys(node_ids, 0)

    for source, target in edges:
        if source not in in_degree or target not in in_degree:
            return False
        graph[source].append(target)
        in_degree[target] += 1

    queue = deque(node_id for node_id in node_ids if in_degree[node_id] == 0)
    visited_count = 0
    while queue:
        current = queue.popleft()
        visited_count += 1
        for neighbor in graph[current]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return visited_count == len(node_ids)
