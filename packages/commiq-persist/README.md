# @naikidev/commiq-persist

State persistence and rehydration for Commiq stores. Automatically saves state to localStorage (or any storage adapter) and restores it on load.

## Install

```bash
pnpm add @naikidev/commiq-persist
```

## Usage

```typescript
import { createStore } from "@naikidev/commiq";
import { persistStore } from "@naikidev/commiq-persist";

const store = createStore({ count: 0 });

store.addCommandHandler("increment", (ctx) => {
  ctx.setState({ count: ctx.state.count + 1 });
});

const { destroy, hydrated } = persistStore(store, { key: "my-counter" });

// Optional: wait for async storage adapters
await hydrated;

// Later, to stop persisting:
destroy();
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `key` | `string` | required | Storage key |
| `storage` | `StorageAdapter` | `localStorage` | Any object with `getItem`/`setItem` |
| `debounce` | `number` | `300` | Debounce writes (ms) |
| `serialize` | `(state) => string` | `JSON.stringify` | Custom serializer |
| `deserialize` | `(raw) => state` | `JSON.parse` | Custom deserializer |

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
