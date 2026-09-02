import {
  AlertCircle,
  Check,
  CheckCircle2,
  CirclePause,
  Clock3,
  Code2,
  LoaderCircle,
  MinusCircle,
  Play,
  Search,
  Sparkles,
  type LucideIcon,
  XCircle,
} from 'lucide-react';
import './showcase.css';

type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'paused' | 'skipped';

const statuses: Array<{ icon: LucideIcon; label: string; status: RunStatus }> = [
  { icon: Clock3, label: 'Queued', status: 'queued' },
  { icon: LoaderCircle, label: 'Running', status: 'running' },
  { icon: CheckCircle2, label: 'Succeeded', status: 'succeeded' },
  { icon: XCircle, label: 'Failed', status: 'failed' },
  { icon: CirclePause, label: 'Paused', status: 'paused' },
  { icon: MinusCircle, label: 'Skipped', status: 'skipped' },
];

function StatusBadge({ icon: StatusIcon, label, status }: (typeof statuses)[number]) {
  return (
    <span className={`nf-status nf-status--${status}`}>
      <StatusIcon aria-hidden="true" size={14} strokeWidth={2.25} />
      {label}
    </span>
  );
}

function SampleNode({ failed = false, selected = false }: { failed?: boolean; selected?: boolean }) {
  const nodeStatus = failed
    ? { icon: XCircle, label: 'Failed', status: 'failed' as const }
    : selected
      ? { icon: LoaderCircle, label: 'Running', status: 'running' as const }
      : { icon: Clock3, label: 'Queued', status: 'queued' as const };

  return (
    <article className={`nf-node${selected ? ' nf-node--selected' : ''}${failed ? ' nf-node--failed' : ''}`}>
      <div className="nf-node__rail" aria-hidden="true" />
      <div className="nf-node__content">
        <header className="nf-node__header">
          <span className="nf-node__icon"><Code2 aria-hidden="true" size={16} /></span>
          <span>
            <span className="nf-node__eyebrow">Transform</span>
            <strong>Parse incident</strong>
          </span>
          <StatusBadge {...nodeStatus} />
        </header>
        <p>Normalizes the webhook payload into the incident contract.</p>
        <footer className="nf-node__footer">
          <span><i className="nf-port nf-port--input" /> event</span>
          <code>{selected ? '00:01.284' : 'application/json'}</code>
          <span>incident <i className="nf-port nf-port--output" /></span>
        </footer>
      </div>
    </article>
  );
}

export function DesignSystemShowcase() {
  return (
    <>
      <a className="nf-skip-link" href="#main-content">Skip to design system</a>
      <main className="nf-showcase" id="main-content" tabIndex={-1}>
      <header className="nf-showcase__hero">
        <div>
          <span className="nf-kicker"><Sparkles aria-hidden="true" size={14} /> Phase 2 · Visual foundation</span>
          <h1>NodeFlow, in the light.</h1>
          <p>A precise, calm system for building workflows and understanding every execution.</p>
        </div>
        <div className="nf-hero-actions" aria-label="Button examples">
          <button className="nf-button nf-button--secondary" type="button">Import workflow</button>
          <button className="nf-button nf-button--primary" type="button"><Play aria-hidden="true" size={16} fill="currentColor" /> Run workflow</button>
        </div>
      </header>

      <section className="nf-showcase__section" aria-labelledby="foundation-title">
        <div className="nf-section-heading">
          <div><span>01</span><h2 id="foundation-title">Foundation</h2></div>
          <p>Light-only surfaces, quiet structure, unmistakable interaction.</p>
        </div>
        <div className="nf-foundation-grid">
          <article className="nf-showcase-card nf-color-card">
            <h3>Color roles</h3>
            <div className="nf-swatches">
              <span className="nf-swatch nf-swatch--canvas"><i />Canvas <code>#F8FAFC</code></span>
              <span className="nf-swatch nf-swatch--brand"><i />Brand <code>#1E3A5F</code></span>
              <span className="nf-swatch nf-swatch--action"><i />Action <code>#2563EB</code></span>
              <span className="nf-swatch nf-swatch--ink"><i />Ink <code>#0F172A</code></span>
            </div>
          </article>
          <article className="nf-showcase-card nf-type-card">
            <h3>Type hierarchy</h3>
            <p className="nf-type-card__heading">Workflow clarity at every level</p>
            <p>Inter keeps controls readable. Monospace makes durations, payloads, and traces scan instantly.</p>
            <code>run_01J8Y4FQ · 284ms · HTTP 200</code>
          </article>
          <article className="nf-showcase-card">
            <h3>Controls</h3>
            <div className="nf-control-row">
              <button className="nf-button nf-button--primary" type="button"><Check aria-hidden="true" size={16} /> Primary</button>
              <button className="nf-button nf-button--secondary" type="button">Secondary</button>
              <button className="nf-button nf-button--ghost" type="button">Ghost</button>
              <button className="nf-button nf-button--primary" disabled type="button">Disabled</button>
            </div>
            <label className="nf-field">
              <span>Search nodes</span>
              <span className="nf-input-wrap"><Search aria-hidden="true" size={16} /><input placeholder="Try “HTTP” or “AI”" /></span>
              <small>Search by capability, input, or output type.</small>
            </label>
          </article>
        </div>
      </section>

      <section className="nf-showcase__section" aria-labelledby="states-title">
        <div className="nf-section-heading">
          <div><span>02</span><h2 id="states-title">Execution language</h2></div>
          <p>Every state is communicated by icon, label, and color.</p>
        </div>
        <article className="nf-showcase-card">
          <div className="nf-status-row">
            {statuses.map((status) => <StatusBadge key={status.status} {...status} />)}
          </div>
        </article>
      </section>

      <section className="nf-showcase__section" aria-labelledby="nodes-title">
        <div className="nf-section-heading">
          <div><span>03</span><h2 id="nodes-title">Node anatomy</h2></div>
          <p>Compact enough for real graphs, detailed enough to debug without guessing.</p>
        </div>
        <div className="nf-node-grid">
          <div><span className="nf-example-label">Default</span><SampleNode /></div>
          <div><span className="nf-example-label">Selected + running</span><SampleNode selected /></div>
          <div><span className="nf-example-label">Failed</span><SampleNode failed /></div>
        </div>
      </section>

      <section className="nf-showcase__section" aria-labelledby="feedback-title">
        <div className="nf-section-heading">
          <div><span>04</span><h2 id="feedback-title">System feedback</h2></div>
          <p>Errors explain what happened and what the user can do next.</p>
        </div>
        <div className="nf-feedback-grid">
          <div className="nf-alert nf-alert--success" role="status">
            <CheckCircle2 aria-hidden="true" size={18} />
            <div><strong>Workflow validated</strong><span>6 nodes and 7 connections are ready to run.</span></div>
          </div>
          <div className="nf-alert nf-alert--danger" role="alert">
            <AlertCircle aria-hidden="true" size={18} />
            <div><strong>JavaScript node stopped</strong><span>Line 18 returned an undefined incident. Open the node to fix the output mapping.</span></div>
            <button type="button">Open node</button>
          </div>
        </div>
      </section>
      </main>
    </>
  );
}
