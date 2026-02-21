import React, { useState } from "react";
import { useSelector, useQueue, useEvent } from "@naikidev/commiq-react";
import {
  asyncStore,
  fetchUsers,
  clearUsers,
  removeUser,
  fetchCompleted,
  fetchFailed,
} from "../stores/async.store";
import { PageHeader, Card, CardHeader, CardBody, Button, Badge } from "./ui";

export function AsyncPage() {
  const { users, loading, error } = useSelector(asyncStore, (s) => s);
  const queue = useQueue(asyncStore);
  const [log, setLog] = useState<string[]>([]);

  useEvent(asyncStore, fetchCompleted, (e) => {
    setLog((prev) => [...prev, `✓ Fetched ${e.data.count} users`]);
  });

  useEvent(asyncStore, fetchFailed, (e) => {
    setLog((prev) => [...prev, `✗ ${e.data.error}`]);
  });

  return (
    <>
      <PageHeader
        title="Async Commands"
        description="Command handlers can be async. This example simulates an API fetch with artificial delay and a 20% chance of failure. The store transitions through loading states and emits success/failure events."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Users"
              badge={loading ? "loading…" : `${users.length} loaded`}
            />
            <CardBody className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={() => queue(fetchUsers())}
                  disabled={loading}
                >
                  {loading ? (
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
                <Button onClick={() => queue(clearUsers())} disabled={loading}>
                  Clear All
                </Button>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              {users.length === 0 && !loading && !error && (
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
                      onClick={() => queue(removeUser(u.id))}
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

          <div className="mt-4 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 p-4 text-xs text-zinc-500 dark:text-zinc-400 font-mono space-y-1">
            <p>handler: async (ctx) =&gt; {"{"}</p>
            <p>
              &nbsp; ctx.setState({"{"} loading: true {"}"})
            </p>
            <p>&nbsp; await fetch(…)</p>
            <p>
              &nbsp; ctx.emit(fetchCompleted, {"{"} count {"}"})
            </p>
            <p>{"}"}</p>
          </div>
        </div>
      </div>
    </>
  );
}
