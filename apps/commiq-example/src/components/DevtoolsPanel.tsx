import React, { useState, useEffect, useCallback } from "react";
import { useSelector, useQueue } from "@naikidev/commiq-react";
import type { TimelineEntry, StateSnapshot } from "@naikidev/commiq-devtools-core";
import {
  inventoryStore,
  cartStore,
  shopDevtools,
  reserveStock,
  removeFromCart,
  releaseStock,
  clearError,
} from "../stores/shop.store";
import { PageHeader, Card, CardHeader, CardBody, Button, Badge } from "./ui";

function truncId(id: string | null): string {
  if (!id) return "-";
  return id.slice(0, 8);
}

function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 23);
}

function eventColor(
  entry: TimelineEntry,
): "indigo" | "green" | "amber" | "red" {
  if (entry.name === "stateChanged") return "amber";
  if (entry.name === "commandHandlingError" || entry.name === "invalidCommand")
    return "red";
  if (entry.type === "command") return "indigo";
  return "green";
}

export function DevtoolsPage() {
  const products = useSelector(inventoryStore, (s) => s.products);
  const cartItems = useSelector(cartStore, (s) => s.items);
  const lastError = useSelector(cartStore, (s) => s.lastError);
  const queueInventory = useQueue(inventoryStore);
  const queueCart = useQueue(cartStore);

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [chain, setChain] = useState<TimelineEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inventoryHistory, setInventoryHistory] = useState<StateSnapshot[]>([]);
  const [cartHistory, setCartHistory] = useState<StateSnapshot[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = useCallback(() => {
    setTimeline(shopDevtools.getTimeline());
    setInventoryHistory(shopDevtools.getStateHistory("INVENTORY_STORE"));
    setCartHistory(shopDevtools.getStateHistory("CART_STORE"));
    if (selectedId) {
      setChain(shopDevtools.getChain(selectedId));
    }
  }, [selectedId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, 500);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  useEffect(() => {
    if (lastError) {
      const t = setTimeout(() => queueCart(clearError()), 3000);
      return () => clearTimeout(t);
    }
  }, [lastError]);

  function selectCorrelation(id: string) {
    setSelectedId(id);
    setChain(shopDevtools.getChain(id));
  }

  const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <>
      <PageHeader
        title="Devtools"
        description="Live devtools query API showcase. Interact with the shop stores below and watch the timeline, causality chains, and state history update."
      />

      {/* Store Controls */}
      <Card className="mb-6">
        <CardHeader title="Shop Controls" badge="interact" />
        <CardBody>
          {lastError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {lastError}
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            {products.map((p) => (
              <Button
                key={p.id}
                size="xs"
                variant="primary"
                disabled={p.stock === 0}
                onClick={() => queueInventory(reserveStock(p.id))}
              >
                + {p.name} ({p.stock})
              </Button>
            ))}
            <span className="text-zinc-300 dark:text-zinc-700 mx-1">|</span>
            {cartItems.map((item) => (
              <Button
                key={item.productId}
                size="xs"
                variant="danger"
                onClick={() => {
                  queueCart(removeFromCart(item.productId));
                  queueInventory(releaseStock(item.productId, item.qty));
                }}
              >
                - {item.name} x{item.qty}
              </Button>
            ))}
            {cartItems.length > 0 && (
              <span className="text-xs text-zinc-500 ml-2">Cart: ${total}</span>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Refresh controls */}
      <div className="flex items-center gap-3 mb-4">
        <Button size="xs" onClick={refresh}>
          Refresh
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded border-zinc-300 dark:border-zinc-600"
          />
          Auto-refresh (500ms)
        </label>
        <span className="text-xs text-zinc-400 ml-auto">
          {timeline.length} events
        </span>
      </div>

      {/* Timeline */}
      <Card className="mb-6">
        <CardHeader title="Event Timeline" badge="getTimeline()" />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 text-left text-zinc-400">
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Store</th>
                  <th className="px-4 py-2 font-medium">Event</th>
                  <th className="px-4 py-2 font-medium">Correlation</th>
                  <th className="px-4 py-2 font-medium">Caused By</th>
                  <th className="px-4 py-2 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {timeline.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-zinc-400"
                    >
                      No events yet. Use the controls above to generate events.
                    </td>
                  </tr>
                )}
                {timeline.map((entry, i) => (
                  <tr
                    key={`${entry.correlationId}-${i}`}
                    className={`border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${
                      selectedId === entry.correlationId
                        ? "bg-indigo-50/50 dark:bg-indigo-950/30"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-1.5 font-mono text-zinc-400 whitespace-nowrap">
                      {formatTime(entry.timestamp)}
                    </td>
                    <td className="px-4 py-1.5">
                      <Badge>{entry.storeName}</Badge>
                    </td>
                    <td className="px-4 py-1.5">
                      <Badge color={eventColor(entry)}>{entry.name}</Badge>
                    </td>
                    <td className="px-4 py-1.5">
                      <button
                        onClick={() => selectCorrelation(entry.correlationId)}
                        className="font-mono text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        {truncId(entry.correlationId)}
                      </button>
                    </td>
                    <td className="px-4 py-1.5 font-mono text-zinc-400">
                      {entry.causedBy ? (
                        <button
                          onClick={() => selectCorrelation(entry.causedBy!)}
                          className="text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          {truncId(entry.causedBy)}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-1.5 font-mono text-zinc-500 max-w-[200px] truncate">
                      {entry.name === "stateChanged"
                        ? "state transition"
                        : JSON.stringify(entry.data)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Bottom: Causality + State History */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Causality Explorer */}
        <Card>
          <CardHeader title="Causality Chain" badge="getChain()" />
          <CardBody>
            {!selectedId && (
              <p className="text-xs text-zinc-400 text-center py-4">
                Click a correlation ID above to explore its causal chain.
              </p>
            )}
            {selectedId && chain.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-4">
                No chain found for {truncId(selectedId)}.
              </p>
            )}
            {chain.length > 0 && (
              <div className="space-y-1">
                {chain.map((entry, i) => {
                  const depth = entry.causedBy
                    ? chain.findIndex(
                        (e) => e.correlationId === entry.causedBy,
                      ) >= 0
                      ? 1
                      : 0
                    : 0;
                  return (
                    <div
                      key={`${entry.correlationId}-${i}`}
                      className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${
                        entry.correlationId === selectedId
                          ? "bg-indigo-50 dark:bg-indigo-950/50 ring-1 ring-indigo-200 dark:ring-indigo-800"
                          : "bg-zinc-50 dark:bg-zinc-800/30"
                      }`}
                      style={{ marginLeft: `${depth * 16}px` }}
                    >
                      {depth > 0 && (
                        <span className="text-zinc-300 dark:text-zinc-600">
                          &#8627;
                        </span>
                      )}
                      <Badge color={eventColor(entry)}>{entry.name}</Badge>
                      <span className="text-zinc-400">{entry.storeName}</span>
                      <span className="font-mono text-zinc-400 ml-auto">
                        {truncId(entry.correlationId)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* State History */}
        <Card>
          <CardHeader title="State History" badge="getStateHistory()" />
          <CardBody className="space-y-4">
            {[
              { name: "INVENTORY_STORE", history: inventoryHistory },
              { name: "CART_STORE", history: cartHistory },
            ].map(({ name, history }) => (
              <div key={name}>
                <p className="text-xs font-semibold text-zinc-500 mb-2">
                  {name}
                </p>
                {history.length === 0 ? (
                  <p className="text-xs text-zinc-400">No state changes yet.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {history.map((snap, i) => (
                      <div
                        key={`${snap.correlationId}-${i}`}
                        className="flex items-start gap-2 text-xs bg-zinc-50 dark:bg-zinc-800/30 rounded px-2 py-1.5"
                      >
                        <span className="font-mono text-zinc-400 whitespace-nowrap shrink-0">
                          {formatTime(snap.timestamp)}
                        </span>
                        <pre className="font-mono text-zinc-500 overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(snap.state, null, 2).slice(0, 200)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
