import {
  createStore,
  createCommand,
  createEvent,
  sealStore,
  BuiltinEvent,
} from "@naikidev/commiq";
import { createEffects } from "@naikidev/commiq-effects";

export interface SearchResult {
  id: number;
  title: string;
  category: string;
}

export interface SearchState {
  query: string;
  results: SearchResult[];
  loading: boolean;
  recentSearches: string[];
  stats: { completed: number; interrupted: number };
}

export const searchCompleted = createEvent<{
  query: string;
  count: number;
}>("searchCompleted");

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

const _searchStore = createStore<SearchState>({
  query: "",
  results: [],
  loading: false,
  recentSearches: [],
  stats: { completed: 0, interrupted: 0 },
});

_searchStore
  .addCommandHandler<string>(
    "search",
    async (ctx, cmd) => {
      const query = cmd.data.trim().toLowerCase();

      if (!query) {
        ctx.setState({ ...ctx.state, query: "", results: [], loading: false });
        return;
      }

      ctx.setState({ ...ctx.state, query: cmd.data, loading: true });

      // Simulate network latency — slow enough to interrupt
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));

      // Check if we were aborted during the wait
      if (ctx.signal!.aborted) return;

      const results = catalog.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query),
      );

      ctx.setState({ ...ctx.state, results, loading: false });
      ctx.emit(searchCompleted, { query: cmd.data, count: results.length });
    },
    { interruptable: true },
  )
  .addCommandHandler("clearSearch", (ctx) => {
    ctx.setState({
      ...ctx.state,
      query: "",
      results: [],
      loading: false,
    });
  })
  .addCommandHandler<string>("addRecent", (ctx, cmd) => {
    const recent = [
      cmd.data,
      ...ctx.state.recentSearches.filter((s) => s !== cmd.data),
    ].slice(0, 5);
    ctx.setState({ ...ctx.state, recentSearches: recent });
  })
  .addCommandHandler<"completed" | "interrupted">("incrementStat", (ctx, cmd) => {
    ctx.setState({
      ...ctx.state,
      stats: {
        ...ctx.state.stats,
        [cmd.data]: ctx.state.stats[cmd.data] + 1,
      },
    });
  });

// Track interruptions via the builtin event
_searchStore.addEventHandler(BuiltinEvent.CommandInterrupted, (ctx, event) => {
  const data = event.data as { command: { name: string }; phase: string };
  if (data.command.name === "search") {
    ctx.queue(createCommand("incrementStat", "interrupted" as const));
  }
});

export const searchStore = sealStore(_searchStore);

// --- Effects: react to search completion ---
const effects = createEffects(searchStore);

// Save to recent searches (debounced — rapid completions only save the last)
effects.on(
  searchCompleted,
  (data, ctx) => {
    ctx.queue(createCommand("addRecent", data.query));
    ctx.queue(createCommand("incrementStat", "completed" as const));
  },
  { debounce: 200 },
);

// Command factories
export const search = (query: string) => createCommand("search", query);
export const clearSearch = () => createCommand("clearSearch", undefined);
