---
sidebar_position: 1
sidebar_label: Store
---

# Store API

The store is the heart of Commiq. It holds state, routes commands to handlers, and broadcasts events.

## `createStore<S>(initialState: S)`

Creates a new store with the given initial state.

```ts
import { createStore } from "@naikidev/commiq";

const store = createStore({ count: 0 });
```

## `store.addCommandHandler(name, handler, options?)`

Registers a handler for a named command. Returns `this` for chaining.

```ts
store.addCommandHandler("increment", (ctx) => {
  ctx.setState({ count: ctx.state.count + 1 });
});
```

### Handler Context (`CommandContext<S>`)

| Property   | Type                       | Description                  |
| ---------- | -------------------------- | ---------------------------- |
| `state`    | `S`                        | Current state (updated live) |
| `setState` | `(next: S) => void`        | Replace the state            |
| `emit`     | `(eventDef, data) => void` | Emit a custom event          |

### Options

| Option   | Type      | Default | Description                               |
| -------- | --------- | ------- | ----------------------------------------- |
| `notify` | `boolean` | `false` | Auto-emit a `<commandName>:handled` event |

## `store.addEventHandler(eventDef, handler)`

Registers a handler that reacts to a specific event. Event handlers can queue new commands.

```ts
import { createEvent, createCommand } from "@naikidev/commiq";

const userCreated = createEvent<{ name: string }>("userCreated");

store.addEventHandler(userCreated, (ctx, event) => {
  ctx.queue(createCommand("sendWelcome", { name: event.data.name }));
});
```

### Event Handler Context (`EventContext<S>`)

| Property | Type                         | Description              |
| -------- | ---------------------------- | ------------------------ |
| `state`  | `S`                          | Current state (readonly) |
| `queue`  | `(command: Command) => void` | Queue a new command      |

## `store.queue(command)`

Adds a command to the queue. Commands are processed sequentially.

```ts
store.queue(createCommand("increment", undefined));
```

## `store.flush()`

Returns a promise that resolves when all queued commands have been processed.

```ts
store.queue(createCommand("increment", undefined));
await store.flush();
console.log(store.state.count); // 1
```

## `store.openStream(listener)` / `store.closeStream(listener)`

Subscribe/unsubscribe to all events emitted by the store.

```ts
const listener = (event) => console.log(event.name, event.data);
store.openStream(listener);
// later...
store.closeStream(listener);
```

## Builtin Events

These events are emitted automatically by the store:

| Event                  | Data                 | When                                  |
| ---------------------- | -------------------- | ------------------------------------- |
| `stateChanged`         | `{ prev, next }`     | State was updated by a handler        |
| `commandStarted`       | `{ command }`        | A command is about to be handled      |
| `commandHandled`       | `{ command }`        | A command was successfully handled    |
| `invalidCommand`       | `{ command }`        | No handler registered for the command |
| `commandHandlingError` | `{ command, error }` | A handler threw an error              |
| `stateReset`           | `void`               | State was reset                       |

Access them via:

```ts
import { builtinEvents } from "@naikidev/commiq";

store.openStream((event) => {
  if (event.id === builtinEvents.stateChanged.id) {
    console.log("State changed:", event.data);
  }
});
```
