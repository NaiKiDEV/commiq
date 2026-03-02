import { createCommand } from "@naikidev/commiq";

export const TodoCommand = {
  add: (text: string) => createCommand("todo:add", { text }),
  toggle: (id: number) => createCommand("todo:toggle", { id }),
  remove: (id: number) => createCommand("todo:remove", { id }),
};
