# @naikidev/commiq-persist

State persistence and rehydration for Commiq stores. Saves state to `localStorage` (or any storage adapter) with debounced writes, and restores it on load with versioning, migration and validation.

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

const persisted = persistStore(store, { key: "my-counter" });

// Synchronous adapters (localStorage, sessionStorage, memory) hydrate before
// `persistStore` returns. Await `hydrated` when the adapter is asynchronous.
await persisted.hydrated;

persisted.flush();   // write any pending debounced value now
persisted.clear();   // remove the stored value (use on logout)
persisted.destroy(); // flush, unsubscribe, stop persisting
```

`persistStore` accepts any object with `state`, `replaceState`, `suspend`, `openStream` and `closeStream` — a `StoreImpl` or your own test double. `PersistResult` satisfies core's `Disposable`, and `destroy()` is idempotent.

### Asynchronous adapters

`persistStore` takes a `store.suspend()` gate for the duration of the initial read and releases it once hydration has settled — on success, on failure and on corrupt data alike. Commands dispatched during an asynchronous hydration are therefore **accepted, kept in order, and executed against the hydrated state** rather than being overwritten by it. Their `CommandHandle`s resolve normally, and `flush()` resolves once the gate opens and the queue drains.

`hydrated` resolves once the initial read has been applied. You still need to await it before *reading* `store.state`, since the restored value is not visible until then — but you no longer need to await it before dispatching.

The gate covers command execution only. A command that was already mid-flight when `persistStore` was called keeps running, so its state change can still be overwritten by hydration; that narrow case is reported through `onError` with `source: "hydrationRace"` rather than failing silently.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `key` | `string` | required | Storage key |
| `storage` | `StorageAdapter` | `localStorageAdapter()` | Any object with `getItem`/`setItem` (optionally `removeItem`/`subscribe`) |
| `debounce` | `number` | `300` | Debounce writes (ms) |
| `version` | `number` | `0` | Version stamped into the stored envelope |
| `migrate` | `(persisted: unknown, from: number) => S` | – | Convert an older persisted value to the current shape |
| `validate` | `(raw: unknown) => S \| null` | – | Reject an untrusted persisted value by returning `null` |
| `merge` | `(persisted: unknown, initial: DeepReadonly<S>) => S \| null` | `mergeOverInitial` | Combine the persisted value with the current state |
| `replacer` | `(key: string, value: unknown) => unknown` | – | `JSON.stringify` replacer |
| `reviver` | `(key: string, value: unknown) => unknown` | – | `JSON.parse` reviver |
| `serialize` | `(snapshot: PersistedSnapshot) => string` | JSON envelope | Full control over the stored string |
| `deserialize` | `(raw: string) => unknown` | `JSON.parse` | Full control over parsing |
| `clearOnCorrupt` | `boolean` | `true` | Delete the key when it cannot be parsed |
| `flushOnHide` | `boolean` | `true` | Flush on `pagehide`/`beforeunload` in browsers |
| `syncTabs` | `boolean` | `false` | Apply changes made by other tabs (needs `subscribe`) |
| `onError` | `(report: PersistErrorReport) => void` | `console.error` outside production | Error channel |

## Error handling

Nothing throws out of `persistStore`, and neither `hydrated`, `flush()` nor `clear()` ever reject. Every failure is reported to `onError` as `{ error, source, key, raw? }`, mirroring core's `StoreErrorReport`. Sources: `read`, `write`, `remove`, `serialize`, `deserialize`, `migrate`, `validate`, `merge`, `apply`, `hydrationRace`, `unsupported`.

A quota error, an offline adapter or a corrupt key degrades persistence for that operation only — writes keep working afterwards.

## Versioning and migration

Values are stored in an envelope: `{ "$": "commiq/persist", "version": 1, "state": { … } }`. Values written without an envelope (including data written by v1 of this package) are read as version `0`.

```typescript
persistStore(store, {
  key: "cart",
  version: 2,
  migrate: (persisted, from) => (from === 1 ? upgradeV1(persisted) : emptyCart()),
  validate: (raw) => cartSchema.safeParse(raw).data ?? null,
});
```

When the stored version differs from `version` and no `migrate` is given, hydration is skipped and reported — the store keeps its initial state instead of adopting an unknown shape.

By default the persisted value is shallow-merged **over** the initial state (`mergeOverInitial`), so state keys added in a later release keep their defaults instead of becoming `undefined`. Non-object states (arrays, primitives) are replaced wholesale.

## Storage adapters

```typescript
import {
  indexedDbAdapter,
  localStorageAdapter,
  memoryStorageAdapter,
  noopStorageAdapter,
  sessionStorageAdapter,
  webStorageAdapter,
} from "@naikidev/commiq-persist";

persistStore(store, { key: "big", storage: indexedDbAdapter() });
```

| Adapter | Notes |
|---|---|
| `localStorageAdapter()` | Default. Falls back to `noopStorageAdapter()` when unavailable |
| `sessionStorageAdapter()` | Per-tab storage |
| `webStorageAdapter(area)` | Wrap any `Storage`, adds cross-tab `subscribe` |
| `memoryStorageAdapter()` | In-process, useful in tests |
| `noopStorageAdapter()` | Discards writes, always reads `null` |
| `indexedDbAdapter(options)` | Asynchronous; accepts `databaseName`, `storeName`, `factory` |

A custom adapter needs `getItem` and `setItem`; add `removeItem` to support `clear()` and `subscribe` to support `syncTabs`.

## Server rendering

The default adapter is resolved lazily and degrades to a no-op when `localStorage` is missing or throws (Next.js/Remix server rendering, Safari private mode), so rendering never crashes. On the server nothing is read or written, `hydrated` resolves immediately and the suspension gate is taken and released within the same tick, so command processing is never delayed. The browser hydrates on mount. Pass `memoryStorageAdapter()` explicitly if you want deterministic behaviour in server tests.

## Cross-tab sync

```typescript
persistStore(store, { key: "prefs", syncTabs: true });
```

Changes written by other tabs are applied through `replaceState` (the same migrate/validate/merge pipeline). The store's own writes are not echoed back, and external removals leave the state untouched.

## JSON round-trip limitations

The default codec is `JSON.stringify`/`JSON.parse`, which silently changes some values:

| Value | After reload |
|---|---|
| `Date` | ISO string (`.getTime()` throws) |
| `Map`, `Set` | `{}` |
| `undefined` property | key removed |
| `NaN`, `Infinity` | `null` |
| `BigInt` | throws on write |

Opt into the bundled tagging codec to round-trip them:

```typescript
import { richReplacer, richReviver } from "@naikidev/commiq-persist";

persistStore(store, { key: "state", replacer: richReplacer, reviver: richReviver });
```

`Date`, `Map`, `Set`, `NaN`, `±Infinity` and `BigInt` then survive a reload. Properties whose value is `undefined` still come back absent (`JSON.parse` cannot restore them) — `mergeOverInitial` restores their defaults. Class instances and functions are never persisted; keep persisted state to plain data.

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
