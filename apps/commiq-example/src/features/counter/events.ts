import { createEvent } from "@naikidev/commiq";

export const CounterEvent = {
  Reset: createEvent<void>("counter:reset"),
};
