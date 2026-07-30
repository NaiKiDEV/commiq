# Commiq

Command and event driven state management for JavaScript and TypeScript.

Commiq models state as a pipeline: commands enter a queue, handlers process them one at a time, state updates are applied, and events are broadcast to subscribers. Stores stay decoupled from each other and from the UI layer.

**Current version: 2.1.0.** The 2.x line is a breaking release across every package. If you are on 1.x, read the [migration guide](https://naikidev.github.io/commiq/docs/migration-v2/) before upgrading.

## What 2.0 changes

- **State reads are `DeepReadonly<S>`** and deep-frozen outside production. `sealStore` used to hand back the live state object by reference, so `sealed.state.x = 1` mutated the store silently. Commands are now the only way to change state.
- **`stateChanged` fires once per `setState`**, not once per command. A handler that calls `setState` three times publishes three events, so intermediate state is observable.
- **An explicit error channel.** `createStore(state, { onError })` receives a `StoreErrorReport` for every failure the store catches, and `unhandledError` / `eventHandlingError` are emitted as builtin events. Nothing is dropped on the floor.
- **`queue()` returns a `CommandHandle`** — an awaitable `Promise<CommandResult>` carrying the final status (`handled`, `failed`, `interrupted`, `invalid`, `discarded`).
- **`createCommandDef`** gives commands a typed identity, so `queue(addItem, "text")` is checked against the handler's payload type.
- **`suspend()`** pauses command processing and returns a resume function, for gating the queue during hydration or batched work.
- **Subscriptions return an unsubscribe function.** `addEventHandler` and `openStream` return `Unsubscribe` instead of `this`/`void`, and `EventBus.connect` is refcounted with `off()` and `destroy()`.
- **A shared `Disposable` contract** (`{ destroy(): void }`) that every plugin implements.

## Packages

| Package                                                           | Description                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`@naikidev/commiq`](packages/commiq)                             | Core library. Framework-agnostic.                                                       |
| [`@naikidev/commiq-react`](packages/commiq-react)                 | React bindings — selectors, dispatch, event and stream hooks.                            |
| [`@naikidev/commiq-context`](packages/commiq-context)             | Context extensions. Add typed properties to command and event handler contexts.          |
| [`@naikidev/commiq-effects`](packages/commiq-effects)             | Side effects driven by events, with concurrency modes, cancellation and debounce.        |
| [`@naikidev/commiq-persist`](packages/commiq-persist)             | Persistence and rehydration. `localStorage`, `sessionStorage`, IndexedDB, or your own.   |
| [`@naikidev/commiq-devtools-core`](packages/commiq-devtools-core) | Instrumentation: timeline, causality chains, state history, pluggable transports.        |
| [`@naikidev/commiq-devtools`](packages/commiq-devtools)           | Embedded React devtools panel.                                                           |
| [`@naikidev/commiq-otel`](packages/commiq-otel)                   | OpenTelemetry tracing. Commands become spans.                                            |
| [`@naikidev/commiq-example`](apps/commiq-example)                 | Example application.                                                                    |
| [`@naikidev/docs`](apps/docs-app)                                 | Documentation site (Fumadocs / Next.js).                                                |

All packages share a version and are published together.

## Install

```sh
npm install @naikidev/commiq
# or
pnpm add @naikidev/commiq
```

For React:

```sh
npm install @naikidev/commiq @naikidev/commiq-react
```

## Quick Start

```ts
import { createStore, createCommandDef, sealStore } from "@naikidev/commiq";

type CounterState = { count: number };

const increment = createCommandDef("increment");

const store = createStore<CounterState>({ count: 0 });

store.addCommandHandler(increment, (ctx) => {
  ctx.setState({ count: ctx.state.count + 1 });
});

const counter = sealStore(store);

await counter.queue(increment);
console.log(counter.state.count); // 1
```

Commands are processed asynchronously. `queue()` hands back a `CommandHandle` you can await, or you can await `counter.flush()` to wait for the whole queue to drain. Reading state immediately after `queue()` without awaiting either one still shows the old value.

## Core Concepts

### Commands

A command is a name plus a data payload — an intent to change state. `createCommandDef<Data>(name)` declares one so the payload type is checked at the dispatch site.

```ts
const addItem = createCommandDef<string>("addItem");
const resetFilters = createCommandDef("resetFilters");

queue(addItem, "milk");
queue(resetFilters);
```

`createCommand(name, data)` still exists for building a command object by hand.

### Handlers

Command handlers receive a context with `state` (`DeepReadonly<S>`, read live at access time), `setState`, `emit`, and `signal` when the handler is interruptable.

```ts
store.addCommandHandler(addItem, (ctx, cmd) => {
  ctx.setState({ items: [...ctx.state.items, cmd.data] });
  ctx.emit(itemAdded, { text: cmd.data });
});
```

