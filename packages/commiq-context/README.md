# @naikidev/commiq-context

Context extensions for commiq stores. Add custom properties to command and event handler contexts with full type safety.

## Install

```bash
pnpm add @naikidev/commiq-context
```

## Usage

```ts
import { createStore } from "@naikidev/commiq";
import { extendStore, withPatch, withGuard, withInjector } from "@naikidev/commiq-context";

type State = { user: User | null; loading: boolean };

const store = createStore<State>({ user: null, loading: false });

const extended = extendStore(store)
  .use(withPatch<State>())
  .use(withGuard<State>())
  .use(withInjector<State>()({ api: new ApiClient() }));

extended.addCommandHandler("user:load", async (ctx, cmd) => {
  ctx.guard(cmd.data.id !== "", "user ID required");
  ctx.patch({ loading: true });
  const user = await ctx.deps.api.fetchUser(cmd.data.id);
  ctx.patch({ user, loading: false });
});
```

`extendStore(store)` returns a host that registers handlers on the real store while
tracking which extension properties exist on **command** contexts and which exist on
**event** contexts. Register handlers through the host (`extended.addCommandHandler`,
`extended.addEventHandler`) so the extension properties are typed; `store.queue`,
`store.flush` and `store.state` stay on the store itself.

Extension state is created **per host**, so the same factory can be reused across
stores without sharing buffers or pending callbacks:

```ts
const history = withHistory<State>();
extendStore(storeA).use(history);
extendStore(storeB).use(history);
```

## Pre-built Extensions

| Extension | Adds to `ctx` | Scope | Description |
| --- | --- | --- | --- |
| `withPatch()` | `patch(partial)` | commands only | Shallow-merge partial state updates |
| `withGuard(options?)` | `guard(condition, message)` | commands only | Precondition check — **throws `GuardError`** on failure, which aborts the handler and is reported as `commandHandlingError` |
| `withAssert(options?)` | `assert(condition, message)` | commands + events | Invariant check — throws `AssertionError` (message prefixed with `Assertion failed:`); disable with `{ enabled: false }` |
| `withDefer()` | `defer(fn)` | commands + events | Cleanup callbacks that run after the handler completes |
| `withInjector()(deps)` | `deps` | commands + events | Typed dependency injection via property access |
| `withLogger(options?)` | `log(level, message)` | commands + events | Structured logging with configurable handler |
| `withMeta()` | `meta` | commands + events | Command/event metadata (name, correlationId, causedBy, timestamp) |
| `withHistory(options?)` | `history` | commands + events | Bounded log of state transitions |

Command-only extensions are not typed on event handler contexts — using `ctx.patch` or
`ctx.guard` inside `addEventHandler` is a compile error rather than a runtime `TypeError`.

`GuardError` and `AssertionError` both extend `ContextCheckError`, so a precondition
rejection is distinguishable from an unexpected failure in `onError` reporting.

### `withHistory`

`history` is a **live view** over the store's state transitions. Because the core store
publishes `stateChanged` on every `setState`, history records **one entry per
`setState`**, not one per command:

| Member | Description |
| --- | --- |
| `history.entries` | Current state plus up to `maxEntries - 1` preceding states (oldest first) |
| `history.previous` | The last distinct state before the current one, or `undefined` |
| `history.clear()` | Drops recorded transitions, keeping only the current state |

Options: `maxEntries` (default `10`, minimum `1`). A command that never calls
`setState` records nothing, so `previous` never degrades into a duplicate of
`ctx.state`.

## Cleanup

The host satisfies core's `Disposable` contract:

```ts
const extended = extendStore(store).use(withHistory<State>()).use(withDefer<State>());
extended.destroy();
```

`destroy()` is idempotent. It unsubscribes internal stream listeners, releases
retained state snapshots, drops pending deferred callbacks, and makes further
`use()` calls throw. Handlers registered through the host stay registered — call
`store.destroy()` to tear the store down as well.

## Custom Extensions

```ts
import type { ContextExtensionFactory } from "@naikidev/commiq-context";

const withTimestamp = <S>(): ContextExtensionFactory<S, { now: () => number }> => () => ({
  command: () => ({ now: () => Date.now() }),
});
```

The factory receives the store, so per-store state belongs inside it:

```ts
const withCounter = <S>(): ContextExtensionFactory<S, { count: () => number }> => () => {
  let calls = 0;
  return {
    command: () => ({ count: () => ++calls }),
    destroy: () => { calls = 0; },
  };
};
```

Declare only `command` for a command-only extension, only `event` for an event-only
one, or both when the property belongs on each. `afterCommand` / `afterEvent` hooks run
after the corresponding handler; errors thrown from them are reported on the store's
error channel as `contextExtension`.

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
