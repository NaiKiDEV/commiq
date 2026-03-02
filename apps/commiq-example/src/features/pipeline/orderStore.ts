import { createStore, sealStore } from "@naikidev/commiq";
import { OrderEvent } from "./events";

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

export const orderStore = sealStore(_orderStore);
