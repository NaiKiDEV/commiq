import { createCommand } from "@naikidev/commiq";

export const SearchCommand = {
  search: (query: string) => createCommand("search:query", query),
  clear: () => createCommand("search:clear", undefined),
};
