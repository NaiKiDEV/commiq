import { createEvent } from "@naikidev/commiq";

export const SearchEvent = {
  Completed: createEvent<{ query: string; count: number }>("search:completed"),
};
