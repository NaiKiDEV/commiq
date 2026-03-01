import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStore, createCommand } from "@naikidev/commiq";
import { persistStore } from "../persist";
import type { StorageAdapter } from "../types";

type TestState = { count: number };

function setup(initial: TestState = { count: 0 }) {
  const store = createStore<TestState>(initial);
  store.addCommandHandler<number>("increment", (ctx, cmd) => {
    ctx.setState({ count: ctx.state.count + cmd.data });
  });
  return store;
}

describe("persistStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hydrates from sync storage (localStorage)", async () => {
    localStorage.setItem("test", JSON.stringify({ count: 42 }));
    const store = setup();

    const { hydrated } = persistStore(store, { key: "test" });
    await hydrated;

    expect(store.state).toEqual({ count: 42 });
  });

  it("persists state changes to localStorage", async () => {
    const store = setup();
    const { hydrated, destroy } = persistStore(store, {
      key: "test",
      debounce: 0,
    });
    await hydrated;

    store.queue(createCommand("increment", 5));
    await store.flush();

    // wait for debounce (0ms setTimeout still defers)
    await new Promise((r) => setTimeout(r, 10));

    expect(JSON.parse(localStorage.getItem("test")!)).toEqual({ count: 5 });
    destroy();
  });

  it("hydrates from async storage", async () => {
    const asyncStorage: StorageAdapter = {
      getItem: async () => JSON.stringify({ count: 99 }),
      setItem: async () => {},
    };
    const store = setup();

    const { hydrated } = persistStore(store, {
      key: "test",
      storage: asyncStorage,
    });
    await hydrated;

    expect(store.state).toEqual({ count: 99 });
  });

  it("persists to async storage", async () => {
    const setItem = vi.fn<StorageAdapter["setItem"]>(async () => {});
    const asyncStorage: StorageAdapter = {
      getItem: async () => null,
      setItem,
    };
    const store = setup();
    const { hydrated, destroy } = persistStore(store, {
      key: "test",
      storage: asyncStorage,
      debounce: 0,
    });
    await hydrated;

    store.queue(createCommand("increment", 1));
    await store.flush();
    await new Promise((r) => setTimeout(r, 10));

    expect(setItem).toHaveBeenCalledWith("test", JSON.stringify({ count: 1 }));
    destroy();
  });

  it("debounces — only writes last value", async () => {
    const setItem = vi.fn<StorageAdapter["setItem"]>(async () => {});
    const storage: StorageAdapter = {
      getItem: async () => null,
      setItem,
    };
    const store = setup();
    const { hydrated, destroy } = persistStore(store, {
      key: "test",
      storage,
      debounce: 50,
    });
    await hydrated;

    store.queue(createCommand("increment", 1));
    await store.flush();
    store.queue(createCommand("increment", 1));
    await store.flush();
    store.queue(createCommand("increment", 1));
    await store.flush();

    await new Promise((r) => setTimeout(r, 100));

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith("test", JSON.stringify({ count: 3 }));
    destroy();
  });

  it("does not write during hydration (rehydration loop prevention)", async () => {
    const setItem = vi.fn<StorageAdapter["setItem"]>(() => {});
    const storage: StorageAdapter = {
      getItem: () => JSON.stringify({ count: 10 }),
      setItem,
    };
    const store = setup();
    const { hydrated, destroy } = persistStore(store, {
      key: "test",
      storage,
      debounce: 0,
    });
    await hydrated;

    // wait for any potential debounce
    await new Promise((r) => setTimeout(r, 50));

    expect(setItem).not.toHaveBeenCalled();
    destroy();
  });

  it("does not write after destroy", async () => {
    const setItem = vi.fn<StorageAdapter["setItem"]>(async () => {});
    const storage: StorageAdapter = {
      getItem: async () => null,
      setItem,
    };
    const store = setup();
    const { hydrated, destroy } = persistStore(store, {
      key: "test",
      storage,
      debounce: 0,
    });
    await hydrated;
    destroy();

    store.queue(createCommand("increment", 1));
    await store.flush();
    await new Promise((r) => setTimeout(r, 50));

    expect(setItem).not.toHaveBeenCalled();
  });

  it("uses custom serialize/deserialize", async () => {
    const serialize = vi.fn((s: TestState) => String(s.count));
    const deserialize = vi.fn((raw: string) => ({ count: Number(raw) }));

    localStorage.setItem("test", "77");
    const store = setup();
    const { hydrated, destroy } = persistStore(store, {
      key: "test",
      serialize,
      deserialize,
      debounce: 0,
    });
    await hydrated;

    expect(deserialize).toHaveBeenCalledWith("77");
    expect(store.state).toEqual({ count: 77 });

    store.queue(createCommand("increment", 3));
    await store.flush();
    await new Promise((r) => setTimeout(r, 10));

    expect(serialize).toHaveBeenCalledWith({ count: 80 });
    destroy();
  });

  it("resolves hydrated when no stored value exists", async () => {
    const store = setup({ count: 5 });
    const { hydrated, destroy } = persistStore(store, { key: "test" });
    await hydrated;

    expect(store.state).toEqual({ count: 5 });
    destroy();
  });
});
