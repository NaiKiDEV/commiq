import { createStore, sealStore } from "@naikidev/commiq";
import { FulfillmentEvent } from "./events";

export type FulfillmentState = {
  shipments: Array<{
    orderId: string;
    trackingCode: string;
    status: "preparing" | "shipped";
  }>;
};

const _fulfillmentStore = createStore<FulfillmentState>({
  shipments: [],
});

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

export const fulfillmentStore = sealStore(_fulfillmentStore);
