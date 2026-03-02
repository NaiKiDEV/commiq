import { createStore, sealStore } from "@naikidev/commiq";

export type Todo = {
  id: number;
  text: string;
  done: boolean;
};

export type TodoState = {
  todos: Todo[];
  nextId: number;
};

export const initialState: TodoState = { todos: [], nextId: 1 };

const _store = createStore<TodoState>(initialState);

_store
  .addCommandHandler<{ text: string }>("todo:add", (ctx, cmd) => {
    const todo: Todo = {
      id: ctx.state.nextId,
      text: cmd.data.text,
      done: false,
    };
    ctx.setState({
      todos: [...ctx.state.todos, todo],
      nextId: ctx.state.nextId + 1,
    });
  })
  .addCommandHandler<{ id: number }>("todo:toggle", (ctx, cmd) => {
    ctx.setState({
      ...ctx.state,
      todos: ctx.state.todos.map((t) =>
        t.id === cmd.data.id ? { ...t, done: !t.done } : t,
      ),
    });
  })
  .addCommandHandler<{ id: number }>("todo:remove", (ctx, cmd) => {
    ctx.setState({
      ...ctx.state,
      todos: ctx.state.todos.filter((t) => t.id !== cmd.data.id),
    });
  });

export const todoStore = sealStore(_store);
