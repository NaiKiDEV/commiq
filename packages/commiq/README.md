# @naikidev/commiq

Command and event driven state management for JavaScript and TypeScript. Commands enter a queue and are handled one at a time; state changes and events are published as they happen; nothing thrown inside the library is swallowed.

Only dependency: `nanoid`.

## Install

```bash
pnpm add @naikidev/commiq
```

## Usage

```typescript
import {
  createStore,
  createCommandDef,
  createEvent,
  sealStore,
} from "@naikidev/commiq";

type CartState = { items: string[] };

const addItem = createCommandDef<string>("addItem");
const itemAdded = createEvent<{ text: string }>("itemAdded");

const store = createStore<CartState>(
  { items: [] },
  { onError: (report) => console.error(report.source, report.error) },
);

store.addCommandHandler(addItem, (ctx, cmd) => {
  ctx.setState({ items: [...ctx.state.items, cmd.data] });
  ctx.emit(itemAdded, { text: cmd.data });
});

export const cart = sealStore(store);

const result = await cart.queue(addItem, "milk");
result.status; // "handled"
cart.state.items; // readonly ["milk"]
```

## Store

`createStore<S>(initialState, options?)` returns a `StoreImpl<S>`.

| `StoreOptions` | Type | Default | Description |
|---|---|---|---|
| `onError` | `(report: StoreErrorReport) => void` | console outside production | Receives every error the store catches |
| `suspendWarningMs` | `number` | `5000` | Reports once when a `suspend()` gate is held longer than this. `0` disables |

| Member | Description |
|---|---|
| `state` | `DeepReadonly<S>`. Deep-frozen outside production |
| `queue(def, data?)` / `queue(command)` | Enqueue a command, returns a `CommandHandle` |
| `flush()` | Resolves on quiescence. **Throws** if called from inside a handler |
| `suspend()` | Pauses command execution, returns a release |
| `isSuspended` | Whether any suspension gate is held |
| `addCommandHandler(nameOrDef, handler, options?)` | Registers the single handler for that name. Returns `this` |
| `removeCommandHandler(nameOrDef)` | Unregisters, returns whether one existed |
| `addEventHandler(eventDef, handler)` | Returns an `Unsubscribe` |
| `removeEventHandler(eventDef, handler)` | Explicit form, returns whether it was attached |
| `openStream(listener)` | Returns an `Unsubscribe` |
| `closeStream(listener)` | Explicit form |
| `useExtension(ext)` | Adds a context extension, widens the context types. Throws on an active store |
| `removeExtension(ext)` | Detaches by identity and runs its `destroy()` |
| `replaceState(next)` | Replaces state wholesale and publishes `stateReset`. Used for hydration |
| `destroy()` | Satisfies `Disposable`. Tears everything down; outstanding handles settle as `discarded` |

`sealStore(store)` returns a frozen `SealedStore<S>` exposing only `state`, `queue`, `flush`, `suspend`, `openStream` and `closeStream` — the consumer and plugin API. `state` is `DeepReadonly<S>` and the underlying object is frozen outside production, so `sealed.state.x = 1` throws rather than mutating the store.

## Commands

`createCommandDef<Data>(name)` declares a typed command identity. `addCommandHandler` and `queue` then share one payload type.

```typescript
const setQuery = createCommandDef<string>("setQuery");
const clear = createCommandDef("clear");

queue(setQuery, "shoes");
queue(clear); // payload omitted because Data is void
```

`createCommand(name, data, options?)` builds a command object directly, and plain string names still work with `addCommandHandler`.

`queue()` **clones** the command it is given, assigns a `correlationId`, and sets `causedBy` — an explicit `causedBy` wins over the ambient correlationId of the command currently being processed.

### CommandContext

| Member | Type | Description |
|---|---|---|
| `state` | `DeepReadonly<S>` | Live getter, re-read on every access |
| `setState` | `(next: S \| (prev: DeepReadonly<S>) => S) => void` | Publishes `stateChanged` immediately, once per call |
| `emit` | `<D>(def: EventDef<D>, data: D) => void` | Publishes immediately |
| `signal` | `AbortSignal \| undefined` | Present when the handler is `interruptable` |

After a handler settles its context is disposed: a late `setState` or `emit` is rejected and reported as `disposedContext`.

### Handler options

| Option | Default | Description |
|---|---|---|
| `notify` | `false` | Also emits the interned `handledEvent(name)` event on success |
| `interruptable` | `false` | A newer command of the same name aborts the in-flight one via `ctx.signal` |
| `rollbackOnInterrupt` | `false` | On interruption, restores the state captured before the handler ran, published as its own `stateChanged` |

### CommandHandle

