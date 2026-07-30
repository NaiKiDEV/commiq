import { createStore, sealStore } from "@naikidev/commiq";
import { UserEvent } from "./events";
import type { User } from "./events";

export type UserState = {
  users: readonly User[];
};

export const initialState: UserState = { users: [] };

export const USER_FETCH_COMMAND = "user:fetch";

const _store = createStore<UserState>(initialState);

_store
  .addCommandHandler(USER_FETCH_COMMAND, async (ctx) => {
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

    if (Math.random() < 0.2) {
      ctx.emit(UserEvent.FetchFailed, { message: "Network error" });
      throw new Error("Network error — try again");
    }

    const fakeUsers: User[] = Array.from({ length: 3 }, (_, i) => {
      const id = Date.now() + i;
      return {
        id,
        name: `User ${id.toString(36).slice(-4)}`,
        email: `user-${id.toString(36).slice(-4)}@example.com`,
      };
    });

    ctx.setState((prev) => ({ users: [...prev.users, ...fakeUsers] }));
    ctx.emit(UserEvent.Fetched, { count: fakeUsers.length });
  })
  .addCommandHandler("user:clear", (ctx) => {
    ctx.setState(initialState);
  })
  .addCommandHandler<{ id: number }>("user:remove", (ctx, cmd) => {
    ctx.setState((prev) => ({
      users: prev.users.filter((u) => u.id !== cmd.data.id),
    }));
  });

export const userStore = sealStore(_store);
