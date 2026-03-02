# @naikidev/commiq-effects

Structured side effects for Commiq stores. Trigger effects from events with built-in cancellation, restart, and debounce.

## Install

```bash
pnpm add @naikidev/commiq-effects
```

## Usage

```typescript
import { createStore, createEvent, createCommand, sealStore } from "@naikidev/commiq";
import { createEffects } from "@naikidev/commiq-effects";

const store = createStore({ results: [] });
const searchRequested = createEvent<string>("searchRequested");

store.addCommandHandler("search", (ctx, cmd) => {
  ctx.emit(searchRequested, cmd.data);
});

store.addCommandHandler("setResults", (ctx, cmd) => {
  ctx.setState({ results: cmd.data });
});

const sealed = sealStore(store);
const effects = createEffects(sealed);

effects.on(searchRequested, async (query, ctx) => {
  const res = await fetch(`/api/search?q=${query}`, { signal: ctx.signal });
  const data = await res.json();
  ctx.queue(createCommand("setResults", data));
}, { restartOnNew: true });

// Clean up when done
effects.destroy();
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `restartOnNew` | `boolean` | `false` | Cancel previous run if same effect re-triggers |
| `cancelOn` | `EventDef` | — | Cancel running effect when this event fires |
| `debounce` | `number` | — | Debounce in ms before running (last-wins) |

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
