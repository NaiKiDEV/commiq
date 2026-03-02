import { createStore, sealStore } from "@naikidev/commiq";
import { CounterEvent } from "./events";

export type CounterState = {
  count: number;
};

export const initialState: CounterState = { count: 0 };

const _store = createStore<CounterState>(initialState);

_store
  .addCommandHandler("counter:increment", (ctx) => {
    ctx.setState({ count: ctx.state.count + 1 });
  })
  .addCommandHandler("counter:decrement", (ctx) => {
    ctx.setState({ count: ctx.state.count - 1 });
  })
  .addCommandHandler<{ amount: number }>("counter:incrementBy", (ctx, cmd) => {
    ctx.setState({ count: ctx.state.count + cmd.data.amount });
  })
  .addCommandHandler("counter:reset", (ctx) => {
    ctx.setState(initialState);
    ctx.emit(CounterEvent.Reset, undefined);
  })
  .addCommandHandler("counter:throwError", () => {
    throw new Error("Something went wrong");
  });

export const counterStore = sealStore(_store);
