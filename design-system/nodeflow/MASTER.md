# NodeFlow Design System

> Global source of truth for NodeFlow's light-only product UI. Before building a page, read this file and then check `pages/<page-name>.md`; a page file may only override details explicitly documented there.

**Status:** accepted implementation direction

**Product:** public, no-login visual workflow debugger

**Style:** precision minimalism with Swiss information hierarchy

**Design dials:** variance 6/10 · motion 4/10 · density 8/10

## Product principles

1. **The workflow is the hero.** Chrome stays quiet so graph structure, data, and execution state remain dominant.
2. **Real state, visibly real.** Runs use timestamps, event labels, logs, and explicit status language—never decorative fake metrics.
3. **Dense, not cramped.** Compact information uses a 4px rhythm, clear grouping, and generous pointer targets.
4. **Light by intent.** NodeFlow ships one carefully tuned light theme. Do not add dark tokens, a theme switcher, or system-theme branching.
5. **Color supports meaning.** Every status also has an icon, label, and/or shape cue.

## Visual direction

- Use crisp white surfaces over a cool slate canvas (`#F8FAFC`).
- Use navy for product hierarchy and blue for interactive actions.
- Prefer borders and tonal separation to large shadows. Reserve elevation for floating menus, selected nodes, and dialogs.
- Use an 8px grid, mostly 8–12px radii, compact uppercase metadata, and tabular data.
- Avoid glassmorphism, gradients behind text, neon glows, oversized marketing typography, emoji icons, and ornamental motion.

## Token architecture

Implementation lives in `frontend/src/design-system/tokens.css` and follows three layers:

```text
primitive values → semantic purpose → component contract
```

Components must consume semantic or component tokens. Raw hex values are allowed only in the primitive section of the token file.

### Core color contract

| Role | Value | Purpose |
|---|---:|---|
| canvas | `#F8FAFC` | app background |
| workspace | `#F3F6FA` | graph and recessed regions |
| surface | `#FFFFFF` | cards, panels, controls |
| foreground | `#0F172A` | primary text |
| foreground-subtle | `#475569` | secondary text; AA on light surfaces |
| border | `#CBD5E1` | structural boundaries |
| border-subtle | `#E2E8F0` | internal separators |
| brand | `#1E3A5F` | product identity, high-emphasis hierarchy |
| action | `#2563EB` | primary actions, selected controls, focus |
| destructive | `#B91C1C` | failure and destructive actions |

### Execution states

| State | Color | Required non-color cue |
|---|---:|---|
| idle | slate | hollow circle + “Idle” |
| queued | slate | clock icon + “Queued” |
| running | blue | rotating progress icon + “Running” + elapsed time |
| succeeded | green | check-circle icon + “Succeeded” |
| failed | red | x-circle icon + “Failed” + recovery action |
| paused | violet | pause-circle icon + “Paused” |
| skipped | slate | minus-circle icon + “Skipped” |

## Typography

- **UI and headings:** `Inter`, falling back to the native system sans stack. Use 600–700 weight for hierarchy, not extreme size.
- **Code and data:** `JetBrains Mono`, falling back to `SFMono-Regular`, Consolas, and monospace.
- Base body text is 16px/1.5. Dense labels may be 12–14px when they are not long-form body copy.
- Use tabular numerals for durations, timestamps, counts, and event indexes.
- Keep headings sentence case. Use uppercase only for short metadata labels with tracking.

## Layout and density

- Primitive spacing follows 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, and 64px.
- Desktop shell target: 56px header, 280px library, fluid canvas, 340px inspector/debugger.
- Breakpoints: 375, 768, 1024, and 1440px.
- At widths below 1024px, editing may progressively collapse into a read-only workflow viewer; never squeeze three panels into an unusable canvas.
- Interactive controls target at least 44×44px. Graph ports may be visually smaller only when their effective pointer target is expanded.

## Shape, elevation, and focus

- Radius scale: 4px small, 8px controls, 12px panels, 16px dialogs; pills only for status badges and segmented controls.
- Border is the default separator. Use `shadow-sm` for resting cards, `shadow-md` for selected/floating content, and `shadow-lg` for dialogs.
- All keyboard focus uses a visible 2px blue ring with a 2px light offset. Never remove focus without an equivalent.
- Selected nodes combine a blue outline, subtle tinted surface, and explicit “Selected” semantics where needed.

## Motion

- Fast feedback: 120ms; standard state change: 180ms; panel transition: 240ms.
- Animate only opacity and transform. Do not animate width, height, top, or left.
- Motion expresses causality: a panel enters from its trigger edge; a running node pulses subtly; new log rows fade into place.
- No looping decoration. The running indicator is the only persistent motion.
- Under `prefers-reduced-motion: reduce`, durations become effectively instant and the running state uses a static icon plus text.

## Component contracts

### Buttons

- Primary is reserved for the screen's single main action, normally **Run workflow**.
- Secondary and ghost variants carry editing and navigation actions.
- Destructive actions remain spatially separated and require confirmation when data loss is not undoable.
- States: default, hover, pressed, focus-visible, disabled, loading. Loading retains the label and announces busy state.

### Inputs

- Always render a visible label. Add persistent helper text for data mapping, expressions, and credentials.
- Validate on blur or submit, place errors below the field, and connect them with `aria-describedby`.
- Read-only data has a distinct surface and remains selectable; it is not styled as disabled.

### Nodes and ports

- Node anatomy: category rail, icon, title, status, concise summary, typed input/output ports.
- Port shape encodes type family in addition to color. Labels are visible at useful zoom levels.
- Selected, running, succeeded, failed, disabled, and breakpoint states must not change card dimensions.

### Status and logs

- Badges always pair icon + text. Never communicate a run result with a colored dot alone.
- Log rows use monospaced timestamps, stable columns, severity labels, and expandable structured payloads.
- Streaming announcements use one polite, atomic live region and do not steal focus.

## Accessibility and interaction quality bar

- Normal text contrast is at least 4.5:1; component boundaries and focus indicators are at least 3:1.
- Pointer interactions have keyboard equivalents. Node insertion and connection creation cannot require dragging.
- Icon-only buttons have accessible names; decorative icons beside visible labels are `aria-hidden`.
- Tab order follows shell → library → canvas controls → inspector/debugger.
- The page includes a skip link and focused controls are never obscured by sticky chrome.
- Zoom remains enabled. No horizontal page scroll at 375px.

## Pre-delivery checks

- [ ] Only light-mode tokens are present.
- [ ] No raw color values appear in component styles.
- [ ] No emoji or mixed icon families.
- [ ] Hover, pressed, focus, disabled, loading, error, and empty states are exercised.
- [ ] Reduced-motion behavior is verified.
- [ ] 375, 768, 1024, and 1440px layouts are verified.
- [ ] Pointer and keyboard workflows both complete core actions.
- [ ] Status meaning survives grayscale and color-vision checks.
