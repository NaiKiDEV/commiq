import { createEventBus, createCommand } from "@naikidev/commiq";
import {
  OrderEvent,
  PaymentEvent,
  FulfillmentEvent,
  NotificationEvent,
} from "./events";
import { orderStore } from "./orderStore";
import { paymentStore } from "./paymentStore";
import { fulfillmentStore } from "./fulfillmentStore";
import { notificationStore } from "./notificationStore";

const pipelineBus = createEventBus();
pipelineBus.connect(orderStore);
pipelineBus.connect(paymentStore);
pipelineBus.connect(fulfillmentStore);
pipelineBus.connect(notificationStore);

pipelineBus.on(OrderEvent.Validated, (event) => {
  paymentStore.queue(
    createCommand("payment:process", {
      orderId: event.data.orderId,
      amount: event.data.total,
    }),
  );
});

pipelineBus.on(PaymentEvent.Completed, (event) => {
  orderStore.queue(
    createCommand("order:update-status", {
      orderId: event.data.orderId,
      status: "paid" as const,
    }),
  );
  fulfillmentStore.queue(
    createCommand("fulfillment:ship", {
      orderId: event.data.orderId,
      transactionId: event.data.transactionId,
    }),
  );
});

pipelineBus.on(PaymentEvent.Failed, (event) => {
  orderStore.queue(
    createCommand("order:update-status", {
      orderId: event.data.orderId,
      status: "rejected" as const,
    }),
  );
});

pipelineBus.on(FulfillmentEvent.Shipped, (event) => {
  orderStore.queue(
    createCommand("order:update-status", {
      orderId: event.data.orderId,
      status: "shipped" as const,
    }),
  );
  notificationStore.queue(
    createCommand("notification:send", {
      orderId: event.data.orderId,
      trackingCode: event.data.trackingCode,
    }),
  );
});

pipelineBus.on(NotificationEvent.Sent, (event) => {
  orderStore.queue(
    createCommand("order:update-status", {
      orderId: event.data.orderId,
      status: "done" as const,
    }),
  );
});
