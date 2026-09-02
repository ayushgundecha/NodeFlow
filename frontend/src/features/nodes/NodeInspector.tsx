import { CheckCircle2, MousePointer2, PanelRightClose } from "lucide-react";
import { useId, useState } from "react";
import type { NodeFieldDefinition } from "../../domain/nodes/registry";
import { getNodeDefinition } from "../../domain/nodes/registry";
import { useStore } from "../../store";
import { useEditorStore } from "../editor/editorStore";
import { formatFieldValue, validateField } from "./fieldValidation";
import { nodeCategoryLabels, nodeIcons } from "./nodePresentation";
import type { ValidationIssue } from "../../contracts/types";

interface NodeInspectorProps {
  collapsed: boolean;
  onToggle: () => void;
  validationIssues?: ValidationIssue[];
}

interface InspectorFieldProps {
  field: NodeFieldDefinition;
  initialValue: unknown;
  onCommit: (value: unknown) => void;
}

function InspectorField({ field, initialValue, onCommit }: InspectorFieldProps) {
  const fieldId = useId();
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const [draft, setDraft] = useState(() => formatFieldValue(initialValue, field.kind));
  const [error, setError] = useState<string | null>(null);

  const commit = (nextDraft: string) => {
    const result = validateField(field, nextDraft);
    if (!result.valid) {
      setError(result.message);
      return;
    }
    setError(null);
    onCommit(result.value);
  };

  const describedBy = error ? `${helpId} ${errorId}` : helpId;
  const sharedProps = {
    "aria-describedby": describedBy,
    "aria-invalid": Boolean(error),
    id: fieldId,
    name: field.key,
    onBlur: () => commit(draft),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextDraft = event.target.value;
      setDraft(nextDraft);
      if (error) setError(null);
      if (field.kind === "text" || field.kind === "textarea") onCommit(nextDraft);
    },
    value: draft,
  };

  return (
    <label className={`nf-shell-field${error ? " nf-shell-field--error" : ""}`} htmlFor={fieldId}>
      <span>{field.label}{field.required ? <em aria-hidden="true">Required</em> : null}</span>
      {field.kind === "select" ? (
        <select
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          id={fieldId}
          name={field.key}
          onChange={(event) => { setDraft(event.target.value); commit(event.target.value); }}
          value={draft}
        >
          {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : field.kind === "textarea" || field.kind === "json" ? (
        <textarea {...sharedProps} rows={field.kind === "json" ? 6 : 4} spellCheck={field.kind !== "json"} />
      ) : (
        <input {...sharedProps} inputMode={field.kind === "number" ? "numeric" : undefined} type={field.kind === "url" ? "url" : field.kind === "number" ? "number" : "text"} />
      )}
      <small id={helpId}>{field.helper}</small>
      {error ? <span className="nf-field-error" id={errorId} role="alert">{error}</span> : null}
    </label>
  );
}

export function NodeInspector({ collapsed, onToggle, validationIssues = [] }: NodeInspectorProps) {
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const node = useStore((state) => state.nodes.find((candidate) => candidate.id === selectedNodeId));
  const updateNodeField = useStore((state) => state.updateNodeField);
  const updateNodeConfig = useStore((state) => state.updateNodeConfig);

  if (collapsed) return null;

  if (!node) {
    return (
      <aside aria-label="Node inspector" className="nf-shell-panel nf-inspector">
        <header className="nf-panel-heading"><div><MousePointer2 aria-hidden="true" size={17} /><h2>Inspector</h2></div><button aria-label="Collapse inspector" className="nf-icon-button" onClick={onToggle} title="Collapse inspector" type="button"><PanelRightClose aria-hidden="true" size={17} /></button></header>
        <div className="nf-inspector-empty"><span><MousePointer2 aria-hidden="true" size={22} /></span><strong>Select a node</strong><p>Choose any workflow node to inspect and edit its real configuration.</p></div>
        <footer className="nf-panel-footer"><span>Nothing selected</span></footer>
      </aside>
    );
  }

  const definition = getNodeDefinition(node.data.nodeType as Parameters<typeof getNodeDefinition>[0]);
  const Icon = nodeIcons[definition.icon];

  return (
    <aside aria-label="Node inspector" className="nf-shell-panel nf-inspector">
      <header className="nf-panel-heading"><div><Icon aria-hidden="true" size={17} /><h2>Inspector</h2></div><button aria-label="Collapse inspector" className="nf-icon-button" onClick={onToggle} title="Collapse inspector" type="button"><PanelRightClose aria-hidden="true" size={17} /></button></header>
      <div className="nf-inspector-tabs" role="tablist" aria-label="Inspector views"><button aria-selected="true" role="tab" type="button">Configure</button><button aria-selected="false" disabled role="tab" type="button">Input</button><button aria-selected="false" disabled role="tab" type="button">Output</button></div>
      <div className="nf-inspector-content">
        <div className="nf-selected-node"><span className={`nf-node-tone--${definition.category}`}><Icon aria-hidden="true" size={18} /></span><div><small>{nodeCategoryLabels[definition.category]}</small><strong>{node.data.label ?? definition.label}</strong></div></div>
        {validationIssues.filter((issue) => issue.nodeId === node.id).map((issue) => <div className="nf-inspector-runtime-error" key={`${issue.code}.${issue.field}`} role="alert"><strong>{issue.code.replaceAll("_", " ")}</strong><span>{issue.message}</span></div>)}
        <label className="nf-shell-field"><span>Node name<em aria-hidden="true">Required</em></span><input aria-label="Node name" onChange={(event) => updateNodeField(node.id, "label", event.target.value)} required type="text" value={node.data.label ?? ""} /><small>Shown on the canvas and in run traces.</small></label>
        {definition.fields.map((field) => (
          <InspectorField field={field} initialValue={node.data.config?.[field.key]} key={`${node.id}.${field.key}`} onCommit={(value) => updateNodeConfig(node.id, field.key, value)} />
        ))}
      </div>
      <footer className="nf-panel-footer"><span><CheckCircle2 aria-hidden="true" size={14} /> Changes save automatically</span></footer>
    </aside>
  );
}
