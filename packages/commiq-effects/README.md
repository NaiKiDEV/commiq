# @naikidev/commiq-effects

Structured side effects for Commiq stores. Trigger effects from events with concurrency control, cancellation, debounce, and an explicit error channel.

## Install

```bash
pnpm add @naikidev/commiq-effects
```

## Usage

```typescript
import { createStore, createCommandDef, createEvent, sealStore } from "@naikidev/commiq";
import { createEffects } from "@naikidev/commiq-effects";

type SearchState = { results: string[] };

const store = createStore<SearchState>({ results: [] });
const searchRequested = createEvent<string>("searchRequested");
const setResults = createCommandDef<string[]>("setResults");

store.addCommandHandler("search", (ctx, cmd) => {
  ctx.emit(searchRequested, cmd.data);
});

store.addCommandHandler(setResults, (ctx, cmd) => {
  ctx.setState({ results: cmd.data });
});

const sealed = sealStore(store);
const effects = createEffects(sealed, {
  onError: (report) => console.error(report.source, report.error),
});

const off = effects.on(
  searchRequested,
  async (query, ctx) => {
    const res = await fetch(`/api/search?q=${query}`, { signal: ctx.signal });
    const data: string[] = await res.json();
    ctx.queue(setResults, data);
  },
  { mode: "switch", debounce: 200 },
);

off();             // remove one registration
effects.destroy(); // tear down the whole instance (idempotent)
```

## Effect context

`EffectContext<S>` is what the second handler argument gives you:

| Member | Type | Description |
|---|---|---|
| `state` | `DeepReadonly<S>` | Live store state, read at access time — use it to decide whether the work is still relevant |
| `queue` | `QueueFn` | Dispatch a command or command def. Gated: see [Dispatch guards](#dispatch-guards) |
| `signal` | `AbortSignal` | Aborted on cancellation, restart, or `destroy()`. Pass it to `fetch` and check it after every `await` |

## Options

`effects.on(eventDef, handler, options?)` returns an `Unsubscribe`.

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | `"parallel" \| "switch" \| "drop" \| "queue"` | `"parallel"` | Concurrency policy — see below |
| `debounce` | `number` | — | Debounce in ms before running (last-wins). Cleared by `cancelOn` and `destroy()` |
| `cancelOn` | `EventDef` | — | Aborts every in-flight run of *this* registration and clears its pending debounce |
| `onError` | `(report: EffectErrorReport) => void` | instance `onError` | Per-registration error reporter |
| `restartOnNew` | `boolean` | `false` | **Deprecated** — equivalent to `mode: "switch"`. `mode` wins when both are set |

### Concurrency modes

| Mode | Behaviour |
|---|---|
| `parallel` | **Default.** Every trigger starts another run. Ten keystrokes means ten live requests and last-response-wins — pick another mode for anything that writes state |
| `switch` | Aborts in-flight runs, then starts the new one. The right default for search/autocomplete |
| `drop` | Ignores the trigger while a non-aborted run is still active |
| `queue` | Chains runs so each trigger waits for the previous run to settle |

State and timers are tracked **per registration**, so two effects on the same event never interfere with each other.

## Error handling

`createEffects(store, { onError })` sets the instance-wide reporter; `EffectOptions.onError` overrides it per registration. Resolution order is registration → instance → default (`console.error` unless `NODE_ENV === "production"`). Nothing is silently swallowed except `AbortError`, which is the expected outcome of cancellation.

```typescript
type EffectErrorReport = {
  error: unknown;
  source: "effectHandler" | "abortedDispatch" | "destroyedEffects";
  event?: StoreEvent;
  command?: Command;
};
```

| `source` | Raised when |
|---|---|
| `effectHandler` | The handler threw or rejected with anything other than an `AbortError` |
| `abortedDispatch` | `ctx.queue()` was called from a run that had already been cancelled |
| `destroyedEffects` | `ctx.queue()` or `on()` was called after `destroy()` |

An effect that throws never fails the command that emitted the event.

### Dispatch guards

`ctx.queue()` is gated on the run's `signal` and on the instance lifetime. A cancelled or post-`destroy()` run cannot write to the store: the dispatch is dropped, reported through `onError`, and the returned `CommandHandle` resolves with `status: "discarded"`. Cancelled search results can no longer overwrite fresh ones — but still check `ctx.signal.aborted` after each `await` to avoid doing pointless work.

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
