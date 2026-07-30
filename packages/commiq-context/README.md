# @naikidev/commiq-context

Context extensions for commiq stores. Add custom properties to command and event handler contexts with full type safety.

## Install

```bash
pnpm add @naikidev/commiq-context
```

## Usage

```ts
import { createStore } from "@naikidev/commiq";
import { withPatch, withGuard, withInjector } from "@naikidev/commiq-context";

type State = { user: User | null; loading: boolean };

const store = createStore<State>({ user: null, loading: false });

const extended = store
  .useExtension(withPatch<State>())
  .useExtension(withGuard<State>())
  .useExtension(withInjector<State>()({ api: new ApiClient() }));

extended.addCommandHandler("user:load", async (ctx, cmd) => {
  ctx.guard(cmd.data.id !== "", "user ID required");
  ctx.patch({ loading: true });
  const user = await ctx.deps.api.fetchUser(cmd.data.id);
  ctx.patch({ user, loading: false });
});
```

`store.useExtension(ext)` returns the same store with its **command** and **event**
context types widened separately, so chaining accumulates properties and
`addCommandHandler` / `addEventHandler` see exactly the properties that apply to them.
`store.queue`, `store.flush` and `store.state` are unchanged. Extensions must be
registered before the first command is queued.

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
| `withHistory(target, options?)` | `history` | commands + events | Bounded log of state transitions |

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

`withHistory` opens a stream on the store it observes, so it takes that store (or any
`ExtensionTarget<S>` — anything exposing `state` and `openStream`, including a
`SealedStore`) as its first argument. One call binds one target, which keeps buffers
per store:

```ts
storeA.useExtension(withHistory<State>(storeA));
storeB.useExtension(withHistory<State>(storeB));
```

## Cleanup

Every stateful extension implements core's `destroy?()` hook, which core runs on
`store.destroy()` and on explicit detach:

```ts
const history = withHistory<State>(store);
store.useExtension(history);

store.removeExtension(history); // → true, runs history.destroy()
```

`removeExtension(ext)` detaches by identity and returns `false` when the extension was
not registered. It unsubscribes `withHistory`'s stream listener and releases its
retained state snapshots, and drops `withDefer`'s pending callbacks. Detaching removes
the runtime hooks, so the properties stop appearing on new contexts — it cannot narrow
the already-widened context types. `store.destroy()` detaches and destroys every
registered extension.

## Custom Extensions

```ts
import type { ContextExtensionDef } from "@naikidev/commiq";

const withTimestamp = <S>(): ContextExtensionDef<S, { now: () => number }> => ({
  command: () => ({ now: () => Date.now() }),
});
```

Declare only `command` for a command-only extension, only `event` for an event-only one
(`ContextExtensionDef<S, {}, TEvent>`), or both when the property belongs on each.
`afterCommand` / `afterEvent` hooks run after the corresponding handler; errors thrown
from them are reported on the store's error channel as `contextExtension`. Anything that
retains state or subscriptions should expose `destroy?()` and take its target
explicitly, so one call yields one store's worth of state:

```ts
const withCounter = <S>(): ContextExtensionDef<S, { count: () => number }> => {
  let calls = 0;
  return {
    command: () => ({ count: () => (calls += 1) }),
    destroy: () => { calls = 0; },
  };
};
```

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
