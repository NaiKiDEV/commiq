import {
  createStore,
  createCommand,
  createEvent,
  sealStore,
} from "@naikidev/commiq";

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface AsyncState {
  users: User[];
  loading: boolean;
  error: string;
}

export const fetchCompleted = createEvent<{ count: number }>("fetchCompleted");
export const fetchFailed = createEvent<{ error: string }>("fetchFailed");

const _asyncStore = createStore<AsyncState>({
  users: [],
  loading: false,
  error: "",
});

_asyncStore
  .addCommandHandler("fetchUsers", async (ctx) => {
    ctx.setState({ ...ctx.state, loading: true, error: "" });

    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

    if (Math.random() < 0.2) {
      ctx.setState({
        ...ctx.state,
        loading: false,
        error: "Network error — try again",
      });
      ctx.emit(fetchFailed, { error: "Network error" });
      return;
    }

    const fakeUsers: User[] = Array.from({ length: 3 }, (_, i) => {
      const id = Date.now() + i;
      return {
        id,
        name: `User ${id.toString(36).slice(-4)}`,
        email: `user-${id.toString(36).slice(-4)}@example.com`,
      };
    });

    ctx.setState({
      users: [...ctx.state.users, ...fakeUsers],
      loading: false,
      error: "",
    });
    ctx.emit(fetchCompleted, { count: fakeUsers.length });
  })
  .addCommandHandler("clearUsers", (ctx) => {
    ctx.setState({ users: [], loading: false, error: "" });
  })
  .addCommandHandler<number>("removeUser", (ctx, cmd) => {
    ctx.setState({
      ...ctx.state,
      users: ctx.state.users.filter((u) => u.id !== cmd.data),
    });
  });

export const asyncStore = sealStore(_asyncStore);

export const fetchUsers = () => createCommand("fetchUsers", undefined);
export const clearUsers = () => createCommand("clearUsers", undefined);
export const removeUser = (id: number) => createCommand("removeUser", id);
