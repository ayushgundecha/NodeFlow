import { Box, Circle, GripVertical, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { nodeDefinitions, type NodeCategory } from "../../domain/nodes/registry";
import { useEditorStore } from "../editor/editorStore";
import { useStore } from "../../store";
import { nodeCategoryLabels, nodeIcons } from "./nodePresentation";
import { NODEFLOW_DRAG_TYPE, createLibraryNode } from "./workflowGraph";

interface NodeLibraryProps {
  collapsed: boolean;
  onNodeAdded: () => void;
  onToggle: () => void;
}

export function NodeLibrary({ collapsed, onNodeAdded, onToggle }: NodeLibraryProps) {
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
    addNode(createLibraryNode(type, id, { x: 100 + nodeCount * 48, y: 180 + (nodeCount % 3) * 120 }));
    selectNode(id);
    onNodeAdded();
  };

  if (collapsed) {
    return (
      <aside aria-label="Collapsed node library" className="nf-library-rail">
        <button aria-label="Expand node library" className="nf-library-rail__toggle" onClick={onToggle} title="Expand node library" type="button"><PanelLeftOpen aria-hidden="true" size={18} /></button>
        <div aria-label="Quick-add nodes" className="nf-library-rail__nodes" role="toolbar">
          {nodeDefinitions.map((definition) => {
            const Icon = nodeIcons[definition.icon];
            return <button aria-label={`Add ${definition.label} node`} className={`nf-library-rail__node nf-node-tone--${definition.category}`} key={definition.type} onClick={() => insertNode(definition.type)} title={`Add ${definition.label}`} type="button"><Icon aria-hidden="true" size={17} /></button>;
          })}
        </div>
        <span aria-label={`${nodeDefinitions.length} node types available`} className="nf-library-rail__count">{nodeDefinitions.length}</span>
      </aside>
    );
  }

  return (
    <aside aria-label="Node library" className="nf-shell-panel nf-library">
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
      <p className="nf-library-hint" id="node-library-hint"><GripVertical aria-hidden="true" size={13} /> Drag to place · click to add</p>
      <div aria-live="polite" className="nf-library-section">
        {filteredGroups.length ? filteredGroups.map(([category, definitions]) => (
          <section className="nf-library-group" key={category}>
            <div className="nf-library-section__heading"><span>{nodeCategoryLabels[category]}</span><span>{definitions.length}</span></div>
            <div className="nf-library-list">
              {definitions.map((definition) => {
                const Icon = nodeIcons[definition.icon];
                return (
                  <button aria-describedby="node-library-hint" aria-label={`Add ${definition.label} node`} className="nf-library-item" draggable key={definition.type} onClick={() => insertNode(definition.type)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(NODEFLOW_DRAG_TYPE, definition.type); event.dataTransfer.setData("text/plain", definition.type); }} title={`Drag ${definition.label} to the canvas, or click to add`} type="button">
                    <span className={`nf-library-item__icon nf-node-tone--${definition.category}`}><Icon aria-hidden="true" size={17} /></span>
                    <span><strong>{definition.label}</strong><small>{definition.description}</small></span>
                    <GripVertical aria-hidden="true" size={16} />
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
