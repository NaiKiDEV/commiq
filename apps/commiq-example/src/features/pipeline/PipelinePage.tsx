import React from "react";
import {
  useOrders,
  usePayments,
  useShipments,
  useNotifications,
} from "./hooks";
import { Card, CardHeader, CardBody, Button, Badge } from "../../components/ui";
import { CodeExplorer } from "../../components/CodeExplorer";

import eventsRaw from "./events.ts?raw";
import commandsRaw from "./commands.ts?raw";
import orderStoreRaw from "./orderStore.ts?raw";
import paymentStoreRaw from "./paymentStore.ts?raw";
import fulfillmentStoreRaw from "./fulfillmentStore.ts?raw";
import notificationStoreRaw from "./notificationStore.ts?raw";
import busRaw from "./bus.ts?raw";
import hooksRaw from "./hooks.ts?raw";
import pageRaw from "./PipelinePage.tsx?raw";

const SAMPLE_ITEMS = [
  { item: "Mechanical Keyboard", total: 149 },
  { item: "4K Monitor", total: 599 },
  { item: "USB-C Dock", total: 89 },
];

function statusColor(
  status: string,
): "zinc" | "green" | "red" | "amber" | "indigo" {
  switch (status) {
    case "pending":
    case "processing":
    case "preparing":
      return "amber";
    case "validated":
    case "paid":
    case "completed":
    case "shipped":
      return "indigo";
    case "done":
      return "green";
    case "rejected":
    case "failed":
      return "red";
    default:
      return "zinc";
  }
}

export function PipelinePage() {
  const { orders, placeOrder } = useOrders();
  const { transactions } = usePayments();
  const { shipments } = useShipments();
  const { notifications } = useNotifications();

  return (
    <CodeExplorer
      title="Order Pipeline"
      description="Four stores chained 4 levels deep: placeOrder → orderValidated → processPayment → paymentCompleted → shipOrder → orderShipped → sendNotification → notificationSent → done. Watch the devtools Timeline and Graph tabs to see the full causality chain."
      files={[
        { name: "events.ts", content: eventsRaw },
        { name: "commands.ts", content: commandsRaw },
        { name: "orderStore.ts", content: orderStoreRaw },
        { name: "paymentStore.ts", content: paymentStoreRaw },
        { name: "fulfillmentStore.ts", content: fulfillmentStoreRaw },
        { name: "notificationStore.ts", content: notificationStoreRaw },
        { name: "bus.ts", content: busRaw },
        { name: "hooks.ts", content: hooksRaw },
        { name: "PipelinePage.tsx", content: pageRaw },
      ]}
    >
      <div className="mb-6">
        <Card>
          <CardHeader title="Place an Order" badge="orderStore" />
          <CardBody className="flex flex-wrap gap-2">
            {SAMPLE_ITEMS.map((s) => (
              <Button
                key={s.item}
                variant="primary"
                size="sm"
                onClick={() => placeOrder(s.item, s.total)}
              >
                {s.item} — ${s.total}
              </Button>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Orders" badge="orderStore" />
          <CardBody className="space-y-2">
            {orders.length === 0 && (
              <p className="text-sm text-zinc-400 text-center py-4">
                No orders yet
              </p>
            )}
            {orders.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between rounded-lg border border-zinc-100 dark:border-zinc-800 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {o.id} · {o.item}
                  </p>
                  <p className="text-xs text-zinc-400">${o.total}</p>
                </div>
                <Badge color={statusColor(o.status)}>{o.status}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Payments" badge="paymentStore" />
          <CardBody className="space-y-2">
            {transactions.length === 0 && (
              <p className="text-sm text-zinc-400 text-center py-4">
                No transactions yet
              </p>
            )}
            {transactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-zinc-100 dark:border-zinc-800 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {t.id} → {t.orderId}
                  </p>
                  <p className="text-xs text-zinc-400">${t.amount}</p>
                </div>
                <Badge color={statusColor(t.status)}>{t.status}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Shipments" badge="fulfillmentStore" />
          <CardBody className="space-y-2">
            {shipments.length === 0 && (
              <p className="text-sm text-zinc-400 text-center py-4">
                No shipments yet
              </p>
            )}
            {shipments.map((s) => (
              <div
                key={s.orderId}
                className="flex items-center justify-between rounded-lg border border-zinc-100 dark:border-zinc-800 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.orderId}</p>
                  <p className="text-xs text-zinc-400 font-mono">
                    {s.trackingCode}
                  </p>
                </div>
                <Badge color={statusColor(s.status)}>{s.status}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Notifications" badge="notificationStore" />
          <CardBody className="space-y-2">
            {notifications.length === 0 && (
              <p className="text-sm text-zinc-400 text-center py-4">
                No notifications yet
              </p>
            )}
            {notifications.map((n, i) => (
              <div
                key={i}
                className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge color="indigo">{n.channel}</Badge>
                  <span className="text-xs text-zinc-400">{n.orderId}</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {n.message}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </CodeExplorer>
  );
}