Handlers can be `async`. The queue is sequential, so an async handler finishes before the next command starts. `setState` also accepts an updater: `ctx.setState((prev) => ({ ...prev, n: prev.n + 1 }))`.

Exactly one handler per command name. Registering a second one for the same name replaces it and reports a `duplicateHandler` error.

### Events

Events are declared with `createEvent` and emitted from command handlers. Event handlers get `state` and `queue` — they cannot call `setState`, which keeps the flow one-directional: command → state change → event → (optional) command.

```ts
const itemAdded = createEvent<{ text: string }>("itemAdded");

const off = store.addEventHandler(itemAdded, (ctx, event) => {
  ctx.queue(logItem, event.data.text);
});

off();
```

Event identity is a `Symbol` carried on `EventDef.id`, with a string `name` for logging and serialization. Use `matchEvent(event, def)` to narrow a stream event to its payload type.

### Sealing

`sealStore` returns a frozen object exposing only `state`, `queue`, `flush`, `suspend`, `openStream` and `closeStream`. `state` is `DeepReadonly<S>` and the underlying object is deep-frozen outside production, so consumers cannot register handlers or write state.

```ts
export const store = sealStore(internalStore);
```

### Error handling

```ts
const store = createStore<State>(initial, {
  onError: (report) => console.error(report.source, report.error),
});
```

`report.source` is one of `commandHandler`, `eventHandler`, `streamListener`, `contextExtension`, `disposedContext`, `queueProcessor`, `duplicateHandler`, `destroyedStore`, `suspendedQueue`. Without `onError`, reports go to the console outside production.

### Event Bus

The bus routes events between stores without direct dependencies. `connect` is refcounted and returns an unsubscribe.

```ts
const bus = createEventBus();
const detach = bus.connect(storeA);
bus.connect(storeB);

const off = bus.on(orderPlaced, (event) => {
  storeB.queue(processOrder, event.data);
});

off();
detach();
bus.destroy();
```

### Stream

Every store exposes a raw stream of all activity — state changes, command lifecycle, custom events, errors.

```ts
const off = store.openStream((event) => {
  console.log(event.name, event.data);
});
```

Every `StoreEvent` and `Command` carries `timestamp`, `correlationId` and `causedBy`, which is what the devtools use to reconstruct causality chains.

### Builtin Events

| Event                  | Data                          | Description                                          |
| ---------------------- | ----------------------------- | ---------------------------------------------------- |
| `stateChanged`         | `{ prev, next }`              | Emitted once per `setState`.                         |
| `commandStarted`       | `{ command }`                 | Handler began processing a command.                  |
| `commandHandled`       | `{ command }`                 | Handler finished processing a command.               |
| `commandInterrupted`   | `{ command, phase }`          | Command was interrupted while `queued` or `running`. |
| `invalidCommand`       | `{ command }`                 | No handler registered for the command name.          |
| `commandHandlingError` | `{ command, error }`          | Command handler threw.                               |
| `eventHandlingError`   | `{ event, error }`            | Event handler threw.                                 |
| `unhandledError`       | `StoreErrorReport`            | Any error the store caught.                          |
| `stateReset`           | —                             | State was replaced wholesale.                        |

## React

```tsx
import { useSelector, useQueue, shallowEqual } from "@naikidev/commiq-react";

function Counter() {
  const count = useSelector(counterStore, (s) => s.count);
  const queue = useQueue(counterStore);

  return <button onClick={() => queue(increment)}>Count: {count}</button>;
}
```

Selectors receive `DeepReadonly<S>` and results are memoized, so derived selectors returning fresh objects work — pass `shallowEqual` (or your own comparator) as the third argument. `useQueue` returns the store's `QueueFn`, so a click handler can await the `CommandHandle`. `useEvent`, `useStream`, `useCommandStatus`, `useFlush` and `useStore` cover the remaining cases. `CommiqProvider` is optional and only needed for named-store lookup, testing, or SSR.

## Documentation

Full documentation at [naikidev.github.io/commiq/docs](https://naikidev.github.io/commiq/docs/). The 1.x documentation is archived under `/docs/v1/`; it is unmaintained and contains known inaccuracies.

## Development

This is a pnpm workspace monorepo. Vite library mode, Vitest, TypeScript strict.

```sh
pnpm install
pnpm build
pnpm test
```

| Script              | Description                    |
| ------------------- | ------------------------------ |
| `pnpm build`        | Build all packages.            |
| `pnpm test`         | Run all tests.                 |
| `pnpm typecheck`    | Typecheck all packages.        |
| `pnpm run example`  | Start the example app.         |
| `pnpm run docs`     | Start the documentation site.  |
| `pnpm build:core`   | Build core library only.       |
| `pnpm build:libs`   | Build core and react packages. |
| `pnpm test:core`    | Run core library tests only.   |
| `pnpm test:react`   | Run react bindings tests only. |
| `pnpm version:bump` | Bump every package version.    |

## License

MIT
