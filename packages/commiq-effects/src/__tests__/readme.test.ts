import { describe, it, expect } from "vitest";
import {
  createCommand,
  createCommandDef,
  createEvent,
  createStore,
  sealStore,
} from "@naikidev/commiq";
import { createEffects } from "../index";

type SearchState = { results: string[] };

describe("README example", () => {
  it("compiles and runs", async () => {
    const store = createStore<SearchState>({ results: [] });
    const searchRequested = createEvent<string>("searchRequested");
    const setResults = createCommandDef<string[]>("setResults");

    store.addCommandHandler<string>("search", (ctx, cmd) => {
      ctx.emit(searchRequested, cmd.data);
    });

    store.addCommandHandler(setResults, (ctx, cmd) => {
      ctx.setState({ results: cmd.data });
    });

    const sealed = sealStore(store);
    const effects = createEffects(sealed, {
      onError: () => {},
    });

    const off = effects.on(
      searchRequested,
      async (query, ctx) => {
        const data = [`${query}:${ctx.state.results.length}`];
        ctx.queue(setResults, data);
      },
      { mode: "switch" },
    );

    store.queue(createCommand("search", "hello"));
    await store.flush();
    await store.flush();

    expect(store.state.results).toEqual(["hello:0"]);

    off();
    effects.destroy();
    effects.destroy();
  });
});
