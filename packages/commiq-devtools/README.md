# @naikidev/commiq-devtools

Embedded devtools panel for React applications. Seven tabs over one shared instrumentation layer: browse and search the event log, trace causality chains, inspect state and diffs, read command timings, see which stores react to which events, and dispatch commands back into a running store.

## Install

```bash
pnpm add @naikidev/commiq-devtools
```

Peer dependencies: `@naikidev/commiq`, `react`, `react-dom`.

## Usage

No provider required. Use as a component or mount imperatively.

```tsx
import { CommiqDevtools } from "@naikidev/commiq-devtools";

function App() {
  return (
    <>
      <YourApp />
      <CommiqDevtools stores={{ cart: cartStore, auth: authStore }} />
    </>
  );
}
```

Or without JSX:

```ts
import { mountDevtools } from "@naikidev/commiq-devtools";

const unmount = mountDevtools({ stores: { cart: cartStore } });
```

`stores` is a `DevtoolsStoreRegistry` — a record of names to anything with `state`, `queue`, `flush`, `openStream` and `closeStream`, so sealed stores work directly.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `stores` | `DevtoolsStoreRegistry` | — | Named stores to instrument |
| `enabled` | `boolean` | auto | Hidden when `NODE_ENV === "production"` unless set explicitly |
| `position` | `"bottom-left" \| "bottom-right" \| "top-left" \| "top-right"` | `"bottom-right"` | Launcher button corner |
| `initialOpen` | `boolean` | `false` | Open the panel on mount |
| `maxEvents` | `number` | `500` | Timeline ring buffer size |
| `panelHeight` | `number` | — | Initial panel height in px |
| `buttonStyle` | `CSSProperties` | — | Overrides for the launcher button |

The panel body is code-split behind `React.lazy`, so a production build that leaves `CommiqDevtools` mounted with `enabled={false}` does not pull the panel into the bundle.

## Tabs

| Tab | What it shows |
|---|---|
| **Events** | Virtualized event log. Expand a row for the full payload |
| **Graph** | Causality graph built from `causedBy` links, with a visited set and depth cap so a cycle cannot hang the panel |
| **Timeline** | Events on a time axis, grouped per store |
| **Performance** | Per-command counts and durations |
| **State** | Current state per store as a keyboard-navigable tree, plus `prev`/`next` diffs |
| **Deps** | Force-directed map of which stores emit and react to which events. Drag, zoom and pan are preserved across updates |
| **Dispatch** | Command names harvested from the timeline, with their last payload prefilled. Edit the JSON and re-dispatch into the live store |

## Toolbar

- **Search** matches event name, store name, `correlationId`, `causedBy` and the serialized payload.
- **Store filter** narrows to a single store; **hide builtins** drops `stateChanged`, `commandStarted` and friends.
- **Pin** keeps chosen entries findable across filter changes, with a pinned-only toggle. Pins are shared between the Events and Graph tabs.
- **Error badge** shows the current error count and filters the log to errors when clicked.
- **Export** / **Import** write and read the timeline as JSON, so a captured session can be inspected elsewhere. While viewing imported data the panel shows a banner back to live.
- **Chain focus** narrows every tab to one causality chain.

## Performance

The panel recomputes off the collector's version counter rather than per render, and bumps that counter once per animation frame, so 25 commands produce fewer than six renders. The event log is virtualized and keyed by entry sequence, so ring-buffer eviction does not remount the list or lose scroll position.

## Accessibility

Tabs implement the ARIA tab pattern with arrow, `Home` and `End` navigation. The resize handles are focusable and keyboard-operable with `aria-valuenow`/`min`/`max`. The state tree is keyboard-activatable. The palette meets AA contrast in both themes.

## Also exported

`useDevtoolsEngine(stores, maxEvents = 500)` returns the `DevtoolsEngine` the panel is built on — `timeline`, `getChain`, `getStateHistory`, `storeStates`, `errors`, `clear` — if you want to build your own UI. `safeStringify`, `safeStringifyPretty` and `toSafeJson` handle circular and non-serializable values without throwing.

## Documentation

Full docs at [naikidev.github.io/commiq/docs](https://naikidev.github.io/commiq/docs/).

## License

MIT
