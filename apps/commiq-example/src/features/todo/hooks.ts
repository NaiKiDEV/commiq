import { useSelector, useQueue, shallowEqual } from "@naikidev/commiq-react";
import type { DeepReadonly } from "@naikidev/commiq";
import { todoStore } from "./store";
import type { TodoState } from "./store";
import { TodoCommand } from "./commands";

function selectTodos(s: DeepReadonly<TodoState>) {
  return {
    todos: s.todos,
    done: s.todos.filter((t) => t.done).length,
  };
}

export function useTodos() {
  const { todos, done } = useSelector(todoStore, selectTodos, shallowEqual);
  const queue = useQueue(todoStore);

  return {
    todos,
    done,
    add: (text: string) => queue(TodoCommand.add(text)),
    toggle: (id: number) => queue(TodoCommand.toggle(id)),
    remove: (id: number) => queue(TodoCommand.remove(id)),
  };
}
