import { create } from "zustand";
import type { Viewport } from "reactflow";

type EditorState = {
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  viewport: Viewport;
  uploadedFiles: ReadonlyMap<string, File>;
  selectNode: (nodeId: string | null) => void;
  toggleNodeSelection: (nodeId: string) => void;
  setViewport: (viewport: Viewport) => void;
  setUploadedFile: (nodeId: string, file: File | null) => void;
  resetEditor: () => void;
};

const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };

export const useEditorStore = create<EditorState>((set) => ({
  selectedNodeId: null,
  selectedNodeIds: [],
  viewport: defaultViewport,
  uploadedFiles: new Map(),
  selectNode: (selectedNodeId) => { set({ selectedNodeId, selectedNodeIds: selectedNodeId ? [selectedNodeId] : [] }); },
  toggleNodeSelection: (nodeId) => {
    set((state) => {
      const selectedNodeIds = state.selectedNodeIds.includes(nodeId)
        ? state.selectedNodeIds.filter((id) => id !== nodeId)
        : [...state.selectedNodeIds, nodeId];
      return { selectedNodeIds, selectedNodeId: selectedNodeIds.at(-1) ?? null };
    });
  },
  setViewport: (viewport) => { set({ viewport }); },
  setUploadedFile: (nodeId, file) => {
    set((state) => {
      const uploadedFiles = new Map(state.uploadedFiles);
      if (file) uploadedFiles.set(nodeId, file);
      else uploadedFiles.delete(nodeId);
      return { uploadedFiles };
    });
  },
  resetEditor: () => {
    set({ selectedNodeId: null, selectedNodeIds: [], viewport: defaultViewport, uploadedFiles: new Map() });
  },
}));
