import { useCallback, useEffect, useRef, useState } from "react";
import type { RunEvent } from "../../contracts/types";
import type { EditorWorkspace } from "../editor/workspacePersistence";
import { clearRunHistory, loadRunHistory, makeStoredTrace, saveRunTrace, type StoredRunTrace } from "./runHistory";

export function useRunHistory(events: RunEvent[], workspace: EditorWorkspace) {
  const [traces, setTraces] = useState<StoredRunTrace[]>([]);
  const [available, setAvailable] = useState(true);
  const savedRunId = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try { setTraces(await loadRunHistory()); setAvailable(true); }
    catch { setAvailable(false); setTraces([]); }
  }, []);

  useEffect(() => {
    void loadRunHistory().then((loaded) => { setTraces(loaded); setAvailable(true); }).catch(() => { setAvailable(false); setTraces([]); });
  }, []);
  useEffect(() => {
    const trace = makeStoredTrace(events, workspace);
    if (!trace || savedRunId.current === trace.runId) return;
    savedRunId.current = trace.runId;
    void saveRunTrace(trace).then(refresh).catch(() => setAvailable(false));
  }, [events, refresh, workspace]);

  const clear = useCallback(async () => {
    try { await clearRunHistory(); setTraces([]); setAvailable(true); }
    catch { setAvailable(false); }
  }, []);

  return { available, clear, refresh, traces };
}
