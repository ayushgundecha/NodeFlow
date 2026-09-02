import { create } from "zustand";
import type { Viewport } from "reactflow";

type EditorState = {
  selectedNodeId: string | null;
  viewport: Viewport;
  uploadedFiles: ReadonlyMap<string, File>;
  selectNode: (nodeId: string | null) => void;
  setViewport: (viewport: Viewport) => void;
  setUploadedFile: (nodeId: string, file: File | null) => void;
  resetEditor: () => void;
};

const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };

export const useEditorStore = create<EditorState>((set) => ({
  selectedNodeId: null,
  viewport: defaultViewport,
  uploadedFiles: new Map(),
  selectNode: (selectedNodeId) => { set({ selectedNodeId }); },
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
    set({ selectedNodeId: null, viewport: defaultViewport, uploadedFiles: new Map() });
  },
}));
