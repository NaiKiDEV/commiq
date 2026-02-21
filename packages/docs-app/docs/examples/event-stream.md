---
sidebar_position: 3
sidebar_label: Event Stream
---

# Event Stream

Every store exposes a real-time stream of all events it emits — builtin and custom. This is useful for debugging, logging, analytics, or building reactive UIs that respond to any store activity.

## The API

```ts
// Subscribe
const listener = (event: StoreEvent) => {
  console.log(event.name, event.data);
};

store.openStream(listener);

// Unsubscribe
store.closeStream(listener);
```

## Builtin Events

Every command processed by a store emits a sequence of builtin events:

```
queue(command)
  │
  ├─► commandStarted   { command }
  │
  ├─► [handler runs]
  │     ├─► stateChanged      { prev, next }   (if state changed)
  │     └─► [custom events]                     (if handler calls ctx.emit)
  │
  ├─► commandHandled   { command }
  │
  └─► (if notify: true)
      └─► <commandName>:handled  { command }
```

Error cases:

```
queue(unknownCommand)  ──► invalidCommand         { command }
queue(failingCommand)  ──► commandHandlingError   { command, error }
```

## Example: Real-Time Event Log

### Subscribing to multiple stores

```ts
import type { StoreEvent } from "@naikidev/commiq";

interface LogEntry {
  storeName: string;
  eventName: string;
  data: unknown;
  time: string;
}

function createStreamLogger(
  stores: Record<string, SealedStore<any>>,
  onEntry: (entry: LogEntry) => void,
) {
  const listeners: Array<{
    store: SealedStore<any>;
    listener: (e: StoreEvent) => void;
  }> = [];

  for (const [name, store] of Object.entries(stores)) {
    const listener = (event: StoreEvent) => {
      onEntry({
        storeName: name,
        eventName: event.name,
        data: event.data,
        time: new Date().toISOString(),
      });
    };
    store.openStream(listener);
    listeners.push({ store, listener });
  }

  // Return cleanup function
  return () => {
    for (const { store, listener } of listeners) {
      store.closeStream(listener);
    }
  };
}
```

### React component

```tsx
function EventStreamViewer() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    const cleanup = createStreamLogger(
      { counter: counterStore, todo: todoStore },
      (entry) => setEntries((prev) => [...prev.slice(-200), entry]),
    );
    return cleanup;
  }, []);

  return (
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Store</th>
          <th>Event</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={i}>
            <td>{e.time}</td>
            <td>{e.storeName}</td>
            <td>{e.eventName}</td>
            <td>{JSON.stringify(e.data)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Filtering by event type

```ts
import { builtinEvents } from "@naikidev/commiq";

store.openStream((event) => {
  // Only state changes
  if (event.id === builtinEvents.stateChanged.id) {
    console.log("State:", event.data.prev, "→", event.data.next);
  }

  // Only errors
  if (event.id === builtinEvents.commandHandlingError.id) {
    reportError(event.data.error);
  }
});
```

## Use Cases

| Use Case             | Approach                                                          |
| -------------------- | ----------------------------------------------------------------- |
| **Dev tools**        | Log all events to console or a debug panel                        |
| **Analytics**        | Track specific events and send to an analytics service            |
| **Undo/Redo**        | Record `stateChanged` events and replay `prev` states             |
| **Cross-store sync** | Use `openStream` directly (or event bus) to react to other stores |
| **Testing**          | Assert that specific events were emitted during a command         |
