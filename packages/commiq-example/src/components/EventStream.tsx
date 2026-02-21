import React, { useState, useEffect, useRef } from "react";
import { useSelector, useQueue } from "@naikidev/commiq-react";
import type { StoreEvent } from "@naikidev/commiq";
import {
  counterStore,
  increment,
  decrement,
  reset,
} from "../stores/counter.store";
import { todoStore, addTodo } from "../stores/todo.store";
import { PageHeader, Card, CardHeader, CardBody, Button, Badge } from "./ui";

interface LogEntry {
  id: number;
  storeName: string;
  eventName: string;
  data: unknown;
  time: string;
}

let entryId = 0;

export function StreamPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const bottomRef = useRef<HTMLDivElement>(null);

  const count = useSelector(counterStore, (s) => s.count);
  const todoCount = useSelector(todoStore, (s) => s.todos.length);
  const queueCounter = useQueue(counterStore);
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
    if (name.includes("error") || name.includes("invalid")) return "red";
    if (name.includes("Changed")) return "green";
    if (name.includes("Started") || name.includes("started")) return "amber";
    if (name.includes("Handled") || name.includes("handled")) return "indigo";
    return "zinc";
  };

  return (
    <>
      <PageHeader
        title="Event Stream"
        description="A real-time log of every event emitted by connected stores. Uses openStream() to tap into the store's event pipeline. Fire commands below and watch the stream update live."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Counter Commands" badge={`count: ${count}`} />
            <CardBody className="flex flex-wrap gap-2">
              <Button
                onClick={() => queueCounter(increment())}
                variant="primary"
                size="xs"
              >
                + 1
              </Button>
              <Button onClick={() => queueCounter(decrement())} size="xs">
                − 1
              </Button>
              <Button
                onClick={() => queueCounter(reset())}
                variant="danger"
                size="xs"
              >
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
                    addTodo(`Task ${Date.now().toString(36).slice(-4)}`),
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
                  counterStore.queue({ name: "nonExistent", data: {} })
                }
              >
                Queue Unknown Command
              </Button>
              <p className="mt-2 text-[11px] text-zinc-400">
                Triggers an <code>invalidCommand</code> event.
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
                {paused ? "▶ Resume" : "⏸ Pause"}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setEntries([])}>
                Clear
              </Button>
            </div>
            <div className="h-[420px] overflow-y-auto font-mono text-xs">
              {entries.length === 0 && (
                <p className="text-center text-zinc-400 py-10">
                  Waiting for events…
                </p>
              )}
              <table className="w-full">
                <tbody>
                  {entries.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                    >
                      <td className="px-3 py-1.5 text-zinc-400 whitespace-nowrap w-20">
                        {e.time}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <Badge color="zinc">{e.storeName}</Badge>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <Badge color={eventColor(e.eventName)}>
                          {e.eventName}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">
                        {JSON.stringify(e.data)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div ref={bottomRef} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
