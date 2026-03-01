# Commiq

Command and event driven state management for JavaScript and TypeScript.

Commiq models state as a pipeline: commands enter a queue, handlers process them sequentially, state updates are applied, and events are broadcast to interested subscribers. Stores remain decoupled from each other and from the UI layer.

## Packages

| Package                                                         | Description                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`@naikidev/commiq`](packages/commiq)                           | Core library. Framework-agnostic.                                         |
| [`@naikidev/commiq-react`](packages/commiq-react)               | React integration of commiq stores. |
| [`@naikidev/commiq-devtools-core`](packages/commiq-devtools-core) | Instrumentation and debugging tools.                                      |
| [`@naikidev/commiq-devtools`](packages/commiq-devtools)          | Embedded devtools panel inside your application.                                        |
| [`@naikidev/commiq-otel`](packages/commiq-otel)                 | OpenTelemetry tracing integration.                                        |
| [`@naikidev/commiq-persist`](packages/commiq-persist)           | State persistence and rehydration (localStorage, custom adapters).        |
| [`@naikidev/commiq-example`](apps/commiq-example)               | Example application with basic and advanced usage patterns.               |
| [`@naikidev/docs`](apps/docs-app)                               | Documentation site (Fumadocs / Next.js).                                  |

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
import { createStore, createCommand, sealStore } from "@naikidev/commiq";

interface CounterState {
  count: number;
}

const store = createStore<CounterState>({ count: 0 });

store.addCommandHandler("increment", (ctx) => {
  ctx.setState({ count: ctx.state.count + 1 });
});

const counter = sealStore(store);

counter.queue(createCommand("increment", undefined));
console.log(counter.state.count); // 1
```

## Core Concepts

### Commands

A command carries a name and a data payload. It represents an intent to change state.

```ts
const increment = () => createCommand("increment", undefined);
const addItem = (text: string) => createCommand("addItem", text);
```

### Handlers

Command handlers receive a context object with the current state, a `setState` function, and an `emit` function for broadcasting events.

```ts
store.addCommandHandler<string>("addItem", (ctx, cmd) => {
  ctx.setState({ items: [...ctx.state.items, cmd.data] });
  ctx.emit(itemAdded, { text: cmd.data });
});
```

Handlers can be `async`. The queue processes commands sequentially, so async handlers complete before the next command is picked up.

### Events

Events are defined with `createEvent` and emitted from within command handlers. Other stores or the UI layer can subscribe to them.

```ts
const itemAdded = createEvent<{ text: string }>("itemAdded");
```

### Sealing

`sealStore` wraps a store to expose only `state`, `queue`, `openStream`, and `closeStream`. This prevents direct mutation or handler registration from consumers.

```ts
export const store = sealStore(internalStore);
```

### Event Bus

The event bus routes events between stores. Connect multiple stores and register cross-store reactions without introducing direct dependencies.

```ts
const bus = createEventBus();
bus.connect(storeA);
bus.connect(storeB);

bus.on(orderPlaced, (event) => {
  storeB.queue(createCommand("processOrder", event.data));
});
```

### Stream

Every store exposes a raw event stream for observing all activity (state changes, command lifecycle, custom events, errors).

```ts
store.openStream((event) => {
  console.log(event.name, event.data);
});
```

### Builtin Events

| Event                  | Data                 | Description                            |
| ---------------------- | -------------------- | -------------------------------------- |
| `stateChanged`         | `{ prev, next }`     | State was updated.                     |
| `commandStarted`       | `{ command }`        | Handler began processing a command.    |
| `commandHandled`       | `{ command }`        | Handler finished processing a command. |
| `invalidCommand`       | `{ command }`        | No handler registered for the command. |
| `commandHandlingError` | `{ command, error }` | Handler threw an error.                |
| `stateReset`           | —                    | State was reset.                       |

## React

```tsx
import { useSelector, useQueue, useEvent } from "@naikidev/commiq-react";

function Counter() {
  const count = useSelector(counterStore, (s) => s.count);
  const queue = useQueue(counterStore);

  return <button onClick={() => queue(increment())}>Count: {count}</button>;
}
```

`useSelector` subscribes to state changes via `useSyncExternalStore` and only re-renders when the selected value changes. `useEvent` subscribes to a specific event and calls a handler callback.

## Development

This is a pnpm workspace monorepo.

```sh
pnpm install
pnpm build
pnpm test
```

| Script            | Description                    |
| ----------------- | ------------------------------ |
| `pnpm build`      | Build all packages.            |
| `pnpm test`       | Run all tests.                 |
| `pnpm example`    | Start the example app.         |
| `pnpm docs`       | Start the documentation site.  |
| `pnpm build:core` | Build core library only.       |
| `pnpm build:libs` | Build core and react packages. |
| `pnpm test:core`  | Run core library tests only.   |
| `pnpm test:react` | Run react bindings tests only. |

## License

MIT
