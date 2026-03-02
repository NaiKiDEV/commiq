import { useSelector, useQueue } from "@naikidev/commiq-react";
import { orderStore } from "./orderStore";
import { paymentStore } from "./paymentStore";
import { fulfillmentStore } from "./fulfillmentStore";
import { notificationStore } from "./notificationStore";
import { PipelineCommand } from "./commands";

export function useOrders() {
  const orders = useSelector(orderStore, (s) => s.orders);
  const queue = useQueue(orderStore);

  return {
    orders,
    placeOrder: (item: string, total: number) =>
      queue(PipelineCommand.placeOrder(item, total)),
  };
}

export function usePayments() {
  return {
    transactions: useSelector(paymentStore, (s) => s.transactions),
  };
}

export function useShipments() {
  return {
    shipments: useSelector(fulfillmentStore, (s) => s.shipments),
  };
}

export function useNotifications() {
  return {
    notifications: useSelector(notificationStore, (s) => s.log),
  };
}
