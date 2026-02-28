import { describe, it, expect, vi } from "vitest";
import { createStore, createCommand, BuiltinEvent } from "../index";
import { sealStore } from "../proxy";

describe("createStore", () => {
  it("creates a store with initial state", () => {
    const store = createStore({ count: 0 });
    expect(store.state).toEqual({ count: 0 });
  });

  it("registers and processes a sync command handler", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("increment", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    store.queue(createCommand("increment", undefined));
    await store.flush();
    expect(store.state).toEqual({ count: 1 });
  });

  it("registers and processes an async command handler", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("increment", async (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    store.queue(createCommand("increment", undefined));
    await store.flush();
    expect(store.state).toEqual({ count: 1 });
  });

  it("processes commands sequentially", async () => {
    const order: number[] = [];
    const store = createStore({ value: "" });
    store.addCommandHandler<number>("append", async (ctx, cmd) => {
      order.push(cmd.data);
      await new Promise((r) => setTimeout(r, cmd.data === 1 ? 50 : 10));
      ctx.setState({ value: ctx.state.value + cmd.data });
    });
    store.queue(createCommand("append", 1));
    store.queue(createCommand("append", 2));
    await store.flush();
    expect(store.state.value).toBe("12");
    expect(order).toEqual([1, 2]);
  });
});

describe("replaceState", () => {
  it("updates state directly", () => {
    const store = createStore({ count: 0 });
    store.replaceState({ count: 42 });
    expect(store.state).toEqual({ count: 42 });
  });

  it("emits stateChanged with correct prev and next", () => {
    const store = createStore({ count: 0 });
    const events: { prev: unknown; next: unknown }[] = [];
    store.openStream((event) => {
      if (event.id === BuiltinEvent.StateChanged.id) {
        events.push(event.data as { prev: unknown; next: unknown });
      }
    });
    const next = { count: 5 };
    store.replaceState(next);
    expect(events).toEqual([{ prev: { count: 0 }, next: { count: 5 } }]);
  });

  it("emits stateReset event", () => {
    const store = createStore({ count: 0 });
    let resetEmitted = false;
    store.openStream((event) => {
      if (event.id === BuiltinEvent.StateReset.id) {
        resetEmitted = true;
      }
    });
    store.replaceState({ count: 1 });
    expect(resetEmitted).toBe(true);
  });

  it("is a no-op when same reference is passed", () => {
    const initial = { count: 0 };
    const store = createStore(initial);
    const listener = vi.fn();
    store.openStream(listener);
    store.replaceState(initial);
    expect(listener).not.toHaveBeenCalled();
    expect(store.state).toBe(initial);
  });

  it("works while queue is idle", () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("increment", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    store.replaceState({ count: 100 });
    expect(store.state).toEqual({ count: 100 });
  });

  it("is not exposed on sealStore", () => {
    const store = createStore({ count: 0 });
    const sealed = sealStore(store);
    expect("replaceState" in sealed).toBe(false);
  });
});
