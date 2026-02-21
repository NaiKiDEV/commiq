import { describe, it, expect, vi } from "vitest";
import { createStore, createCommand } from "../index";

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
    store.addCommandHandler("append", async (ctx, cmd) => {
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
