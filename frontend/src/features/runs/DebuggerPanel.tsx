import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  Clock3,
  Download,
  FileJson2,
  GitCompare,
  History,
  ListTree,
  LoaderCircle,
  PanelBottomClose,
  Play,
  RotateCcw,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { RunEvent } from "../../contracts/types";
import {
  detailsForNode,
  eventDescription,
  eventLabel,
  eventNodeId,
  runTimings,
  safeJson,
  summarizeRun,
} from "./debuggerModel";
import { compareRuns, replayEventsThrough, type StoredRunTrace } from "./runHistory";

type DebuggerView = "data" | "history" | "timeline" | "timing";
type DataView = "error" | "input" | "logs" | "output";

interface DebuggerPanelProps {
  busy: boolean;
  collapsed: boolean;
  events: RunEvent[];
  historyAvailable: boolean;
  nodeLabels: Readonly<Record<string, string>>;
  onClearHistory: () => void;
  onInspectNode: (nodeId: string) => void;
  onReplayEvents: (events: RunEvent[] | null) => void;
  onRun: () => void;
  onStop: () => void;
  onToggle: () => void;
  retryable: boolean;
  statusMessage: string;
  traces: StoredRunTrace[];
  workflowFormat: string;
  workflowId: string;
  workflowSignature: string;
}

const downloadText = (text: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

function DataValue({ filename, label, value }: { filename: string; label: string; value: unknown }) {
  const rendered = safeJson(value);
  const [copied, setCopied] = useState(false);
  if (!rendered) return <div className="nf-debug-empty-value">No {label.toLowerCase()} was recorded for this node.</div>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rendered.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="nf-debug-data-value">
      <div>
        <span>{rendered.truncated ? "Preview limited to 20,000 characters" : `${label} JSON`}</span>
        <span className="nf-debug-data-actions">
          <button aria-label={`Copy ${label.toLowerCase()}`} onClick={() => void copy()} type="button"><Clipboard aria-hidden="true" size={14} />{copied ? "Copied" : "Copy"}</button>
          <button aria-label={`Download ${label.toLowerCase()}`} onClick={() => downloadText(rendered.text, filename)} type="button"><Download aria-hidden="true" size={14} />Download</button>
        </span>
      </div>
      <pre tabIndex={0}><code>{rendered.text}</code></pre>
    </div>
  );
}

