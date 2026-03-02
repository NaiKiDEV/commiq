import React, { useState } from "react";
import { useEvent } from "@naikidev/commiq-react";
import { userStore } from "./store";
import { UserEvent } from "./events";
import { useUserState, useUserActions } from "./hooks";
import { Card, CardHeader, CardBody, Button } from "../../components/ui";
import { CodeExplorer } from "../../components/CodeExplorer";

import eventsRaw from "./events.ts?raw";
import commandsRaw from "./commands.ts?raw";
import storeRaw from "./store.ts?raw";
import hooksRaw from "./hooks.ts?raw";
import pageRaw from "./UsersPage.tsx?raw";

export function UsersPage() {
  const { users, status, errorMessage } = useUserState();
  const { fetch, clear, remove } = useUserActions();
  const [log, setLog] = useState<string[]>([]);

  useEvent(userStore, UserEvent.Fetched, (e) => {
    setLog((prev) => [...prev, `✓ Fetched ${e.data.count} users`]);
  });

  useEvent(userStore, UserEvent.FetchFailed, (e) => {
    setLog((prev) => [...prev, `✗ ${e.data.message}`]);
  });

  return (
    <CodeExplorer
      title="Async Commands"
      description="Command handlers can be async. This example simulates an API fetch with artificial delay and a 20% chance of failure. The store transitions through loading states and emits success/failure events."
      files={[
        { name: "events.ts", content: eventsRaw },
        { name: "commands.ts", content: commandsRaw },
        { name: "store.ts", content: storeRaw },
        { name: "hooks.ts", content: hooksRaw },
        { name: "UsersPage.tsx", content: pageRaw },
      ]}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Users"
              badge={
                status === "loading" ? "loading…" : `${users.length} loaded`
              }
            />
            <CardBody className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={fetch}
                  disabled={status === "loading"}
                >
                  {status === "loading" ? (
                    <span className="flex items-center gap-1.5">
                      <svg
                        className="animate-spin h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                      </svg>
                      Fetching…
                    </span>
                  ) : (
                    "Fetch Users"
                  )}
                </Button>
                <Button onClick={clear} disabled={status === "loading"}>
                  Clear All
                </Button>
              </div>

              {status === "error" && errorMessage && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {errorMessage}
                </div>
              )}

              {users.length === 0 && status === "idle" && (
                <p className="text-center text-sm text-zinc-400 py-6">
                  No users loaded yet — hit Fetch.
                </p>
              )}

              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{u.name}</p>
                      <p className="text-xs text-zinc-400">{u.email}</p>
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => remove(u.id)}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader title="Event Log" badge="useEvent" />
            <CardBody>
              {log.length === 0 && (
                <p className="text-xs text-zinc-400">No events yet.</p>
              )}
              <ul className="space-y-1">
                {log.map((entry, i) => (
                  <li
                    key={i}
                    className={`text-xs font-mono ${
                      entry.startsWith("✗")
                        ? "text-red-500"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {entry}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </CodeExplorer>
  );
}
