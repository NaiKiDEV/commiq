import { createStore, sealStore } from "@naikidev/commiq";
import { NotificationEvent } from "./events";

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

export const notificationStore = sealStore(_notificationStore);
