# @naikidev/commiq-context

Context extensions for commiq stores. Add custom properties to command and event handler contexts with full type safety.

## Install

```bash
pnpm add @naikidev/commiq-context
```

## Usage

```ts
import { createStore, createCommand } from "@naikidev/commiq";
import { withPatch, withGuard, withInjector } from "@naikidev/commiq-context";

type State = { user: User | null; loading: boolean };

const store = createStore<State>({ user: null, loading: false })
  .useExtension(withPatch<State>())
  .useExtension(withGuard<State>())
  .useExtension(withInjector<State>()({ api: new ApiClient() }))
  .addCommandHandler("user:load", async (ctx, cmd) => {
    ctx.guard(cmd.data.id !== "", "user ID required");
    ctx.patch({ loading: true });
    const user = await ctx.deps.api.fetchUser(cmd.data.id);
    ctx.patch({ user, loading: false });
  });
```

## Pre-built Extensions

| Extension | Adds to `ctx` | Description |
| --- | --- | --- |
| `withPatch()` | `patch(partial)` | Shallow-merge partial state updates |
| `withGuard()` | `guard(condition, message)` | Precondition checks that stop the handler on failure |
| `withAssert(options?)` | `assert(condition, message)` | Dev-time invariant checks, can be disabled in production |
| `withDefer()` | `defer(fn)` | Cleanup callbacks that run after the handler completes |
| `withInjector()(deps)` | `deps` | Typed dependency injection via property access |
| `withLogger(options?)` | `log(level, message)` | Structured logging with configurable handler |
| `withMeta()` | `meta` | Command/event metadata (name, correlationId, causedBy, timestamp) |
| `withHistory(options?)` | `history` | Ring buffer of previous states |

## Custom Extensions

```ts
import { defineContextExtension } from "@naikidev/commiq-context";

const withTimestamp = defineContextExtension<State, {
  now: () => number;
}>({
  command: () => ({
    now: () => Date.now(),
  }),
});
```

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
