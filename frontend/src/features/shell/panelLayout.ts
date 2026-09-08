export const PANEL_LAYOUT_STORAGE_KEY = 'nodeflow.panel-layout.v2';

export interface PanelLayout {
  debuggerCollapsed: boolean;
  debuggerHeight: number;
  inspectorCollapsed: boolean;
  inspectorWidth: number;
  libraryCollapsed: boolean;
  libraryWidth: number;
}

export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  debuggerCollapsed: true,
  debuggerHeight: 300,
  inspectorCollapsed: true,
  inspectorWidth: 320,
  libraryCollapsed: false,
  libraryWidth: 264,
};

export const PANEL_LIMITS = {
  debuggerHeight: { max: 420, min: 160 },
  inspectorWidth: { max: 440, min: 280 },
  libraryWidth: { max: 360, min: 232 },
} as const;

export function clampPanelSize(value: number, limits: { max: number; min: number }) {
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}

function isPanelLayout(value: unknown): value is PanelLayout {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PanelLayout>;
  return typeof candidate.debuggerCollapsed === 'boolean'
    && typeof candidate.debuggerHeight === 'number'
    && Number.isFinite(candidate.debuggerHeight)
    && typeof candidate.inspectorCollapsed === 'boolean'
    && typeof candidate.inspectorWidth === 'number'
    && Number.isFinite(candidate.inspectorWidth)
    && typeof candidate.libraryCollapsed === 'boolean'
    && typeof candidate.libraryWidth === 'number'
    && Number.isFinite(candidate.libraryWidth);
}

export function normalizePanelLayout(layout: PanelLayout): PanelLayout {
  return {
    ...layout,
    debuggerHeight: clampPanelSize(layout.debuggerHeight, PANEL_LIMITS.debuggerHeight),
    inspectorWidth: clampPanelSize(layout.inspectorWidth, PANEL_LIMITS.inspectorWidth),
    libraryWidth: clampPanelSize(layout.libraryWidth, PANEL_LIMITS.libraryWidth),
  };
}

export function loadPanelLayout(storage?: Pick<Storage, 'getItem'>): PanelLayout {
  try {
    const stored = (storage ?? localStorage).getItem(PANEL_LAYOUT_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    return isPanelLayout(parsed) ? normalizePanelLayout(parsed) : DEFAULT_PANEL_LAYOUT;
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
}

export function savePanelLayout(layout: PanelLayout, storage?: Pick<Storage, 'setItem'>) {
  try {
    (storage ?? localStorage).setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(normalizePanelLayout(layout)));
  } catch {
    // The shell remains usable when storage is unavailable or full.
  }
}
