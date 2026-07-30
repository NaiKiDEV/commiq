import {
  useSelector,
  useQueue,
  useCommandStatus,
  shallowEqual,
} from "@naikidev/commiq-react";
import type { DeepReadonly } from "@naikidev/commiq";
import { searchStore, SEARCH_QUERY_COMMAND } from "./store";
import type { SearchState } from "./store";
import { SearchCommand } from "./commands";

function selectSearch(s: DeepReadonly<SearchState>) {
  return {
    query: s.query,
    results: s.results,
    recentSearches: s.recentSearches,
    stats: s.stats,
  };
}

export function useSearchState() {
  const slice = useSelector(searchStore, selectSearch, shallowEqual);
  const { pending } = useCommandStatus(searchStore, SEARCH_QUERY_COMMAND);

  return { ...slice, loading: pending };
}

export function useSearchActions() {
  const queue = useQueue(searchStore);

  return {
    search: (query: string) => queue(SearchCommand.search(query)),
    clear: () => queue(SearchCommand.clear()),
  };
}
