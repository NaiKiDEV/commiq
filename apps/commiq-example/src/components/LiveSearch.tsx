import React, { useState } from "react";
import { useSelector, useQueue, useEvent } from "@naikidev/commiq-react";
import {
  searchStore,
  search,
  clearSearch,
  searchCompleted,
} from "../stores/search.store";
import { PageHeader, Card, CardHeader, CardBody, Button, Badge } from "./ui";

const categoryColors: Record<string, "indigo" | "green" | "amber"> = {
  Guide: "indigo",
  Pattern: "amber",
  Plugin: "green",
};

export function LiveSearchPage() {
  const query = useSelector(searchStore, (s) => s.query);
  const results = useSelector(searchStore, (s) => s.results);
  const loading = useSelector(searchStore, (s) => s.loading);
  const recentSearches = useSelector(searchStore, (s) => s.recentSearches);
  const stats = useSelector(searchStore, (s) => s.stats);
  const queue = useQueue(searchStore);
  const [log, setLog] = useState<string[]>([]);

  useEvent(searchStore, searchCompleted, (e) => {
    setLog((prev) => [
      `Found ${e.data.count} result${e.data.count !== 1 ? "s" : ""} for "${e.data.query}"`,
      ...prev,
    ].slice(0, 8));
  });

  return (
    <>
      <PageHeader
        title="Live Search"
        description="Type to search — each keystroke queues an interruptable command. Previous in-flight searches are automatically cancelled. Effects listen to search completion events with debounce to track recent searches."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Search" badge="interruptable" />
            <CardBody className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Try typing fast: guide, pattern, plugin…"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-zinc-400"
                  onChange={(e) => queue(search(e.target.value))}
                />
                {loading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg
                      className="animate-spin h-4 w-4 text-indigo-500"
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
                  </div>
                )}
              </div>

              {!loading && query && results.length === 0 && (
                <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-4">
                  No results for "{query}"
                </p>
              )}

              {!loading && !query && (
                <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-4">
                  Start typing to search the catalog.
                </p>
              )}

              {results.length > 0 && (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {results.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.title}</p>
                      </div>
                      <Badge color={categoryColors[r.category] ?? "zinc"}>
                        {r.category}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {query && (
                <div className="flex justify-end">
                  <Button size="xs" onClick={() => queue(clearSearch())}>
                    Clear
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Stats" badge="CommandInterrupted" />
            <CardBody>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {stats.completed}
                  </p>
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">
                    Completed
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {stats.interrupted}
                  </p>
                  <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">
                    Interrupted
                  </p>
                </div>
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-3 text-center">
                Type fast to see interruptions climb — only the last search runs to completion.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Recent Searches" badge="createEffects" />
            <CardBody>
              {recentSearches.length === 0 ? (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  No searches yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {recentSearches.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"
                    >
                      <span className="text-zinc-300 dark:text-zinc-600">
                        &rsaquo;
                      </span>
                      {s}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-3">
                Saved by a debounced effect on <code className="text-[11px] px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">searchCompleted</code>
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Effect Log" badge="useEvent" />
            <CardBody>
              {log.length === 0 ? (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  No events yet.
                </p>
              ) : (
                <ul className="space-y-1">
                  {log.map((entry, i) => (
                    <li
                      key={i}
                      className="text-xs font-mono text-emerald-600 dark:text-emerald-400"
                    >
                      {entry}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800/50 p-4 text-xs text-zinc-500 dark:text-zinc-400 font-mono space-y-1">
            <p>// interruptable command</p>
            <p>addCommandHandler("search",</p>
            <p>&nbsp; async (ctx, cmd) =&gt; {"{"}</p>
            <p>&nbsp;&nbsp;&nbsp; await fetch(…, {"{"} signal: ctx.signal {"}"});</p>
            <p>&nbsp; {"}"}, {"{"} interruptable: true {"}"})</p>
            <p className="mt-2">// effect with debounce</p>
            <p>effects.on(searchCompleted,</p>
            <p>&nbsp; (data, ctx) =&gt; {"{"}</p>
            <p>&nbsp;&nbsp;&nbsp; ctx.queue(addRecent(data.query));</p>
            <p>&nbsp; {"}"}, {"{"} debounce: 200 {"}"})</p>
          </div>
        </div>
      </div>
    </>
  );
}
