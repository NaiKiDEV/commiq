import {
  createStore,
  createCommand,
  createEvent,
  sealStore,
} from "@naikidev/commiq";

// --- State ---

export interface CounterState {
  count: number;
}

// --- Events ---

export const counterReset = createEvent("counter:reset");

// --- Commands ---

export const increment = () => createCommand("increment", undefined);
export const decrement = () => createCommand("decrement", undefined);
export const reset = () => createCommand("reset", undefined);
export const incrementBy = (amount: number) =>
  createCommand("incrementBy", amount);

// --- Store ---

const _counterStore = createStore<CounterState>({ count: 0 });

_counterStore
  .addCommandHandler("increment", (ctx) => {
    ctx.setState({ count: ctx.state.count + 1 });
  })
  .addCommandHandler("decrement", (ctx) => {
    ctx.setState({ count: ctx.state.count - 1 });
  })
  .addCommandHandler<number>("incrementBy", (ctx, cmd) => {
    ctx.setState({ count: ctx.state.count + cmd.data });
  })
  .addCommandHandler("reset", (ctx) => {
    ctx.setState({ count: 0 });
    ctx.emit(counterReset, undefined);
  });

export const counterStore = sealStore(_counterStore);
