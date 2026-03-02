import { createStore, sealStore } from "@naikidev/commiq";
import { PaymentEvent } from "./events";

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

export const paymentStore = sealStore(_paymentStore);
