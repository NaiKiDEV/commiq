# @naikidev/commiq-react

React bindings for Commiq.

## Install

```bash
pnpm add @naikidev/commiq @naikidev/commiq-react
```

## Usage

```tsx
import { useSelector, useQueue } from "@naikidev/commiq-react";
import { createCommandDef } from "@naikidev/commiq";

const increment = createCommandDef("increment");

function Counter() {
  const count = useSelector(counterStore, (s) => s.count);
  const queue = useQueue(counterStore);
  const handleClick = () => queue(increment);

  return <button onClick={handleClick}>Count: {count}</button>;
}
```

## Hooks

| Hook | Returns | Notes |
|---|---|---|
| `useSelector(store, selector, isEqual?)` | `T` | Snapshot-cached. Pass `shallowEqual` for selectors that build objects or arrays. |
| `useStore(store)` | `DeepReadonly<S>` | Whole state. Re-renders on every state change. |
| `useQueue(store)` | `QueueFn` | Stable ref. Returns the `CommandHandle` from `queue()` so `await dispatch(cmd)` works. |
| `useFlush(store)` | `() => Promise<void>` | Awaits full store quiescence. |
| `useEvent(store, eventDef, handler)` | `void` | Resubscribes only when `eventDef.id` changes. Works with `handledEvent(name)`. |
| `useStream(store, listener)` | `void` | Every event, for logging and audit trails. |
| `useCommandStatus(store, name \| def)` | `{ pending, error, lastCompletedAt }` | Derived from the builtin command lifecycle events — no store fields required. |
| `useNamedStore(name)` | `SealedStore<S>` | Looks the store up in `CommiqProvider`. |
| `useStoreRegistry()` | `StoreRegistry` | The registry supplied by `CommiqProvider`. |

Also exported: `shallowEqual`, `CommiqProvider`, `CommiqContext`.

### Derived selectors

```tsx
import { useSelector, shallowEqual } from "@naikidev/commiq-react";

const selectCart = (s) => ({
  items: s.items,
  total: s.items.reduce((sum, i) => sum + i.price * i.qty, 0),
});

const { items, total } = useSelector(cartStore, selectCart, shallowEqual);
```

Selector state is `DeepReadonly<S>` and frozen outside production — derive, never mutate.

### Loading and error state

```tsx
const { pending, error } = useCommandStatus(userStore, "user:fetch");
```

`pending` is true while any run of that command is in flight, `error` carries the
thrown value from `commandHandlingError`, and `lastCompletedAt` is the timestamp
of the last terminal lifecycle event. No `status` or `errorMessage` field in state.

### Per-request stores (SSR)

Every hook accepts a store **or** a store name resolved through `CommiqProvider`,
which is how a Node server keeps one store graph per request instead of sharing a
module singleton across users:

```tsx
function handler(req, res) {
  const stores = { cart: createCartStore() };
  res.send(renderToString(
    <CommiqProvider stores={stores}>
      <App />
    </CommiqProvider>
  ));
}

function CartBadge() {
  const count = useSelector<CartState, number>("cart", (s) => s.items.length);
  return <span>{count}</span>;
}
```

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
