import React from "react";
import { CommiqProvider } from "@naikidev/commiq-react";
import { counterStore } from "./stores/counter.store";
import { todoStore } from "./stores/todo.store";
import { Counter } from "./components/Counter";
import { TodoList } from "./components/TodoList";

const stores = {
  counter: counterStore,
  todo: todoStore,
};

export function App() {
  return (
    <CommiqProvider stores={stores}>
      <div style={{ maxWidth: 480, margin: "2rem auto", fontFamily: "system-ui" }}>
        <h1>Commiq Example</h1>
        <p style={{ color: "#666" }}>
          A command &amp; event driven store for React.
        </p>
        <hr />
        <Counter />
        <hr />
        <TodoList />
      </div>
    </CommiqProvider>
  );
}
