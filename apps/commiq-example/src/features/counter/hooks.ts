import { useSelector, useQueue } from "@naikidev/commiq-react";
import { CounterCommand } from "./commands";
import type { CounterState } from "./store";

const STORE_NAME = "counter";

const selectCount = (s: { count: number }) => s.count;

export function useCounter() {
  const count = useSelector<CounterState, number>(STORE_NAME, selectCount);
  const queue = useQueue<CounterState>(STORE_NAME);

  return {
    count,
    increment: () => queue(CounterCommand.increment),
    decrement: () => queue(CounterCommand.decrement),
    incrementBy: (amount: number) =>
      queue(CounterCommand.incrementBy, { amount }),
    reset: () => queue(CounterCommand.reset),
    throwError: () => queue(CounterCommand.throwError),
  };
}
