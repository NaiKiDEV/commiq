import {
  createStore,
  createCommand,
  sealStore,
  BuiltinEvent,
} from "@naikidev/commiq";
import { createEffects } from "@naikidev/commiq-effects";
import { SearchEvent } from "./events";

export type SearchResult = {
  id: number;
  title: string;
  category: string;
};

export type SearchState = {
  query: string;
  results: readonly SearchResult[];
  recentSearches: readonly string[];
  stats: { completed: number; interrupted: number };
};

export const SEARCH_QUERY_COMMAND = "search:query";

const catalog: SearchResult[] = [
  { id: 1, title: "Getting Started with Commiq", category: "Guide" },
  { id: 2, title: "Command Handlers Deep Dive", category: "Guide" },
  { id: 3, title: "Event-Driven Architecture", category: "Pattern" },
  { id: 4, title: "State Persistence Strategies", category: "Plugin" },
  { id: 5, title: "OpenTelemetry Integration", category: "Plugin" },
  { id: 6, title: "Devtools Setup & Usage", category: "Plugin" },
  { id: 7, title: "Async Commands & Loading States", category: "Pattern" },
  { id: 8, title: "Cross-Store Communication", category: "Pattern" },
  { id: 9, title: "Typed Command Factories", category: "Pattern" },
  { id: 10, title: "React Hooks for Commiq", category: "Guide" },
  { id: 11, title: "Effects & Side Effects", category: "Plugin" },
  { id: 12, title: "Interruptable Commands", category: "Guide" },
];

const _store = createStore<SearchState>({
  query: "",
  results: [],
  recentSearches: [],
  stats: { completed: 0, interrupted: 0 },
});

_store
  .addCommandHandler<string>(
    SEARCH_QUERY_COMMAND,
    async (ctx, cmd) => {
      const query = cmd.data.trim().toLowerCase();

      if (!query) {
        ctx.setState((prev) => ({ ...prev, query: "", results: [] }));
        return;
      }

      ctx.setState((prev) => ({ ...prev, query: cmd.data }));

      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));

      if (ctx.signal?.aborted) return;

      const results = catalog.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query),
      );

      ctx.setState((prev) => ({ ...prev, results }));
      ctx.emit(SearchEvent.Completed, {
        query: cmd.data,
        count: results.length,
      });
    },
    { interruptable: true },
  )
  .addCommandHandler("search:clear", (ctx) => {
    ctx.setState((prev) => ({ ...prev, query: "", results: [] }));
  })
  .addCommandHandler<string>("search:addRecent", (ctx, cmd) => {
    ctx.setState((prev) => ({
      ...prev,
      recentSearches: [
        cmd.data,
        ...prev.recentSearches.filter((s) => s !== cmd.data),
      ].slice(0, 5),
    }));
  })
  .addCommandHandler<"completed" | "interrupted">(
    "search:incrementStat",
    (ctx, cmd) => {
      ctx.setState((prev) => ({
        ...prev,
        stats: {
          ...prev.stats,
          [cmd.data]: prev.stats[cmd.data] + 1,
        },
      }));
    },
  );

_store.addEventHandler(BuiltinEvent.CommandInterrupted, (ctx, event) => {
  if (event.data.command.name === SEARCH_QUERY_COMMAND) {
    ctx.queue(createCommand("search:incrementStat", "interrupted" as const));
  }
});

export const searchStore = sealStore(_store);

const effects = createEffects(searchStore);

effects.on(
  SearchEvent.Completed,
  (data, ctx) => {
    ctx.queue(createCommand("search:addRecent", data.query));
    ctx.queue(createCommand("search:incrementStat", "completed" as const));
  },
  { debounce: 200 },
);
