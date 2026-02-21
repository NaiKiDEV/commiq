import {
  createStore,
  createCommand,
  sealStore,
} from "@naikidev/commiq";

// --- State ---

export interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export interface TodoState {
  todos: Todo[];
  nextId: number;
}

// --- Commands ---

export const addTodo = (text: string) => createCommand("addTodo", text);
export const toggleTodo = (id: number) => createCommand("toggleTodo", id);
export const removeTodo = (id: number) => createCommand("removeTodo", id);

// --- Store ---

const _todoStore = createStore<TodoState>({ todos: [], nextId: 1 });

_todoStore
  .addCommandHandler<string>("addTodo", (ctx, cmd) => {
    const todo: Todo = { id: ctx.state.nextId, text: cmd.data, done: false };
    ctx.setState({
      todos: [...ctx.state.todos, todo],
      nextId: ctx.state.nextId + 1,
    });
  })
  .addCommandHandler<number>("toggleTodo", (ctx, cmd) => {
    ctx.setState({
      ...ctx.state,
      todos: ctx.state.todos.map((t) =>
        t.id === cmd.data ? { ...t, done: !t.done } : t
      ),
    });
  })
  .addCommandHandler<number>("removeTodo", (ctx, cmd) => {
    ctx.setState({
      ...ctx.state,
      todos: ctx.state.todos.filter((t) => t.id !== cmd.data),
    });
  });

export const todoStore = sealStore(_todoStore);
