import { Box, Circle, PanelLeftClose, Plus, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { nodeDefinitions, type NodeCategory } from "../../domain/nodes/registry";
import { useEditorStore } from "../editor/editorStore";
import { useStore } from "../../store";
import type { FlowNode } from "../../types/editor";
import { nodeCategoryLabels, nodeIcons } from "./nodePresentation";

interface NodeLibraryProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function NodeLibrary({ collapsed, onToggle }: NodeLibraryProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const addNode = useStore((state) => state.addNode);
  const getNodeID = useStore((state) => state.getNodeID);
  const nodeCount = useStore((state) => state.nodes.length);
  const selectNode = useEditorStore((state) => state.selectNode);

  const filteredGroups = useMemo(() => {
    const filtered = nodeDefinitions.filter((definition) => !deferredQuery
      || `${definition.label} ${definition.description} ${nodeCategoryLabels[definition.category]}`.toLowerCase().includes(deferredQuery));
    const groups = new Map<NodeCategory, Array<(typeof nodeDefinitions)[number]>>();
    filtered.forEach((definition) => {
      const group = groups.get(definition.category) ?? [];
      group.push(definition);
      groups.set(definition.category, group);
    });
    return Array.from(groups.entries());
  }, [deferredQuery]);

  const insertNode = (type: (typeof nodeDefinitions)[number]["type"]) => {
    const definition = nodeDefinitions.find((candidate) => candidate.type === type);
    if (!definition) return;
    const id = getNodeID(type);
    const node: FlowNode = {
      id,
      type: "registryNode",
      position: { x: 100 + nodeCount * 48, y: 180 + (nodeCount % 3) * 120 },
      data: { id, nodeType: type, label: definition.label, config: definition.createConfig(), status: "idle" },
    };
    addNode(node);
    selectNode(id);
  };

  return (
    <aside aria-label="Node library" className="nf-shell-panel nf-library" hidden={collapsed}>
      <header className="nf-panel-heading">
        <div><Box aria-hidden="true" size={17} /><h2>Node library</h2></div>
        <button aria-label="Collapse node library" className="nf-icon-button" onClick={onToggle} title="Collapse node library" type="button"><PanelLeftClose aria-hidden="true" size={17} /></button>
      </header>
      <label className="nf-shell-search">
        <span className="nf-visually-hidden">Search nodes</span>
        <Search aria-hidden="true" size={16} />
        <input onChange={(event) => setQuery(event.target.value)} placeholder="Search 10 node types" type="search" value={query} />
        <kbd>⌘K</kbd>
      </label>
      <div aria-live="polite" className="nf-library-section">
        {filteredGroups.length ? filteredGroups.map(([category, definitions]) => (
          <section className="nf-library-group" key={category}>
            <div className="nf-library-section__heading"><span>{nodeCategoryLabels[category]}</span><span>{definitions.length}</span></div>
            <div className="nf-library-list">
              {definitions.map((definition) => {
                const Icon = nodeIcons[definition.icon];
                return (
                  <button aria-label={`Add ${definition.label} node`} className="nf-library-item" key={definition.type} onClick={() => insertNode(definition.type)} type="button">
                    <span className={`nf-library-item__icon nf-node-tone--${definition.category}`}><Icon aria-hidden="true" size={17} /></span>
                    <span><strong>{definition.label}</strong><small>{definition.description}</small></span>
                    <Plus aria-hidden="true" size={16} />
                  </button>
                );
              })}
            </div>
          </section>
        )) : (
          <div className="nf-library-empty"><Search aria-hidden="true" size={20} /><strong>No matching nodes</strong><span>Try a capability such as “HTTP”, “JSON”, or “AI”.</span><button onClick={() => setQuery("")} type="button">Clear search</button></div>
        )}
      </div>
      <footer className="nf-panel-footer"><span><Circle aria-hidden="true" size={9} fill="currentColor" /> {nodeDefinitions.length} real node types available</span></footer>
    </aside>
  );
}