export function DebuggerPanel({ busy, collapsed, events: liveEvents, historyAvailable, nodeLabels, onClearHistory, onInspectNode, onReplayEvents, onRun, onStop, onToggle, retryable, statusMessage, traces, workflowFormat, workflowId, workflowSignature }: DebuggerPanelProps) {
  const [view, setView] = useState<DebuggerView>("timeline");
  const [dataView, setDataView] = useState<DataView>("input");
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [scrubSequence, setScrubSequence] = useState<number | null>(null);
  const [comparing, setComparing] = useState(false);
  const activeTrace = traces.find((trace) => trace.runId === activeRunId) ?? null;
  const sourceEvents = activeTrace?.events ?? liveEvents;
  const events = activeTrace && scrubSequence !== null ? replayEventsThrough(sourceEvents, scrubSequence) : sourceEvents;
  const selectedEvent = events.find((event) => event.sequence === selectedSequence) ?? events.at(-1) ?? null;
  const selectedNodeId = selectedEvent ? eventNodeId(selectedEvent) : null;
  const details = detailsForNode(events, selectedNodeId);
  const summary = summarizeRun(events);
  const finalNodeEvent = [...events].reverse().find((event) => event.type === "node.completed");
  const failedNodeEvent = [...events].reverse().find((event) => event.type === "node.failed");
  const timings = runTimings(events);
  const maxEnd = Math.max(1, ...timings.map((timing) => timing.offsetMs + timing.durationMs));
  const comparableTraces = traces.filter((trace) => trace.schema === "nodeflow.run-history/1" && trace.workflowFormat === workflowFormat && trace.workflowId === workflowId);
  const comparison = comparableTraces.length >= 2 ? compareRuns(comparableTraces[1]!, comparableTraces[0]!) : [];

  const selectEvent = (event: RunEvent) => {
    setSelectedSequence(event.sequence);
    const nodeId = eventNodeId(event);
    if (nodeId) onInspectNode(nodeId);
  };

  const showData = (next: DataView) => {
    setDataView(next);
    setView("data");
  };

  const replayTrace = (trace: StoredRunTrace) => {
    const sequence = trace.events.at(-1)?.sequence ?? 0;
    setActiveRunId(trace.runId);
    setScrubSequence(sequence);
    setSelectedSequence(sequence);
    setComparing(false);
    setView("timeline");
    onReplayEvents(replayEventsThrough(trace.events, sequence));
  };

  const showLive = () => {
    setActiveRunId(null);
    setScrubSequence(null);
    setSelectedSequence(null);
    setComparing(false);
    setView("timeline");
    onReplayEvents(null);
  };

  const hasEvents = events.length > 0;
  const interrupted = !busy && retryable && summary.status === "running";
  const selectedLabel = selectedNodeId ? nodeLabels[selectedNodeId] ?? selectedNodeId : "Workflow";
  return (
    <section aria-labelledby="debugger-title" className="nf-debugger" hidden={collapsed}>
      <header className="nf-debugger__header">
        <div><TerminalSquare aria-hidden="true" size={17} /><h2 id="debugger-title">Run debugger</h2><span className={`nf-shell-badge nf-shell-badge--${interrupted ? "failed" : summary.status}`}>{busy ? <LoaderCircle aria-hidden="true" size={12} /> : interrupted || summary.status === "failed" ? <AlertCircle aria-hidden="true" size={12} /> : summary.status === "completed" ? <CheckCircle2 aria-hidden="true" size={12} /> : <Clock3 aria-hidden="true" size={12} />}{busy ? "Running live" : interrupted ? "Interrupted" : hasEvents ? summary.status : "Ready"}</span></div>
        <div role="tablist" aria-label="Debugger views">
          {(["timeline", "data", "timing", "history"] as const).map((item) => <button aria-controls={`debugger-${item}`} aria-selected={view === item} className={`nf-debug-tab${view === item ? " nf-debug-tab--active" : ""}`} id={`debugger-tab-${item}`} key={item} onClick={() => setView(item)} role="tab" type="button">{item === "data" ? "Node data" : item === "history" ? "Runs" : item === "timing" ? "Timing" : "Timeline"}</button>)}
          <button aria-label="Collapse debugger" className="nf-icon-button" onClick={onToggle} title="Collapse debugger" type="button"><PanelBottomClose aria-hidden="true" size={17} /></button>
        </div>
      </header>
      {!hasEvents ? <div className="nf-debugger__empty">
        <span><Clock3 aria-hidden="true" size={20} /></span>
        <div><strong>Run once. See every step.</strong><p>The timeline, node data, errors, and exact timings will appear here from the real backend run.</p></div>
        <button className="nf-text-button" onClick={onRun} type="button"><Play aria-hidden="true" fill="currentColor" size={14} /> Run workflow</button>
      </div> : null}
      {hasEvents && view === "timeline" ? <div aria-labelledby="debugger-tab-timeline" className="nf-debugger__body nf-debugger__body--timeline" id="debugger-timeline" role="tabpanel">
        <div className="nf-run-summary" aria-label="Run summary">
          {activeTrace ? <span className="nf-replay-label"><History aria-hidden="true" size={12} /><strong>Replay</strong>Local trace</span> : null}
          <span><strong>{summary.durationMs === null ? "Live" : `${summary.durationMs} ms`}</strong>Total time</span>
          <span><strong>{summary.completed}/{summary.queued}</strong>Completed</span>
          <span><strong>{summary.failed}</strong>Failed</span>
          <span><strong>{summary.skipped}</strong>Skipped</span>
        </div>
        {summary.status === "completed" && finalNodeEvent ? <div className="nf-run-outcome" role="status"><CheckCircle2 aria-hidden="true" size={17} /><span><strong>Workflow completed</strong><small>Your final result is ready in {nodeLabels[finalNodeEvent.nodeId] ?? finalNodeEvent.nodeId}.</small></span><button onClick={() => { selectEvent(finalNodeEvent); showData("output"); }} type="button">View final output</button></div> : null}
        {summary.status === "failed" && failedNodeEvent ? <div className="nf-run-outcome nf-run-outcome--failed" role="alert"><AlertCircle aria-hidden="true" size={17} /><span><strong>Workflow stopped at {nodeLabels[failedNodeEvent.nodeId] ?? failedNodeEvent.nodeId}</strong><small>{failedNodeEvent.error.message}</small></span><button onClick={() => { selectEvent(failedNodeEvent); showData("error"); }} type="button">View error</button></div> : null}
        {interrupted ? <div className="nf-run-outcome nf-run-outcome--failed" role="alert"><AlertCircle aria-hidden="true" size={17} /><span><strong>Run connection interrupted</strong><small>{statusMessage}</small></span><button onClick={onRun} type="button">Retry run</button></div> : null}
        <ol className="nf-debugger__timeline" aria-label="Run events in server order">
          {events.map((event) => {
            const nodeId = eventNodeId(event);
            const active = selectedEvent?.sequence === event.sequence;
            return <li key={`${event.runId}.${event.sequence}`}><button aria-pressed={active} className={`nf-debug-event nf-debug-event--${event.type.replace(".", "-")}`} onClick={() => selectEvent(event)} type="button"><time dateTime={event.occurredAt}>{String(event.sequence).padStart(3, "0")}</time><span>{eventLabel(event)}</span><strong>{nodeId ? nodeLabels[nodeId] ?? nodeId : "Workflow"}</strong><p>{eventDescription(event)}</p></button></li>;
          })}
        </ol>
        {activeTrace ? <label className="nf-replay-scrubber"><span>Time travel</span><input aria-label="Replay event sequence" max={activeTrace.events.at(-1)?.sequence ?? 0} min="0" onChange={(event) => { const sequence = Number(event.target.value); setScrubSequence(sequence); setSelectedSequence(sequence); onReplayEvents(replayEventsThrough(activeTrace.events, sequence)); }} type="range" value={scrubSequence ?? 0} /><output>{(scrubSequence ?? 0) + 1} / {activeTrace.events.length} events</output></label> : null}
      </div> : null}
      {hasEvents && view === "data" ? <div aria-labelledby="debugger-tab-data" className="nf-debugger__body nf-debugger__body--data" id="debugger-data" role="tabpanel">
        <aside className="nf-debug-data-nav">
          <div><FileJson2 aria-hidden="true" size={16} /><span><small>Selected node</small><strong>{selectedLabel}</strong></span></div>
          <div role="tablist" aria-label="Selected node data">
            {(["input", "output", "logs", "error"] as const).map((item) => <button aria-selected={dataView === item} key={item} onClick={() => setDataView(item)} role="tab" type="button">{item}<span>{item === "logs" ? details.logs.length : item === "error" && details.error ? 1 : ""}</span></button>)}
          </div>
        </aside>
        <div className="nf-debug-data-panel" role="tabpanel">
          {!selectedNodeId ? <div className="nf-debug-empty-value">Select a node event in the timeline to inspect its real data.</div> : dataView === "input" ? <DataValue filename={`${selectedNodeId}-input.json`} label="Input" value={details.input} /> : dataView === "output" ? <DataValue filename={`${selectedNodeId}-output.json`} label="Output" value={details.output} /> : dataView === "logs" ? details.logs.length ? <ol className="nf-debug-logs">{details.logs.map((log, index) => <li key={`${index}.${log.stream}`}><span>{log.stream}</span><code>{log.message}</code>{log.truncated ? <em>truncated</em> : null}</li>)}</ol> : <div className="nf-debug-empty-value">No logs were emitted by this node.</div> : details.error ? <div className="nf-debug-error"><AlertCircle aria-hidden="true" size={18} /><span><strong>{details.error.code.replaceAll("_", " ")}</strong><p>{details.error.message}</p><small>{details.error.retryable ? "This error is safe to retry." : "This run cannot succeed unchanged. Use the message above to resolve the cause before running again."}</small></span></div> : <div className="nf-debug-empty-value">No error was recorded for this node.</div>}
        </div>
      </div> : null}
      {hasEvents && view === "timing" ? <div aria-labelledby="debugger-tab-timing" className="nf-debugger__body nf-debugger__body--timing" id="debugger-timing" role="tabpanel">
        {timings.length ? <><div className="nf-duration-waterfall" aria-hidden="true">{timings.map((timing) => <button className={`nf-duration-row nf-duration-row--${timing.status}`} key={`${timing.nodeId}.${timing.offsetMs}`} onClick={() => { const event = [...events].reverse().find((candidate) => "nodeId" in candidate && candidate.nodeId === timing.nodeId); if (event) selectEvent(event); showData(timing.status === "failed" ? "error" : "output"); }} type="button"><strong>{nodeLabels[timing.nodeId] ?? timing.nodeId}</strong><span><i style={{ marginLeft: `${(timing.offsetMs / maxEnd) * 100}%`, width: `${Math.max(1.5, (timing.durationMs / maxEnd) * 100)}%` }} /></span><em>{timing.durationMs} ms</em></button>)}</div><div className="nf-timing-table-wrap"><table><caption>Exact node timing data</caption><thead><tr><th scope="col">Node</th><th scope="col">Result</th><th scope="col">Start</th><th scope="col">Duration</th></tr></thead><tbody>{timings.map((timing) => <tr key={`${timing.nodeId}.${timing.offsetMs}`}><th scope="row">{nodeLabels[timing.nodeId] ?? timing.nodeId}</th><td>{timing.status}</td><td>{timing.offsetMs} ms</td><td>{timing.durationMs} ms</td></tr>)}</tbody></table></div></> : <div className="nf-debug-empty-value"><ListTree aria-hidden="true" size={18} /> Node timings appear as nodes finish.</div>}
      </div> : null}
      {view === "history" ? <div aria-labelledby="debugger-tab-history" className="nf-debugger__body nf-debugger__body--history" id="debugger-history" role="tabpanel">
        <div className="nf-run-history-list">
          <header><span><History aria-hidden="true" size={15} /><strong>Local run history</strong></span><button disabled={!traces.length} onClick={onClearHistory} type="button"><Trash2 aria-hidden="true" size={13} /> Clear</button></header>
          {!historyAvailable ? <div className="nf-debug-empty-value">Run history is unavailable in this browser. Live debugging still works normally.</div> : !traces.length ? <div className="nf-debug-empty-value">Completed runs will be saved only in this browser.</div> : <ol>{traces.map((trace) => { const incompatible = trace.workflowFormat !== workflowFormat || trace.workflowId !== workflowId || trace.workflowSignature !== workflowSignature; const terminal = trace.events.at(-1); return <li key={trace.runId}><span><strong>{terminal?.type === "run.completed" ? "Completed" : "Failed"}</strong><time dateTime={trace.completedAt}>{new Date(trace.completedAt).toLocaleString()}</time><small>{trace.events.length} events · {incompatible ? "Not compatible with current workflow" : "Ready to replay"}</small></span><button disabled={incompatible} onClick={() => replayTrace(trace)} type="button">Replay</button></li>; })}</ol>}
        </div>
        <div className="nf-run-compare">
          <header><span><GitCompare aria-hidden="true" size={15} /><strong>Compare latest two</strong></span><button disabled={comparableTraces.length < 2} onClick={() => setComparing((value) => !value)} type="button">{comparing ? "Hide" : "Compare"}</button></header>
          {!comparing ? <div className="nf-debug-empty-value">Compare two compatible runs to spot status, timing, and output changes.</div> : comparison.length ? <table><caption>Changes from previous to latest run</caption><thead><tr><th scope="col">Node</th><th scope="col">Status</th><th scope="col">Time</th><th scope="col">Output</th></tr></thead><tbody>{comparison.map((row) => <tr key={row.nodeId}><th scope="row">{nodeLabels[row.nodeId] ?? row.nodeId}</th><td>{row.statusBefore === row.statusAfter ? row.statusAfter : `${row.statusBefore ?? row.presence} → ${row.statusAfter ?? row.presence}`}</td><td>{row.durationDeltaMs === null ? "—" : `${row.durationDeltaMs >= 0 ? "+" : ""}${row.durationDeltaMs} ms`}</td><td>{row.outputChanged ? "Changed" : "Same"}</td></tr>)}</tbody></table> : <div className="nf-debug-empty-value">No comparable node data is available.</div>}
        </div>
        {activeTrace ? <button className="nf-return-live" onClick={showLive} type="button">Return to live run</button> : null}
      </div> : null}
      {busy || retryable ? <div className="nf-debugger__run-control"><span>{statusMessage}</span>{busy ? <button className="nf-button nf-button--secondary" onClick={onStop} type="button"><Square aria-hidden="true" fill="currentColor" size={12} /> Stop run</button> : <button className="nf-button nf-button--secondary" onClick={onRun} type="button"><RotateCcw aria-hidden="true" size={14} /> Retry run</button>}</div> : null}
    </section>
  );
}
