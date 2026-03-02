import React, { useState } from "react";
import { useTodos } from "./hooks";
import { Card, CardHeader, CardBody, Button, Badge } from "../../components/ui";
import { CodeExplorer } from "../../components/CodeExplorer";

import commandsRaw from "./commands.ts?raw";
import storeRaw from "./store.ts?raw";
import hooksRaw from "./hooks.ts?raw";
import pageRaw from "./TodoPage.tsx?raw";

export function TodoPage() {
  const { todos, done, add, toggle, remove } = useTodos();
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    add(trimmed);
    setText("");
  };

  return (
    <CodeExplorer
      title="Todo List"
      description="CRUD commands with add, toggle, and remove handlers. Shows how multiple command handlers compose on a single store."
      files={[
        { name: "commands.ts", content: commandsRaw },
        { name: "store.ts", content: storeRaw },
        { name: "hooks.ts", content: hooksRaw },
        { name: "TodoPage.tsx", content: pageRaw },
      ]}
    >
      <Card>
        <CardHeader title="Todos" badge={`${done}/${todos.length} done`} />
        <CardBody className="space-y-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What needs to be done?"
              className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Button variant="primary" onClick={() => handleSubmit}>
              Add
            </Button>
          </form>

          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {todos.map((todo) => (
              <li
                key={todo.id}
                className="flex items-center gap-3 py-2.5 group"
              >
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggle(todo.id)}
                  className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500"
                />
                <span
                  className={`flex-1 text-sm transition-all ${
                    todo.done
                      ? "line-through text-zinc-400 dark:text-zinc-500"
                      : ""
                  }`}
                >
                  {todo.text}
                </span>
                <Badge color={todo.done ? "green" : "zinc"}>
                  {todo.done ? "done" : "pending"}
                </Badge>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => remove(todo.id)}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>

          {todos.length === 0 && (
            <p className="text-center text-sm text-zinc-400 py-6">
              No todos yet — add one above.
            </p>
          )}
        </CardBody>
      </Card>
    </CodeExplorer>
  );
}
