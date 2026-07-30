# @naikidev/commiq-devtools-core

Instrumentation and debugging tools for Commiq stores. Tracks events, causality chains, state history, and supports pluggable transports.

## Install

```bash
pnpm add @naikidev/commiq-devtools-core
```

## Usage

```typescript
import { createDevtools } from "@naikidev/commiq-devtools-core";

const devtools = createDevtools();
devtools.connect(store, "counter");

// Query the timeline
const timeline = devtools.getTimeline();
const chain = devtools.getChain(correlationId);
const history = devtools.getStateHistory("counter");
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `transport` | `windowMessageTransport()` | Where messages are sent |
| `maxEvents` | `1000` | Timeline ring buffer size |
| `maxSnapshots` | `100` | State history ring buffer size per store |
| `snapshotMode` | `"safe"` | `"safe"`, `"structured"` or `"none"` |
| `detectAliasedState` | `true` | Warn when `"safe"` mode captures a value by reference |
| `logToConsole` | `false` | Log every timeline entry |
| `onError` | `console.warn` | Receives transport failures and aliasing warnings |

## Snapshot modes

- `"safe"` — bounded structural clone of plain objects, arrays, `Date`, `Map` and `Set`. Anything
  else (class instances, typed arrays, `ArrayBuffer`) is captured **by reference**, and `Map`/`Set`
  keys are kept by reference too.
- `"structured"` — `structuredClone`, falling back to `"safe"` when the value is not cloneable.
- `"none"` — no copying, state history aliases live state.

### Aliased state warnings

A value captured by reference can be mutated after capture, which retroactively rewrites recorded
history. In `"safe"` mode the snapshot walk detects these values and reports the store name and
property path through `onError` once per store and path, up to `MAX_ALIAS_WARNINGS` reports:

```
store "cart": state.items.0.cache holds a Map that snapshotMode "safe" captures by reference, ...
```

Fix it by keeping state plain, or switch to `snapshotMode: "structured"`. Set
`detectAliasedState: false` to silence the warnings (also removes the detection overhead).

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
