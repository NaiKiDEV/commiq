import React, { useState, useEffect, useRef } from "react";
import { useSelector, useQueue } from "@naikidev/commiq-react";
import { createCommand, type StoreEvent } from "@naikidev/commiq";
import { counterStore } from "../counter";
import { todoStore, TodoCommand } from "../todo";
import { useCounter } from "../counter/hooks";
import { Card, CardHeader, CardBody, Button, Badge } from "../../components/ui";
import { CodeExplorer } from "../../components/CodeExplorer";
import streamPageRaw from "./StreamPage.tsx?raw";

type LogEntry = {
  id: number;
  storeName: string;
  eventName: string;
  data: unknown;
  time: string;
};

let entryId = 0;

export function StreamPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const bottomRef = useRef<HTMLDivElement>(null);

  const { count, increment, decrement, reset, throwError } = useCounter();
  const todoCount = useSelector(todoStore, (s) => s.todos.length);
  const queueTodo = useQueue(todoStore);

  useEffect(() => {
    const makeListener = (storeName: string) => (event: StoreEvent) => {
      if (pausedRef.current) return;
      setEntries((prev) => [
        ...prev.slice(-200),
        {
          id: ++entryId,
          storeName,
          eventName: event.name,
          data: event.data,
          time: new Date().toISOString().slice(11, 23),
        },
      ]);
    };

    const counterListener = makeListener("counter");
    const todoListener = makeListener("todo");

    counterStore.openStream(counterListener);
    todoStore.openStream(todoListener);

    return () => {
      counterStore.closeStream(counterListener);
      todoStore.closeStream(todoListener);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  const eventColor = (
    name: string,
  ): "green" | "indigo" | "red" | "amber" | "zinc" => {
    const n = name.toLowerCase();
    if (n.includes("error") || n.includes("invalid")) return "red";
    if (n.includes("changed")) return "green";
    if (n.includes("started")) return "amber";
    if (n.includes("handled")) return "indigo";
    return "zinc";
  };

  return (
    <CodeExplorer
      title="Event Stream"
      description="A real-time log of every event emitted by connected stores. Uses openStream() to tap into the store's event pipeline. Fire commands below and watch the stream update live."
      files={[{ name: "StreamPage.tsx", content: streamPageRaw }]}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Counter Commands" badge={`count: ${count}`} />
            <CardBody className="flex flex-wrap gap-2">
              <Button onClick={increment} variant="primary" size="xs">
                + 1
              </Button>
              <Button onClick={decrement} size="xs">
                − 1
              </Button>
              <Button onClick={reset} variant="danger" size="xs">
                Reset
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Todo Commands" badge={`${todoCount} items`} />
            <CardBody className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="xs"
                onClick={() =>
                  queueTodo(
                    TodoCommand.add(
                      `Task ${Date.now().toString(36).slice(-4)}`,
                    ),
                  )
                }
              >
                Add Random Todo
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Fire Invalid" />
            <CardBody>
              <Button
                size="xs"
                variant="danger"
                onClick={() =>
                  counterStore.queue(createCommand("nonExistent", undefined))
                }
              >
                Queue Unknown Command
              </Button>
              <p className="mt-2 text-[11px] text-zinc-400">
                Triggers an <code>invalidCommand</code> event.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Force Error" />
            <CardBody>
              <Button size="xs" variant="danger" onClick={throwError}>
                Throw in Handler
              </Button>
              <p className="mt-2 text-[11px] text-zinc-400">
                Triggers a <code>commandHandlingError</code> event.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Live Stream"
              badge={`${entries.length} events`}
            />
            <div className="flex items-center gap-2 px-5 py-2 border-b border-zinc-100 dark:border-zinc-800">
              <Button
                size="xs"
                variant={paused ? "primary" : "default"}
                onClick={() => setPaused(!paused)}
              >
                {paused ? "Resume" : "Pause"}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setEntries([])}>
                Clear
              </Button>
            </div>
            <div className="h-105 overflow-y-auto font-mono text-xs">
              {entries.length === 0 && (
                <p className="text-center text-zinc-400 py-10">
                  Waiting for events…
                </p>
              )}
              <table className="w-full table-fixed">
                <tbody>
                  {entries.map((e) => {
                    const expanded = expandedIds.has(e.id);
                    const dataStr = JSON.stringify(e.data);
                    const hasData =
                      e.data !== undefined &&
                      e.data !== null &&
                      dataStr !== "{}" &&
                      dataStr !== "null";
                    return (
                      <React.Fragment key={e.id}>
                        <tr
                          onClick={() => hasData && toggleExpand(e.id)}
                          className={`border-b border-zinc-50 dark:border-zinc-800/50 transition-colors ${
                            hasData
                              ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                              : ""
                          } ${expanded ? "bg-zinc-50 dark:bg-zinc-800/20" : ""}`}
                        >
                          <td className="px-3 py-1.5 text-zinc-400 whitespace-nowrap w-28 overflow-hidden">
                            {e.time}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap w-24">
                            <Badge color="zinc">{e.storeName}</Badge>
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap w-36">
                            <Badge color={eventColor(e.eventName)}>
                              {e.eventName}
                            </Badge>
                          </td>
                          <td className="px-3 py-1.5 max-w-0 overflow-hidden text-zinc-500 dark:text-zinc-400">
                            {hasData ? (
                              <span className="flex items-center gap-1.5 overflow-hidden">
                                <span className="text-zinc-400 dark:text-zinc-500 truncate flex-1">
                                  {dataStr}
                                </span>
                                <svg
                                  className={`w-3 h-3 shrink-0 text-zinc-300 dark:text-zinc-600 transition-transform ${expanded ? "rotate-180" : ""}`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </span>
                            ) : (
                              <span className="text-zinc-300 dark:text-zinc-600">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                        {expanded && hasData && (
                          <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
                            <td colSpan={4} className="px-4 py-3">
                              <pre className="text-[11px] leading-relaxed font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100/60 dark:bg-zinc-800/60 rounded-md px-3 py-2.5 overflow-x-auto whitespace-pre">
                                {JSON.stringify(e.data, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <div ref={bottomRef} />
            </div>
          </Card>
        </div>
      </div>
    </CodeExplorer>
  );
}
