import type { ProfilerOnRenderCallback } from "react";

export const REACT_PROFILE_PREFIX = "nodeflow.react";
const renderProfiles = new Map<string, { count: number; lastMs: number; worstMs: number }>();

export const recordReactRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration) => {
  const previous = renderProfiles.get(id) ?? { count: 0, lastMs: 0, worstMs: 0 };
  const profile = { count: previous.count + 1, lastMs: Number(actualDuration.toFixed(2)), worstMs: Number(Math.max(previous.worstMs, actualDuration).toFixed(2)) };
  renderProfiles.set(id, profile);
  if (typeof document !== "undefined") document.documentElement.dataset.nodeflowReactProfile = JSON.stringify({ id, phase, ...profile, baseMs: Number(baseDuration.toFixed(2)) });
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  const name = `${REACT_PROFILE_PREFIX}.${id}.${phase}`;
  if (performance.getEntriesByName(name).length >= 50) performance.clearMeasures(name);
  try { performance.measure(name, { start: 0, duration: actualDuration, detail: { actualDuration, baseDuration } }); } catch { /* Profiling must never affect the product. */ }
};
