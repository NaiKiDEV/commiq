import { useSelector, useQueue } from "@naikidev/commiq-react";
import { searchStore } from "./store";
import { SearchCommand } from "./commands";

export function useSearchState() {
  return {
    query: useSelector(searchStore, (s) => s.query),
    results: useSelector(searchStore, (s) => s.results),
    loading: useSelector(searchStore, (s) => s.loading),
    recentSearches: useSelector(searchStore, (s) => s.recentSearches),
    stats: useSelector(searchStore, (s) => s.stats),
  };
}

export function useSearchActions() {
  const queue = useQueue(searchStore);

  return {
    search: (query: string) => queue(SearchCommand.search(query)),
    clear: () => queue(SearchCommand.clear()),
  };
}
