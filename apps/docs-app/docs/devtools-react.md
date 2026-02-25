---
sidebar_position: 6
---

# Devtools React

`@naikidev/commiq-devtools-react` provides an embedded devtools panel for React applications. Drop it into your app to inspect events, trace causality, view state, and monitor performance — no browser extension required.

## Installation

```bash
pnpm add @naikidev/commiq-devtools-react @naikidev/commiq-devtools
```

Peer dependencies: `@naikidev/commiq`, `react`, `react-dom`.

## Basic Usage

```tsx
import { CommiqDevtools } from "@naikidev/commiq-devtools-react";
import { counterStore } from "./stores/counter";
import { todoStore } from "./stores/todos";

function App() {
  return (
    <>
      <YourApp />
      <CommiqDevtools
        stores={{ counter: counterStore, todos: todoStore }}
      />
    </>
  );
}
```

The component renders a floating button in the corner of the screen. Click it to open the devtools panel.

## Props

| Prop          | Type                                                           | Default          | Description                                                                 |
| ------------- | -------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------- |
| `stores`      | `Record<string, SealedStore<any>>`                             | (required)       | Stores to monitor, keyed by display name                                    |
| `enabled`     | `boolean`                                                      | auto-detect      | `true` = always show, `false` = never show, `undefined` = hide in production |
| `position`    | `"bottom-left" \| "bottom-right" \| "top-left" \| "top-right"` | `"bottom-right"` | Position of the floating trigger button                                     |
| `initialOpen` | `boolean`                                                      | `false`          | Whether the panel starts open                                               |
| `maxEvents`   | `number`                                                       | `500`            | Maximum events kept in the timeline ring buffer                             |
| `panelHeight` | `number`                                                       | `360`            | Panel height in pixels                                                      |
| `buttonStyle` | `CSSProperties`                                                | —                | Additional styles for the trigger button                                    |

## Features

### Events Tab

Linear event log showing all store activity. Filter by store or toggle built-in events. Click any row to expand details including event data and state diffs.

### Causality Graph

Hierarchical tree view of command causality chains. See which commands triggered other commands and events, with expandable detail panels.

### Timeline

Visual SVG timeline with per-store swimlanes. Events appear as dots connected by causality links. Zoom with scroll, pan by dragging.

### Performance

Aggregated command metrics: total/average/min/max duration per command type, with visual bar charts. Sort by total time, average time, max time, or call count.

### State

Current state of each connected store displayed as a collapsible JSON tree.

### Dependency Map

Force-directed graph showing inter-store dependencies. Nodes represent stores, edges show command flows between them with call counts.

## Production Gating

By default, `CommiqDevtools` auto-detects the environment and renders nothing in production. Override this with the `enabled` prop:

```tsx
// Always show (e.g., staging environment)
<CommiqDevtools stores={stores} enabled={true} />

// Never show
<CommiqDevtools stores={stores} enabled={false} />

// Auto-detect (default) — hidden when NODE_ENV === "production"
<CommiqDevtools stores={stores} />
```

## Export and Import

The devtools panel includes export/import buttons. Export saves the current timeline as a JSON file. Import loads a previously exported timeline for offline inspection.