`queue()` returns a `CommandHandle` — a `Promise<CommandResult>` that also carries `command` and `correlationId`. It **never rejects**, so an ignored handle cannot become an unhandled rejection.

```typescript
type CommandResult = {
  status: "handled" | "failed" | "interrupted" | "invalid" | "discarded";
  command: Command;
  error?: unknown;
};
```

A handle settles when that command settles. Trailing events are dispatched afterwards, so use `flush()` when you need full quiescence.

## Events

`createEvent<Data>(name)` mints a fresh `Symbol` as `EventDef.id`, with `name` kept for logging and serialization. Matching is by symbol identity, so two events with the same name never collide. `handledEvent(name)` is the one interned exception: it returns the same `EventDef` for a given name, which is what makes `notify: true` subscribable.

```typescript
const off = store.addEventHandler(itemAdded, (ctx, event) => {
  ctx.queue(logItem, event.data.text);
});
```

`EventContext` is `{ state, queue }` — event handlers cannot call `setState`. Commands remain the only way to change state.

Use `matchEvent(event, def)` to narrow a stream event to its payload type.

### Builtin events

| Event | Data | Emitted when |
|---|---|---|
| `stateChanged` | `{ prev, next }` | Every `setState` call — three calls in one handler publish three events |
| `commandStarted` | `{ command }` | A handler is about to run |
| `commandHandled` | `{ command }` | A handler finished successfully |
| `commandInterrupted` | `{ command, phase }` | Interrupted while `"queued"` or `"running"` |
| `invalidCommand` | `{ command }` | No handler is registered for the name |
| `commandHandlingError` | `{ command, error }` | A command handler threw |
| `eventHandlingError` | `{ event, error }` | An event handler threw |
| `unhandledError` | `StoreErrorReport` | A failure with no other event channel |
| `stateReset` | — | `replaceState()` was called |

Builtin events are matched by name as well as symbol, so a duplicated copy of the core module cannot silently break subscriptions.

## Errors

```typescript
type StoreErrorReport = {
  error: unknown;
  source: StoreErrorSource;
  command?: Command;
  event?: StoreEvent;
};
```

| `source` | Raised when |
|---|---|
| `commandHandler` | A command handler threw or rejected |
| `eventHandler` | An event handler threw or rejected |
| `streamListener` | A stream listener threw |
| `contextExtension` | An extension factory or hook threw |
| `disposedContext` | `setState`/`emit` was called after the handler settled |
| `queueProcessor` | The queue loop itself failed |
| `duplicateHandler` | A second handler was registered for a command name |
| `destroyedStore` | An operation was attempted after `destroy()` |
| `suspendedQueue` | A `suspend()` gate was held past `suspendWarningMs` |

An event handler that throws never fails the command that emitted the event. Stream listeners and event handlers are dispatched from a snapshot and isolated individually, so one failure cannot affect the rest.

## Suspension

`suspend()` pauses **command execution only** and returns a release. It is counted, not boolean: every suspender must release before processing resumes, and `release()` is idempotent.

```typescript
const release = store.suspend();
try {
  store.replaceState(await loadFromStorage());
} finally {
  release();
}
```

Events, stream listeners and `replaceState` keep working while suspended — that is what makes plugin hydration possible. `queue()` still accepts commands and returns real handles; they run in order once the gate opens.

## Context extensions

`useExtension` attaches a `ContextExtensionDef<S, TCommand, TEvent>` and widens the store's command and event context types **separately**, so an extension that only defines `command` is a compile error if referenced from an event handler.

```typescript
const store = createStore<State>(initial).useExtension({
  command: () => ({ now: () => Date.now() }),
});

store.addCommandHandler(tick, (ctx) => {
  ctx.setState({ at: ctx.now() });
});
```

Extensions may expose `afterCommand`, `afterEvent` and `destroy`. Prebuilt extensions live in [`@naikidev/commiq-context`](../commiq-context).

## Event bus

`createEventBus()` routes events between stores without direct dependencies. `connect` is refcounted, so connecting twice and disconnecting once keeps the subscription alive.

```typescript
const bus = createEventBus();
const detach = bus.connect(sealedStoreA);
const off = bus.on(orderPlaced, (event) => sealedStoreB.queue(process, event.data));

off();
detach();
bus.destroy();
```

## Causality

Every `StoreEvent` and `Command` carries `timestamp`, `correlationId` and `causedBy` (the immediate cause only). Walking the `causedBy` links reconstructs a full chain, which is what [`@naikidev/commiq-devtools-core`](../commiq-devtools-core) does.

## Upgrading from 1.x

2.0 is a breaking release. See the [migration guide](https://naikidev.github.io/commiq/docs/migration-v2/).

## Documentation

Full docs at [naikidev.github.io/commiq/docs](https://naikidev.github.io/commiq/docs/).

## License

MIT
