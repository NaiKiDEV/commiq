import { createEvent } from "@naikidev/commiq";

export const CartEvent = {
  Updated: createEvent<{ itemCount: number }>("cart:updated"),
  Cleared: createEvent<void>("cart:cleared"),
};
