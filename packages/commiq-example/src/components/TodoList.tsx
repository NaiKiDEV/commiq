import React, { useState } from "react";
import { useSelector, useQueue } from "@naikidev/commiq-react";
import {
  todoStore,
  addTodo,
  toggleTodo,
  removeTodo,
} from "../stores/todo.store";

export function TodoList() {
  const todos = useSelector(todoStore, (s) => s.todos);
  const queue = useQueue(todoStore);
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    queue(addTodo(trimmed));
    setText("");
  };

  return (
    <section>
      <h2>Todos</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What needs to be done?"
          style={{ flex: 1 }}
        />
        <button type="submit">Add</button>
      </form>
      <ul style={{ listStyle: "none", padding: 0, marginTop: "0.5rem" }}>
        {todos.map((todo) => (
          <li
            key={todo.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.25rem 0",
            }}
          >
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => queue(toggleTodo(todo.id))}
            />
            <span
              style={{
                flex: 1,
                textDecoration: todo.done ? "line-through" : "none",
                opacity: todo.done ? 0.5 : 1,
              }}
            >
              {todo.text}
            </span>
            <button onClick={() => queue(removeTodo(todo.id))}>✕</button>
          </li>
        ))}
      </ul>
      {todos.length === 0 && (
        <p style={{ color: "#999", fontStyle: "italic" }}>No todos yet.</p>
      )}
    </section>
  );
}
