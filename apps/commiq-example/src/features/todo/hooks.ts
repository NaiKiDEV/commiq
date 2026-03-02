import { useSelector, useQueue } from "@naikidev/commiq-react";
import { todoStore } from "./store";
import { TodoCommand } from "./commands";

export function useTodos() {
  const todos = useSelector(todoStore, (s) => s.todos);
  const queue = useQueue(todoStore);

  return {
    todos,
    done: todos.filter((t) => t.done).length,
    add: (text: string) => queue(TodoCommand.add(text)),
    toggle: (id: number) => queue(TodoCommand.toggle(id)),
    remove: (id: number) => queue(TodoCommand.remove(id)),
  };
}
