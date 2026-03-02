import { createEvent } from "@naikidev/commiq";

export type User = {
  id: number;
  name: string;
  email: string;
};

export const UserEvent = {
  Fetched: createEvent<{ count: number }>("user:fetched"),
  FetchFailed: createEvent<{ message: string }>("user:fetch-failed"),
};
