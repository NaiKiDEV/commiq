---
sidebar_position: 1
sidebar_label: Hooks
---

# React Hooks

The `@naikidev/commiq-react` package provides hooks to integrate Commiq stores with React components.

## `CommiqProvider`

Wraps a component tree and provides stores via React context. **This is optional** — all hooks accept stores directly as arguments, so no provider is required for typical usage. Use `CommiqProvider` when you need dependency injection, testing overrides, or SSR compatibility.

```tsx
import { CommiqProvider } from "@naikidev/commiq-react";

const stores = {
  counter: counterStore,
  todo: todoStore,
};

function App() {
  return (
    <CommiqProvider stores={stores}>
      <MyApp />
    </CommiqProvider>
  );
}
```

## `useSelector(store, selector)`

Subscribes to a sealed store and re-renders only when the selected value changes. Uses `useSyncExternalStore` under the hood.

```tsx
import { useSelector } from "@naikidev/commiq-react";

function Counter() {
  const count = useSelector(counterStore, (s) => s.count);
  return <p>{count}</p>;
}
```

**Key behaviors:**

- Only re-renders when the selected value changes (referential equality)
- Subscribes to `stateChanged` builtin events

## `useQueue(store)`

Returns a stable `queue` function for dispatching commands.

```tsx
import { useQueue } from "@naikidev/commiq-react";
import { createCommand } from "@naikidev/commiq";

function IncrementButton() {
  const queue = useQueue(counterStore);

  return (
    <button onClick={() => queue(createCommand("increment", undefined))}>
      +1
    </button>
  );
}
```

**Key behaviors:**

- Returns a referentially stable function (safe in dependency arrays)

## `useEvent(store, eventDef, handler)`

Subscribes to a specific event on a store. Automatically cleans up on unmount.

```tsx
import { useEvent } from "@naikidev/commiq-react";
import { createEvent } from "@naikidev/commiq";

const counterReset = createEvent("counter:reset");

function ResetNotifier() {
  const [msg, setMsg] = useState("");

  useEvent(counterStore, counterReset, () => {
    setMsg("Counter was reset!");
    setTimeout(() => setMsg(""), 2000);
  });

  return msg ? <p>{msg}</p> : null;
}
```

**Key behaviors:**

- Uses a ref for the handler so it always calls the latest version
- Cleans up on unmount — no stale listeners
