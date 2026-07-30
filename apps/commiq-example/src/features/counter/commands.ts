import { createCommandDef } from "@naikidev/commiq";

export const CounterCommand = {
  increment: createCommandDef("counter:increment"),
  decrement: createCommandDef("counter:decrement"),
  incrementBy: createCommandDef<{ amount: number }>("counter:incrementBy"),
  reset: createCommandDef("counter:reset"),
  throwError: createCommandDef("counter:throwError"),
};
