import { AlignHorizontalSpaceAround, Clipboard, Copy, Redo2, Search, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { useEditorStore } from "../editor/editorStore";

export function EditorCommandBar() {
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const selectNode = useEditorStore((state) => state.selectNode);
  const autoLayout = useStore((state) => state.autoLayout);
  const deleteNodes = useStore((state) => state.deleteNodes);
  const duplicateNodes = useStore((state) => state.duplicateNodes);
  const moveNodes = useStore((state) => state.moveNodes);
  const redo = useStore((state) => state.redo);
  const undo = useStore((state) => state.undo);
  const canRedo = useStore((state) => state.historyFuture.length > 0);
  const canUndo = useStore((state) => state.historyPast.length > 0);
  const copiedIds = useRef<string[]>([]);
  const paletteButton = useRef<HTMLButtonElement>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [feedback, setFeedback] = useState("Ready");

  const duplicate = useCallback((ids = selectedNodeIds) => {
    const created = duplicateNodes(ids);
    if (created.length) {
      selectNode(created.at(-1)!);
      setFeedback(`Duplicated ${created.length} node${created.length === 1 ? "" : "s"}`);
    }
  }, [duplicateNodes, selectNode, selectedNodeIds]);

  const remove = useCallback(() => {
    if (!selectedNodeIds.length) return;
    deleteNodes(selectedNodeIds);
    setFeedback(`Deleted ${selectedNodeIds.length} node${selectedNodeIds.length === 1 ? "" : "s"}`);
    selectNode(null);
  }, [deleteNodes, selectNode, selectedNodeIds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") { event.preventDefault(); duplicate(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selectedNodeIds.length) { event.preventDefault(); copiedIds.current = selectedNodeIds; setFeedback(`Copied ${selectedNodeIds.length} node${selectedNodeIds.length === 1 ? "" : "s"}`); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && copiedIds.current.length) { event.preventDefault(); duplicate(copiedIds.current); return; }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(); return; }
      const deltas: Record<string, { x: number; y: number }> = { ArrowUp: { x: 0, y: -16 }, ArrowDown: { x: 0, y: 16 }, ArrowLeft: { x: -16, y: 0 }, ArrowRight: { x: 16, y: 0 } };
      if (deltas[event.key] && selectedNodeIds.length) { event.preventDefault(); moveNodes(selectedNodeIds, deltas[event.key]!); setFeedback("Moved selection 16 pixels"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [duplicate, moveNodes, redo, remove, selectedNodeIds, undo]);

  const command = (action: () => void) => { action(); setPaletteOpen(false); requestAnimationFrame(() => paletteButton.current?.focus()); };

  return <>
    <div aria-label="Editor actions" className="nf-editor-commandbar" role="toolbar">
      <button aria-label="Undo last change" disabled={!canUndo} onClick={undo} type="button"><Undo2 aria-hidden="true" size={14} />Undo</button>
      <button aria-label="Redo last change" disabled={!canRedo} onClick={redo} type="button"><Redo2 aria-hidden="true" size={14} />Redo</button>
      <span />
      <button disabled={!selectedNodeIds.length} onClick={() => duplicate()} type="button"><Copy aria-hidden="true" size={14} />Duplicate</button>
      <button disabled={!selectedNodeIds.length} onClick={() => { copiedIds.current = selectedNodeIds; setFeedback("Selection copied"); }} type="button"><Clipboard aria-hidden="true" size={14} />Copy</button>
      <button disabled={!selectedNodeIds.length} onClick={remove} type="button"><Trash2 aria-hidden="true" size={14} />Delete</button>
      <button onClick={() => { autoLayout(); setFeedback("Workflow arranged"); }} type="button"><AlignHorizontalSpaceAround aria-hidden="true" size={14} />Arrange</button>
      <button aria-expanded={paletteOpen} onClick={() => setPaletteOpen(true)} ref={paletteButton} type="button"><Search aria-hidden="true" size={14} />Commands</button>
    </div>
    <span aria-live="polite" className="nf-visually-hidden">{feedback}</span>
    {paletteOpen ? <div className="nf-command-dialog" role="dialog" aria-modal="true" aria-label="Command palette"><div><header><strong>Quick commands</strong><button aria-label="Close commands" onClick={() => command(() => undefined)} type="button"><X aria-hidden="true" size={16} /></button></header><button disabled={!selectedNodeIds.length} onClick={() => command(() => duplicate())} type="button">Duplicate selection <kbd>⌘D</kbd></button><button onClick={() => command(() => autoLayout())} type="button">Arrange workflow <kbd>A</kbd></button><button disabled={!selectedNodeIds.length} onClick={() => command(remove)} type="button">Delete selection <kbd>⌫</kbd></button><small>Tip: Shift-click nodes for multi-select. Arrow keys move the selection.</small></div></div> : null}
  </>;
}
