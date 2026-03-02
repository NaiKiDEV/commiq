import { createEvent } from "@naikidev/commiq";

export const OrderEvent = {
  Validated: createEvent<{ orderId: string; total: number }>("order:validated"),
  Rejected: createEvent<{ orderId: string; reason: string }>("order:rejected"),
};

export const PaymentEvent = {
  Completed: createEvent<{ orderId: string; transactionId: string }>(
    "payment:completed",
  ),
  Failed: createEvent<{ orderId: string; reason: string }>("payment:failed"),
};

export const FulfillmentEvent = {
  Shipped: createEvent<{ orderId: string; trackingCode: string }>(
    "fulfillment:shipped",
  ),
};

export const NotificationEvent = {
  Sent: createEvent<{ orderId: string; channel: string; message: string }>(
    "notification:sent",
  ),
};
