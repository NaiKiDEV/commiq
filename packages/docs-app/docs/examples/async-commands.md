---
sidebar_position: 2
sidebar_label: Async Commands
---

# Async Commands

Command handlers can be `async`. This is useful for API calls, timers, or any asynchronous operation. The store processes commands sequentially, so an `async` handler will complete before the next command is picked up.

## The Pattern

```
queue(fetchUsers)
  │
  ▼
┌──────────────────────────────┐
│ handler: async (ctx) => {    │
│   ctx.setState({ loading })  │  ← immediate state update
│   await fetch(…)             │  ← async work
│   ctx.setState({ data })     │  ← update with result
│   ctx.emit(fetchCompleted)   │  ← notify listeners
│ }                            │
└──────────────────────────────┘
```

## Example: Fetching Users

### Store

```ts
import {
  createStore,
  createCommand,
  createEvent,
  sealStore,
} from "@naikidev/commiq";

interface AsyncState {
  users: User[];
  loading: boolean;
  error: string;
}

const fetchCompleted = createEvent<{ count: number }>("fetchCompleted");
const fetchFailed = createEvent<{ error: string }>("fetchFailed");

const _store = createStore<AsyncState>({
  users: [],
  loading: false,
  error: "",
});

_store.addCommandHandler("fetchUsers", async (ctx) => {
  // 1. Enter loading state
  ctx.setState({ ...ctx.state, loading: true, error: "" });

  try {
    // 2. Async work
    const response = await fetch("/api/users");
    const users = await response.json();

    // 3. Update state with result
    ctx.setState({
      users: [...ctx.state.users, ...users],
      loading: false,
      error: "",
    });

    // 4. Emit success event
    ctx.emit(fetchCompleted, { count: users.length });
  } catch (err) {
    // 5. Handle failure
    ctx.setState({
      ...ctx.state,
      loading: false,
      error: err.message,
    });
    ctx.emit(fetchFailed, { error: err.message });
  }
});

export const asyncStore = sealStore(_store);
export const fetchUsers = () => createCommand("fetchUsers", undefined);
```

### React Component

```tsx
function UserList() {
  const { users, loading, error } = useSelector(asyncStore, (s) => s);
  const queue = useQueue(asyncStore);
  const [log, setLog] = useState<string[]>([]);

  // Listen to events for side-effects
  useEvent(asyncStore, fetchCompleted, (e) => {
    setLog((prev) => [...prev, `Fetched ${e.data.count} users`]);
  });

  useEvent(asyncStore, fetchFailed, (e) => {
    setLog((prev) => [...prev, `Error: ${e.data.error}`]);
  });

  return (
    <div>
      <button onClick={() => queue(fetchUsers())} disabled={loading}>
        {loading ? "Loading…" : "Fetch Users"}
      </button>

      {error && <p className="error">{error}</p>}

      <ul>
        {users.map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Important Notes

- **Sequential processing** — while an async handler runs, the queue waits. The next command runs only after the handler's promise resolves.
- **State is live** — `ctx.state` always reflects the latest state, even if you called `setState` earlier in the same handler.
- **Error handling** — use try/catch inside the handler. If an uncaught error is thrown, the store emits a `commandHandlingError` builtin event automatically.
- **Loading patterns** — set `loading: true` at the start of the handler and `loading: false` at the end. React components subscribed via `useSelector` will re-render at each `setState` call.
