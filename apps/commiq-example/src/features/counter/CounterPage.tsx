import React, { useState } from "react";
import { useEvent } from "@naikidev/commiq-react";
import { counterStore } from "./store";
import { CounterEvent } from "./events";
import { useCounter } from "./hooks";
import { Card, CardHeader, CardBody, Button } from "../../components/ui";
import { CodeExplorer } from "../../components/CodeExplorer";

import eventsRaw from "./events.ts?raw";
import commandsRaw from "./commands.ts?raw";
import storeRaw from "./store.ts?raw";
import hooksRaw from "./hooks.ts?raw";
import pageRaw from "./CounterPage.tsx?raw";

export function CounterPage() {
  const { count, increment, decrement, incrementBy, reset } = useCounter();
  const [amount, setAmount] = useState(5);
  const [resetMessage, setResetMessage] = useState("");

  useEvent(counterStore, CounterEvent.Reset, () => {
    setResetMessage("Counter was reset!");
    setTimeout(() => setResetMessage(""), 2000);
  });

  return (
    <CodeExplorer
      title="Counter"
      description="Basic command-driven counter. Demonstrates createStore, addCommandHandler, useSelector, useQueue, and useEvent."
      files={[
        { name: "events.ts", content: eventsRaw },
        { name: "commands.ts", content: commandsRaw },
        { name: "store.ts", content: storeRaw },
        { name: "hooks.ts", content: hooksRaw },
        { name: "CounterPage.tsx", content: pageRaw },
      ]}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Value" badge="useSelector" />
          <CardBody className="flex flex-col items-center gap-4">
            <span className="text-6xl font-extrabold tabular-nums text-indigo-600 dark:text-indigo-400">
              {count}
            </span>
            <div className="flex items-center gap-2">
              <Button onClick={decrement}>− 1</Button>
              <Button onClick={increment} variant="primary">
                + 1
              </Button>
              <Button onClick={() => incrementBy(amount)}>+ {amount}</Button>
              <Button onClick={reset} variant="danger">
                Reset
              </Button>
            </div>
            {resetMessage && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 animate-pulse">
                {resetMessage}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Options" />
          <CardBody className="space-y-4">
            <label className="block text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">
                Increment amount
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1 block w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3 text-xs text-zinc-500 dark:text-zinc-400 font-mono space-y-1">
              <p>
                store.state = {"{"} count: {count} {"}"}
              </p>
              <p>handlers: increment, decrement, incrementBy, reset</p>
              <p>events: CounterEvent.Reset</p>
            </div>
          </CardBody>
        </Card>
      </div>
    </CodeExplorer>
  );
}
