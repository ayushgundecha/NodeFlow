import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PANEL_LAYOUT,
  PANEL_LAYOUT_STORAGE_KEY,
  clampPanelSize,
  loadPanelLayout,
  savePanelLayout,
} from './panelLayout';

describe('panel layout persistence', () => {
  it('starts with the canvas focused and secondary panels closed', () => {
    expect(DEFAULT_PANEL_LAYOUT).toMatchObject({
      debuggerCollapsed: true,
      inspectorCollapsed: true,
      libraryCollapsed: false,
    });
  });

  it('clamps resized panels to their supported range', () => {
    expect(clampPanelSize(120, { min: 200, max: 400 })).toBe(200);
    expect(clampPanelSize(460, { min: 200, max: 400 })).toBe(400);
    expect(clampPanelSize(312.6, { min: 200, max: 400 })).toBe(313);
  });

  it('falls back safely when persisted state is corrupted', () => {
    expect(loadPanelLayout({ getItem: () => '{broken' })).toEqual(DEFAULT_PANEL_LAYOUT);
    expect(loadPanelLayout({ getItem: () => JSON.stringify({ libraryWidth: 'wide' }) })).toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('normalizes valid stored values', () => {
    const stored = { ...DEFAULT_PANEL_LAYOUT, debuggerHeight: 900, libraryWidth: 100 };
    expect(loadPanelLayout({ getItem: () => JSON.stringify(stored) })).toMatchObject({
      debuggerHeight: 420,
      libraryWidth: 232,
    });
  });

  it('writes a versioned layout record', () => {
    const setItem = vi.fn();
    savePanelLayout(DEFAULT_PANEL_LAYOUT, { setItem });
    expect(setItem).toHaveBeenCalledWith(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(DEFAULT_PANEL_LAYOUT));
  });
});
