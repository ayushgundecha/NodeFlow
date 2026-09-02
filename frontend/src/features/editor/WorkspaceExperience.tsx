import { CheckCircle2, Download, FileJson2, LayoutTemplate, RotateCcw, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { EditorWorkspace } from "./workspacePersistence";
import { parseEditorWorkspace, serializeEditorWorkspace } from "./workspacePersistence";
import { defaultWorkflowTemplate, workflowTemplates, type WorkflowTemplate } from "./workflowTemplates";

const ONBOARDING_KEY = "nodeflow.onboarding.dismissed.v1";
type Replacement = { kind: "template"; template: WorkflowTemplate } | { kind: "import"; workspace: EditorWorkspace } | { kind: "reset" };

interface WorkspaceExperienceProps {
  currentWorkspace: EditorWorkspace;
  onClose: () => void;
  onReplace: (workspace: Omit<EditorWorkspace, "format" | "savedAt">) => void;
  open: boolean;
  recoveryReason?: string;
}

export function WorkspaceExperience({ currentWorkspace, onClose, onReplace, open, recoveryReason }: WorkspaceExperienceProps) {
  const [welcomeVisible, setWelcomeVisible] = useState(() => typeof localStorage === "undefined" || localStorage.getItem(ONBOARDING_KEY) !== "true");
  const [tourVisible, setTourVisible] = useState(false);
  const [pending, setPending] = useState<Replacement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const replacementOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => closeButton.current?.focus());
    return () => { cancelAnimationFrame(frame); requestAnimationFrame(() => opener.current?.focus()); };
  }, [open]);
  useEffect(() => {
    if (!pending) return;
    const frame = requestAnimationFrame(() => cancelButton.current?.focus());
    return () => { cancelAnimationFrame(frame); requestAnimationFrame(() => replacementOpener.current?.focus()); };
  }, [pending]);

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); if (pending) setPending(null); else onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([tabindex="-1"])'));
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const dismissWelcome = () => { try { localStorage.setItem(ONBOARDING_KEY, "true"); } catch { /* Dismissal remains functional without storage. */ } setWelcomeVisible(false); setTourVisible(false); };
  const requestTemplate = (template: WorkflowTemplate) => { replacementOpener.current = document.activeElement as HTMLElement | null; setPending({ kind: "template", template }); };
  const confirmReplacement = () => {
    if (!pending) return;
    const source = pending.kind === "template" ? pending.template : pending.kind === "import" ? pending.workspace : defaultWorkflowTemplate;
    onReplace({ id: source.id, name: source.name, description: source.description, nodes: source.nodes, edges: source.edges });
    setPending(null); setImportError(null); onClose();
  };
  const exportWorkflow = () => {
    const url = URL.createObjectURL(new Blob([serializeEditorWorkspace(currentWorkspace)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${currentWorkspace.id}.nodeflow.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const importWorkflow = async (file: File) => {
    try { replacementOpener.current = fileInput.current; setPending({ kind: "import", workspace: parseEditorWorkspace(await file.text()) }); setImportError(null); }
    catch (error) { setImportError(error instanceof Error ? error.message : "This workflow could not be imported."); }
  };

  return <>
    {recoveryReason ? <div className="nf-recovery-notice" role="status"><CheckCircle2 aria-hidden="true" size={16} /><span><strong>Workspace recovered safely.</strong> The damaged local draft was backed up and Incident Triage was loaded. {recoveryReason}</span></div> : null}
    {welcomeVisible ? <aside className="nf-welcome-card" aria-label="Welcome to NodeFlow"><button aria-label="Dismiss welcome" onClick={dismissWelcome} type="button"><X aria-hidden="true" size={16} /></button><span><Sparkles aria-hidden="true" size={18} /></span><div><small>Welcome to NodeFlow</small><strong>Build it. Run it. Understand every step.</strong><p>A real visual workflow debugger—start with Incident Triage, select a node, then run when you’re ready.</p><div><button className="nf-button nf-button--secondary" onClick={() => setTourVisible((visible) => !visible)} type="button">{tourVisible ? "Hide guide" : "Show me around"}</button><button className="nf-text-link" onClick={dismissWelcome} type="button">Skip</button></div>{tourVisible ? <ol><li><b>1</b><span><strong>Build</strong>Add nodes from the library or choose a template.</span></li><li><b>2</b><span><strong>Configure</strong>Select a node to edit validated settings.</span></li><li><b>3</b><span><strong>Run</strong>Use the primary Run action to trace real execution.</span></li></ol> : null}</div></aside> : null}
    {open ? <div className="nf-workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-dialog-title" onKeyDown={trapFocus}><div><header><div><LayoutTemplate aria-hidden="true" size={18} /><span><small>Workspace</small><strong id="workspace-dialog-title">Templates and local data</strong></span></div><button aria-label="Close workspace menu" onClick={onClose} ref={closeButton} type="button"><X aria-hidden="true" size={17} /></button></header>
      <section><span className="nf-overline">Start from a real graph</span><div className="nf-template-grid">{workflowTemplates.map((template) => <article key={template.id}><FileJson2 aria-hidden="true" size={18} /><div><strong>{template.name}</strong><p>{template.description}</p><small>{template.nodes.length} nodes · {template.outcome}</small></div><button aria-label={`Use ${template.name} template`} onClick={() => requestTemplate(template)} type="button">Use template</button></article>)}</div></section>
      <section className="nf-data-actions"><span className="nf-overline">Your browser-local workspace</span><p>Export a portable, versioned JSON file or import one after validation. Nothing is uploaded.</p><div><button onClick={exportWorkflow} type="button"><Download aria-hidden="true" size={15} />Export workflow</button><button onClick={() => fileInput.current?.click()} type="button"><Upload aria-hidden="true" size={15} />Import workflow</button><button className="nf-danger-action" onClick={() => { replacementOpener.current = document.activeElement as HTMLElement | null; setPending({ kind: "reset" }); }} type="button"><RotateCcw aria-hidden="true" size={15} />Reset sample</button><input accept="application/json,.json" aria-label="Choose workflow JSON file" className="nf-visually-hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importWorkflow(file); event.target.value = ""; }} ref={fileInput} tabIndex={-1} type="file" /></div>{importError ? <div className="nf-import-error" role="alert"><strong>Import blocked</strong><span>{importError}</span></div> : null}</section>
    </div></div> : null}
    {pending ? <div className="nf-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="replace-title" onKeyDown={trapFocus}><div><strong id="replace-title">Replace the current workflow?</strong><p>Your current draft will be replaced by {pending.kind === "template" ? pending.template.name : pending.kind === "import" ? pending.workspace.name : "a fresh Incident Triage sample"}. Export it first if you want a backup.</p><div><button onClick={() => setPending(null)} ref={cancelButton} type="button">Cancel</button><button className="nf-button nf-button--primary" onClick={confirmReplacement} type="button">Replace workflow</button></div></div></div> : null}
  </>;
}
