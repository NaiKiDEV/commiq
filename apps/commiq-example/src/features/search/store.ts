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
  results: SearchResult[];
  loading: boolean;
  recentSearches: string[];
  stats: { completed: number; interrupted: number };
};

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
  loading: false,
  recentSearches: [],
  stats: { completed: 0, interrupted: 0 },
});

_store
  .addCommandHandler<string>(
    "search:query",
    async (ctx, cmd) => {
      const query = cmd.data.trim().toLowerCase();

      if (!query) {
        ctx.setState({ ...ctx.state, query: "", results: [], loading: false });
        return;
      }

      ctx.setState({ ...ctx.state, query: cmd.data, loading: true });

      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));

      if (ctx.signal!.aborted) return;

      const results = catalog.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query),
      );

      ctx.setState({ ...ctx.state, results, loading: false });
      ctx.emit(SearchEvent.Completed, {
        query: cmd.data,
        count: results.length,
      });
    },
    { interruptable: true },
  )
  .addCommandHandler("search:clear", (ctx) => {
    ctx.setState({
      ...ctx.state,
      query: "",
      results: [],
      loading: false,
    });
  })
  .addCommandHandler<string>("search:addRecent", (ctx, cmd) => {
    const recent = [
      cmd.data,
      ...ctx.state.recentSearches.filter((s) => s !== cmd.data),
    ].slice(0, 5);
    ctx.setState({ ...ctx.state, recentSearches: recent });
  })
  .addCommandHandler<"completed" | "interrupted">(
    "search:incrementStat",
    (ctx, cmd) => {
      ctx.setState({
        ...ctx.state,
        stats: {
          ...ctx.state.stats,
          [cmd.data]: ctx.state.stats[cmd.data] + 1,
        },
      });
    },
  );

_store.addEventHandler(BuiltinEvent.CommandInterrupted, (ctx, event) => {
  const data = event.data as { command: { name: string }; phase: string };
  if (data.command.name === "search:query") {
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
