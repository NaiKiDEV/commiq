import {
  createStore,
  createCommand,
  createEventBus,
  sealStore,
} from "@naikidev/commiq";
import {
  OrderEvent,
  PaymentEvent,
  FulfillmentEvent,
  NotificationEvent,
} from "./events";

export type OrderStatus =
  | "pending"
  | "validated"
  | "rejected"
  | "paid"
  | "shipped"
  | "done";

export type OrderState = {
  orders: Array<{
    id: string;
    item: string;
    total: number;
    status: OrderStatus;
  }>;
};

const _orderStore = createStore<OrderState>({ orders: [] });

let orderSeq = 0;

_orderStore.addCommandHandler<{ item: string; total: number }>(
  "order:place",
  (ctx, cmd) => {
    const id = `ORD-${String(++orderSeq).padStart(3, "0")}`;
    const { item, total } = cmd.data;

    if (total <= 0) {
      ctx.emit(OrderEvent.Rejected, { orderId: id, reason: "Invalid total" });
      return;
    }

    ctx.setState({
      orders: [...ctx.state.orders, { id, item, total, status: "pending" }],
    });
    ctx.emit(OrderEvent.Validated, { orderId: id, total });
  },
  { notify: true },
);

_orderStore.addCommandHandler<{ orderId: string; status: OrderStatus }>(
  "order:update-status",
  (ctx, cmd) => {
    ctx.setState({
      orders: ctx.state.orders.map((o) =>
        o.id === cmd.data.orderId ? { ...o, status: cmd.data.status } : o,
      ),
    });
  },
  { notify: true },
);

export type PaymentState = {
  transactions: Array<{
    id: string;
    orderId: string;
    amount: number;
    status: "processing" | "completed" | "failed";
  }>;
};

const _paymentStore = createStore<PaymentState>({ transactions: [] });

let txSeq = 0;

_paymentStore.addCommandHandler<{ orderId: string; amount: number }>(
  "payment:process",
  async (ctx, cmd) => {
    const txId = `TX-${String(++txSeq).padStart(3, "0")}`;
    const { orderId, amount } = cmd.data;

    ctx.setState({
      transactions: [
        ...ctx.state.transactions,
        { id: txId, orderId, amount, status: "processing" },
      ],
    });

    await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));

    if (Math.random() < 0.15) {
      ctx.setState({
        transactions: ctx.state.transactions.map((t) =>
          t.id === txId ? { ...t, status: "failed" as const } : t,
        ),
      });
      ctx.emit(PaymentEvent.Failed, { orderId, reason: "Card declined" });
      return;
    }

    ctx.setState({
      transactions: ctx.state.transactions.map((t) =>
        t.id === txId ? { ...t, status: "completed" as const } : t,
      ),
    });
    ctx.emit(PaymentEvent.Completed, { orderId, transactionId: txId });
  },
  { notify: true },
);

export type FulfillmentState = {
  shipments: Array<{
    orderId: string;
    trackingCode: string;
    status: "preparing" | "shipped";
  }>;
};

const _fulfillmentStore = createStore<FulfillmentState>({ shipments: [] });

_fulfillmentStore.addCommandHandler<{
  orderId: string;
  transactionId: string;
}>(
  "fulfillment:ship",
  async (ctx, cmd) => {
    const { orderId } = cmd.data;
    const trackingCode = `TRK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    ctx.setState({
      shipments: [
        ...ctx.state.shipments,
        { orderId, trackingCode, status: "preparing" },
      ],
    });

    await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));

    ctx.setState({
      shipments: ctx.state.shipments.map((s) =>
        s.orderId === orderId ? { ...s, status: "shipped" as const } : s,
      ),
    });
    ctx.emit(FulfillmentEvent.Shipped, { orderId, trackingCode });
  },
  { notify: true },
);

export type NotificationState = {
  log: Array<{
    orderId: string;
    channel: string;
    message: string;
    sentAt: number;
  }>;
};

const _notificationStore = createStore<NotificationState>({ log: [] });

_notificationStore.addCommandHandler<{
  orderId: string;
  trackingCode: string;
}>(
  "notification:send",
  (ctx, cmd) => {
    const { orderId, trackingCode } = cmd.data;
    const message = `Order ${orderId} shipped! Track: ${trackingCode}`;
    ctx.setState({
      log: [
        ...ctx.state.log,
        { orderId, channel: "email", message, sentAt: Date.now() },
      ],
    });
    ctx.emit(NotificationEvent.Sent, { orderId, channel: "email", message });
  },
  { notify: true },
);

const pipelineBus = createEventBus();
pipelineBus.connect(_orderStore);
pipelineBus.connect(_paymentStore);
pipelineBus.connect(_fulfillmentStore);
pipelineBus.connect(_notificationStore);

pipelineBus.on(OrderEvent.Validated, (event) => {
  _paymentStore.queue(
    createCommand("payment:process", {
      orderId: event.data.orderId,
      amount: event.data.total,
    }),
  );
});

pipelineBus.on(PaymentEvent.Completed, (event) => {
  _orderStore.queue(
    createCommand("order:update-status", {
      orderId: event.data.orderId,
      status: "paid" as const,
    }),
  );
  _fulfillmentStore.queue(
    createCommand("fulfillment:ship", {
      orderId: event.data.orderId,
      transactionId: event.data.transactionId,
    }),
  );
});

pipelineBus.on(PaymentEvent.Failed, (event) => {
  _orderStore.queue(
    createCommand("order:update-status", {
      orderId: event.data.orderId,
      status: "rejected" as const,
    }),
  );
});

pipelineBus.on(FulfillmentEvent.Shipped, (event) => {
  _orderStore.queue(
    createCommand("order:update-status", {
      orderId: event.data.orderId,
      status: "shipped" as const,
    }),
  );
  _notificationStore.queue(
    createCommand("notification:send", {
      orderId: event.data.orderId,
      trackingCode: event.data.trackingCode,
    }),
  );
});

pipelineBus.on(NotificationEvent.Sent, (event) => {
  _orderStore.queue(
    createCommand("order:update-status", {
      orderId: event.data.orderId,
      status: "done" as const,
    }),
  );
});

export const orderStore = sealStore(_orderStore);
export const paymentStore = sealStore(_paymentStore);
export const fulfillmentStore = sealStore(_fulfillmentStore);
export const notificationStore = sealStore(_notificationStore);
