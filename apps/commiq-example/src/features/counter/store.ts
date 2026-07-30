import { createStore, sealStore } from "@naikidev/commiq";
import { CounterEvent } from "./events";
import { CounterCommand } from "./commands";

export type CounterState = {
  count: number;
};

export const initialState: CounterState = { count: 0 };

const _store = createStore<CounterState>(initialState);

_store
  .addCommandHandler(CounterCommand.increment, (ctx) => {
    ctx.setState({ count: ctx.state.count + 1 });
  })
  .addCommandHandler(CounterCommand.decrement, (ctx) => {
    ctx.setState({ count: ctx.state.count - 1 });
  })
  .addCommandHandler(CounterCommand.incrementBy, (ctx, cmd) => {
    ctx.setState({ count: ctx.state.count + cmd.data.amount });
  })
  .addCommandHandler(CounterCommand.reset, (ctx) => {
    ctx.setState(initialState);
    ctx.emit(CounterEvent.Reset, undefined);
  })
  .addCommandHandler(CounterCommand.throwError, () => {
    throw new Error("Something went wrong");
  });

export const counterStore = sealStore(_store);
