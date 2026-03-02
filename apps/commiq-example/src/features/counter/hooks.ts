import { useSelector, useQueue } from "@naikidev/commiq-react";
import { counterStore } from "./store";
import { CounterCommand } from "./commands";

export function useCounter() {
  const count = useSelector(counterStore, (s) => s.count);
  const queue = useQueue(counterStore);

  return {
    count,
    increment: () => queue(CounterCommand.increment()),
    decrement: () => queue(CounterCommand.decrement()),
    incrementBy: (amount: number) => queue(CounterCommand.incrementBy(amount)),
    reset: () => queue(CounterCommand.reset()),
    throwError: () => queue(CounterCommand.throwError()),
  };
}
