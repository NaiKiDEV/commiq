import { createCommand } from "@naikidev/commiq";

export const CounterCommand = {
  increment: () => createCommand("counter:increment", undefined),
  decrement: () => createCommand("counter:decrement", undefined),
  incrementBy: (amount: number) =>
    createCommand("counter:incrementBy", { amount }),
  reset: () => createCommand("counter:reset", undefined),
  throwError: () => createCommand("counter:throwError", undefined),
};
