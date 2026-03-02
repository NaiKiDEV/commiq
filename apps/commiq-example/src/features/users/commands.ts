import { createCommand } from "@naikidev/commiq";

export const UserCommand = {
  fetch: () => createCommand("user:fetch", undefined),
  clear: () => createCommand("user:clear", undefined),
  remove: (id: number) => createCommand("user:remove", { id }),
};
