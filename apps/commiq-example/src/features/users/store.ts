import { createStore, sealStore } from "@naikidev/commiq";
import { UserEvent } from "./events";
import type { User } from "./events";

export type UserState = {
  users: User[];
  status: "idle" | "loading" | "error";
  errorMessage: string | null;
};

export const initialState: UserState = {
  users: [],
  status: "idle",
  errorMessage: null,
};

const _store = createStore<UserState>(initialState);

_store
  .addCommandHandler("user:fetch", async (ctx) => {
    ctx.setState({ ...ctx.state, status: "loading", errorMessage: null });

    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

    if (Math.random() < 0.2) {
      ctx.setState({
        ...ctx.state,
        status: "error",
        errorMessage: "Network error — try again",
      });
      ctx.emit(UserEvent.FetchFailed, { message: "Network error" });
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
      status: "idle",
      errorMessage: null,
    });
    ctx.emit(UserEvent.Fetched, { count: fakeUsers.length });
  })
  .addCommandHandler("user:clear", (ctx) => {
    ctx.setState(initialState);
  })
  .addCommandHandler<{ id: number }>("user:remove", (ctx, cmd) => {
    ctx.setState({
      ...ctx.state,
      users: ctx.state.users.filter((u) => u.id !== cmd.data.id),
    });
  });

export const userStore = sealStore(_store);
