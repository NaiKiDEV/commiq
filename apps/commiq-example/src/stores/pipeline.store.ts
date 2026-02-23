import {
  createStore,
  createCommand,
  createEvent,
  createEventBus,
  sealStore,
} from "@naikidev/commiq";

export const orderValidated = createEvent<{ orderId: string; total: number }>(
  "orderValidated",
);
export const orderRejected = createEvent<{ orderId: string; reason: string }>(
  "orderRejected",
);
export const paymentCompleted = createEvent<{
  orderId: string;
  transactionId: string;
}>("paymentCompleted");
export const paymentFailed = createEvent<{
  orderId: string;
  reason: string;
}>("paymentFailed");
export const orderShipped = createEvent<{
  orderId: string;
  trackingCode: string;
}>("orderShipped");
export const notificationSent = createEvent<{
  orderId: string;
  channel: string;
  message: string;
}>("notificationSent");

export interface OrderState {
  orders: Array<{
    id: string;
    item: string;
    total: number;
    status: "pending" | "validated" | "rejected" | "paid" | "shipped" | "done";
  }>;
}

const _orderStore = createStore<OrderState>({ orders: [] });

let orderSeq = 0;

_orderStore.addCommandHandler<{ item: string; total: number }>(
  "placeOrder",
  (ctx, cmd) => {
    const id = `ORD-${String(++orderSeq).padStart(3, "0")}`;
    const { item, total } = cmd.data;

    if (total <= 0) {
      ctx.emit(orderRejected, { orderId: id, reason: "Invalid total" });
      return;
    }

    ctx.setState({
      orders: [...ctx.state.orders, { id, item, total, status: "pending" }],
    });
    ctx.emit(orderValidated, { orderId: id, total });
  },
  { notify: true },
);

_orderStore.addCommandHandler<{
  orderId: string;
  status: OrderState["orders"][number]["status"];
}>(
  "updateOrderStatus",
  (ctx, cmd) => {
    ctx.setState({
      orders: ctx.state.orders.map((o) =>
        o.id === cmd.data.orderId ? { ...o, status: cmd.data.status } : o,
      ),
    });
  },
  { notify: true },
);

export const orderStore = sealStore(_orderStore);

export interface PaymentState {
  transactions: Array<{
    id: string;
    orderId: string;
    amount: number;
    status: "processing" | "completed" | "failed";
  }>;
}

const _paymentStore = createStore<PaymentState>({ transactions: [] });

let txSeq = 0;

_paymentStore.addCommandHandler<{ orderId: string; amount: number }>(
  "processPayment",
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
      ctx.emit(paymentFailed, { orderId, reason: "Card declined" });
      return;
    }

    ctx.setState({
      transactions: ctx.state.transactions.map((t) =>
        t.id === txId ? { ...t, status: "completed" as const } : t,
      ),
    });
    ctx.emit(paymentCompleted, { orderId, transactionId: txId });
  },
  { notify: true },
);

export const paymentStore = sealStore(_paymentStore);

export interface FulfillmentState {
  shipments: Array<{
    orderId: string;
    trackingCode: string;
    status: "preparing" | "shipped";
  }>;
}

const _fulfillmentStore = createStore<FulfillmentState>({ shipments: [] });

_fulfillmentStore.addCommandHandler<{
  orderId: string;
  transactionId: string;
}>(
  "shipOrder",
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
    ctx.emit(orderShipped, { orderId, trackingCode });
  },
  { notify: true },
);

export const fulfillmentStore = sealStore(_fulfillmentStore);

export interface NotificationState {
  log: Array<{
    orderId: string;
    channel: string;
    message: string;
    sentAt: number;
  }>;
}

const _notificationStore = createStore<NotificationState>({ log: [] });

_notificationStore.addCommandHandler<{
  orderId: string;
  trackingCode: string;
}>(
  "sendNotification",
  (ctx, cmd) => {
    const { orderId, trackingCode } = cmd.data;
    const message = `Order ${orderId} shipped! Track: ${trackingCode}`;
    ctx.setState({
      log: [
        ...ctx.state.log,
        { orderId, channel: "email", message, sentAt: Date.now() },
      ],
    });
    ctx.emit(notificationSent, { orderId, channel: "email", message });
  },
  { notify: true },
);

export const notificationStore = sealStore(_notificationStore);

const pipelineBus = createEventBus();
pipelineBus.connect(_orderStore);
pipelineBus.connect(_paymentStore);
pipelineBus.connect(_fulfillmentStore);
pipelineBus.connect(_notificationStore);

pipelineBus.on(orderValidated, (event) => {
  _paymentStore.queue(
    createCommand(
      "processPayment",
      { orderId: event.data.orderId, amount: event.data.total },
      { causedBy: event.correlationId },
    ),
  );
});

pipelineBus.on(paymentCompleted, (event) => {
  _orderStore.queue(
    createCommand(
      "updateOrderStatus",
      { orderId: event.data.orderId, status: "paid" as const },
      { causedBy: event.correlationId },
    ),
  );
  _fulfillmentStore.queue(
    createCommand(
      "shipOrder",
      { orderId: event.data.orderId, transactionId: event.data.transactionId },
      { causedBy: event.correlationId },
    ),
  );
});

pipelineBus.on(paymentFailed, (event) => {
  _orderStore.queue(
    createCommand(
      "updateOrderStatus",
      { orderId: event.data.orderId, status: "rejected" as const },
      { causedBy: event.correlationId },
    ),
  );
});

pipelineBus.on(orderShipped, (event) => {
  _orderStore.queue(
    createCommand(
      "updateOrderStatus",
      { orderId: event.data.orderId, status: "shipped" as const },
      { causedBy: event.correlationId },
    ),
  );
  _notificationStore.queue(
    createCommand(
      "sendNotification",
      { orderId: event.data.orderId, trackingCode: event.data.trackingCode },
      { causedBy: event.correlationId },
    ),
  );
});

pipelineBus.on(notificationSent, (event) => {
  _orderStore.queue(
    createCommand(
      "updateOrderStatus",
      { orderId: event.data.orderId, status: "done" as const },
      { causedBy: event.correlationId },
    ),
  );
});

export const placeOrder = (item: string, total: number) =>
  createCommand("placeOrder", { item, total });
