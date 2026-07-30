import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BuiltinEvent, createCommand, createStore } from "@naikidev/commiq";
import type { DeepReadonly } from "@naikidev/commiq";
import { mergeOverInitial, persistStore } from "../index";
import type { PersistErrorReport, StorageAdapter } from "../index";
import {
  createFakeStore,
  createSpyStorage,
  readNumber,
  readStored,
  stored,
} from "./helpers";
import type { TestState } from "./helpers";

function setup(initial: TestState = { count: 0 }) {
  const store = createStore<TestState>(initial, { onError: () => {} });
  store.addCommandHandler<number>("increment", (ctx, cmd) => {
    ctx.setState({ count: ctx.state.count + cmd.data });
  });
  return store;
}

describe("persistStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("hydration", () => {
    it("hydrates synchronously from a sync adapter before hydrated resolves", () => {
      localStorage.setItem("test", stored({ count: 42 }));
      const store = setup();

      const persisted = persistStore(store, { key: "test" });

      expect(store.state).toEqual({ count: 42 });
      persisted.destroy();
    });

    it("does not discard commands queued before hydration completes", async () => {
      localStorage.setItem("test", stored({ count: 100 }));
      const store = setup();
      const persisted = persistStore(store, { key: "test" });

      store.queue(createCommand("increment", 7));
      await store.flush();

      expect(store.state).toEqual({ count: 107 });
      persisted.destroy();
    });

    it("hydrates from an async adapter once hydrated resolves", async () => {
      const storage = createSpyStorage({ async: true });
      storage.entries.set("test", stored({ count: 99 }));
      const store = setup();

      const persisted = persistStore(store, { key: "test", storage });
      expect(store.state).toEqual({ count: 0 });
      await persisted.hydrated;

      expect(store.state).toEqual({ count: 99 });
      persisted.destroy();
    });

    it("runs a command queued during async hydration against the hydrated state", async () => {
      let releaseRead: (value: string | null) => void = () => {};
      const storage: StorageAdapter = {
        getItem: () =>
          new Promise<string | null>((resolve) => {
            releaseRead = resolve;
          }),
        setItem: () => {},
      };
      const store = setup();

      const persisted = persistStore(store, { key: "test", storage });
      const handle = store.queue(createCommand("increment", 7));

      expect(store.isSuspended).toBe(true);
      expect(store.state).toEqual({ count: 0 });

      releaseRead(stored({ count: 100 }));
      await persisted.hydrated;
      await store.flush();

      expect(store.state).toEqual({ count: 107 });
      expect((await handle).status).toBe("handled");
      persisted.destroy();
    });

    it("preserves command order across the hydration gate", async () => {
      const order: number[] = [];
      let releaseRead: (value: string | null) => void = () => {};
      const storage: StorageAdapter = {
        getItem: () =>
          new Promise<string | null>((resolve) => {
            releaseRead = resolve;
          }),
        setItem: () => {},
      };
      const store = createStore<TestState>({ count: 0 }, { onError: () => {} });
      store.addCommandHandler<number>("push", (ctx, cmd) => {
        order.push(cmd.data);
        ctx.setState({ count: ctx.state.count * 10 + cmd.data });
      });

      const persisted = persistStore(store, { key: "test", storage });
      store.queue(createCommand("push", 1));
      store.queue(createCommand("push", 2));
      store.queue(createCommand("push", 3));

      expect(order).toEqual([]);
      releaseRead(stored({ count: 5 }));
      await persisted.hydrated;
      await store.flush();

      expect(order).toEqual([1, 2, 3]);
      expect(store.state).toEqual({ count: 5123 });
      persisted.destroy();
    });

    it("still reports a hydration race when an in-flight command mutates state", async () => {
      const reports: PersistErrorReport[] = [];
      let releaseRead: (value: string | null) => void = () => {};
      let releaseCommand: () => void = () => {};
      const storage: StorageAdapter = {
        getItem: () =>
          new Promise<string | null>((resolve) => {
            releaseRead = resolve;
          }),
        setItem: () => {},
      };
      const store = createStore<TestState>({ count: 0 }, { onError: () => {} });
      store.addCommandHandler("slow", async (ctx) => {
        await new Promise<void>((resolve) => {
          releaseCommand = resolve;
        });
        ctx.setState({ count: 42 });
      });

      store.queue(createCommand("slow", undefined));
      await vi.advanceTimersByTimeAsync(1);

      const persisted = persistStore(store, {
        key: "test",
        storage,
        onError: (report) => reports.push(report),
      });
      releaseCommand();
      await vi.advanceTimersByTimeAsync(1);
      releaseRead(stored({ count: 5 }));
      await persisted.hydrated;

      expect(reports.map((report) => report.source)).toContain("hydrationRace");
      expect(store.state).toEqual({ count: 5 });
      persisted.destroy();
    });

    it("keeps initial state when nothing is stored", async () => {
      const store = setup({ count: 5 });
      const persisted = persistStore(store, { key: "test" });
      await persisted.hydrated;

      expect(store.state).toEqual({ count: 5 });
      persisted.destroy();
    });

    it("hydrates legacy values written without an envelope", async () => {
      localStorage.setItem("test", JSON.stringify({ count: 12 }));
      const store = setup();
      const persisted = persistStore(store, { key: "test" });
      await persisted.hydrated;

      expect(store.state).toEqual({ count: 12 });
      persisted.destroy();
    });

    it("reports read failures instead of throwing", async () => {
      const reports: PersistErrorReport[] = [];
      const storage: StorageAdapter = {
        getItem: () => {
          throw new Error("read denied");
        },
        setItem: () => {},
      };
      const store = setup();

      const persisted = persistStore(store, {
        key: "test",
        storage,
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      expect(reports[0]?.source).toBe("read");
      expect(store.state).toEqual({ count: 0 });
      persisted.destroy();
    });

    it("reports async read rejections instead of leaving an unhandled rejection", async () => {
      const reports: PersistErrorReport[] = [];
      const storage: StorageAdapter = {
        getItem: () => Promise.reject(new Error("offline")),
        setItem: () => {},
      };
      const store = setup();

      const persisted = persistStore(store, {
        key: "test",
        storage,
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      expect(reports[0]?.source).toBe("read");
      persisted.destroy();
    });
  });

  describe("hydration gate", () => {
    function asyncStorage(raw: string | null): StorageAdapter {
      return {
        getItem: () => Promise.resolve(raw),
        setItem: () => {},
        removeItem: () => {},
      };
    }

    it("releases the gate when the adapter rejects", async () => {
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage: {
          getItem: () => Promise.reject(new Error("offline")),
          setItem: () => {},
        },
        onError: () => {},
      });
      await persisted.hydrated;

      expect(store.isSuspended).toBe(false);
      persisted.destroy();
    });

    it("releases the gate when the stored payload is corrupt", async () => {
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage: asyncStorage("{not json"),
        onError: () => {},
      });
      await persisted.hydrated;

      expect(store.isSuspended).toBe(false);
      persisted.destroy();
    });

    it("releases the gate when migrate throws", async () => {
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage: asyncStorage(stored({ count: 1 }, 1)),
        version: 2,
        migrate: () => {
          throw new Error("no path");
        },
        onError: () => {},
      });
      await persisted.hydrated;

      expect(store.isSuspended).toBe(false);
      persisted.destroy();
    });

    it("releases the gate when validate throws", async () => {
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage: asyncStorage(stored({ count: 1 })),
        validate: () => {
          throw new Error("bad shape");
        },
        onError: () => {},
      });
      await persisted.hydrated;

      expect(store.isSuspended).toBe(false);
      persisted.destroy();
    });

    it("runs commands queued during a failed hydration instead of stranding them", async () => {
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage: {
          getItem: () => Promise.reject(new Error("offline")),
          setItem: () => {},
        },
        onError: () => {},
      });
      store.queue(createCommand("increment", 4));
      await persisted.hydrated;
      await store.flush();

      expect(store.state).toEqual({ count: 4 });
      persisted.destroy();
    });

    it("releases the gate and unblocks flush when destroyed mid-hydration", async () => {
      const storage: StorageAdapter = {
        getItem: () => new Promise<string | null>(() => {}),
        setItem: () => {},
      };
      const store = setup();
      const persisted = persistStore(store, { key: "test", storage });

      expect(store.isSuspended).toBe(true);
      store.queue(createCommand("increment", 3));
      persisted.destroy();

      expect(store.isSuspended).toBe(false);
      await store.flush();
      expect(store.state).toEqual({ count: 3 });
    });

    it("does not report a suspended queue for a synchronous adapter", async () => {
      const reports: string[] = [];
      localStorage.setItem("test", stored({ count: 3 }));
      const store = createStore<TestState>(
        { count: 0 },
        { onError: (report) => reports.push(report.source) },
      );

      const persisted = persistStore(store, { key: "test" });

      expect(store.isSuspended).toBe(false);
      expect(store.state).toEqual({ count: 3 });
      await vi.advanceTimersByTimeAsync(10000);

      expect(reports).not.toContain("suspendedQueue");
      persisted.destroy();
    });

    it("neither hangs nor rejects hydrated, flush and clear when hydration fails", async () => {
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage: {
          getItem: () => Promise.reject(new Error("offline")),
          setItem: () => {},
          removeItem: () => {},
        },
        onError: () => {},
      });

      await expect(persisted.hydrated).resolves.toBeUndefined();
      await expect(persisted.flush()).resolves.toBeUndefined();
      await expect(persisted.clear()).resolves.toBeUndefined();
      expect(store.isSuspended).toBe(false);
      persisted.destroy();
    });
  });

  describe("corrupt data", () => {
    it("reports corrupt JSON and keeps persisting afterwards", async () => {
      localStorage.setItem("test", "{not json");
      const reports: PersistErrorReport[] = [];
      const store = setup();

      const persisted = persistStore(store, {
        key: "test",
        debounce: 0,
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      expect(reports[0]?.source).toBe("deserialize");
      expect(reports[0]?.raw).toBe("{not json");
      expect(store.state).toEqual({ count: 0 });

      store.queue(createCommand("increment", 3));
      await store.flush();
      await vi.advanceTimersByTimeAsync(1);

      expect(readStored(localStorage.getItem("test"))).toEqual({ count: 3 });
      persisted.destroy();
    });

    it("clears the corrupt key by default", async () => {
      localStorage.setItem("test", "{not json");
      const store = setup();

      const persisted = persistStore(store, {
        key: "test",
        onError: () => {},
      });
      await persisted.hydrated;

      expect(localStorage.getItem("test")).toBeNull();
      persisted.destroy();
    });

    it("keeps the corrupt key when clearOnCorrupt is false", async () => {
      localStorage.setItem("test", "{not json");
      const store = setup();

      const persisted = persistStore(store, {
        key: "test",
        clearOnCorrupt: false,
        onError: () => {},
      });
      await persisted.hydrated;

      expect(localStorage.getItem("test")).toBe("{not json");
      persisted.destroy();
    });
  });

  describe("write failures", () => {
    it("reports a synchronous setItem failure", async () => {
      const reports: PersistErrorReport[] = [];
      const storage: StorageAdapter = {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      };
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage,
        debounce: 0,
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      store.queue(createCommand("increment", 1));
      await store.flush();
      await vi.advanceTimersByTimeAsync(1);

      expect(reports[0]?.source).toBe("write");
      persisted.destroy();
    });

    it("reports an async setItem rejection", async () => {
      const reports: PersistErrorReport[] = [];
      const storage: StorageAdapter = {
        getItem: () => null,
        setItem: () => Promise.reject(new Error("disk full")),
      };
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage,
        debounce: 0,
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      store.queue(createCommand("increment", 1));
      await store.flush();
      await vi.advanceTimersByTimeAsync(1);
      await persisted.flush();

      expect(reports[0]?.source).toBe("write");
      persisted.destroy();
    });

    it("reports a serialize failure", async () => {
      const reports: PersistErrorReport[] = [];
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        debounce: 0,
        serialize: () => {
          throw new Error("circular");
        },
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      store.queue(createCommand("increment", 1));
      await store.flush();
      await vi.advanceTimersByTimeAsync(1);

      expect(reports[0]?.source).toBe("serialize");
      expect(localStorage.getItem("test")).toBeNull();
      persisted.destroy();
    });
  });

  describe("writing", () => {
    it("persists state changes", async () => {
      const store = setup();
      const persisted = persistStore(store, { key: "test", debounce: 0 });
      await persisted.hydrated;

      store.queue(createCommand("increment", 5));
      await store.flush();
      await vi.advanceTimersByTimeAsync(1);

      expect(readStored(localStorage.getItem("test"))).toEqual({ count: 5 });
      persisted.destroy();
    });

    it("debounces multiple state changes into one write", async () => {
      const storage = createSpyStorage();
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage,
        debounce: 50,
      });
      await persisted.hydrated;

      store.queue(createCommand("increment", 1));
      await store.flush();
      store.queue(createCommand("increment", 1));
      await store.flush();
      store.queue(createCommand("increment", 1));
      await store.flush();
      await vi.advanceTimersByTimeAsync(100);

      expect(storage.setItem).toHaveBeenCalledTimes(1);
      expect(readStored(storage.entries.get("test") ?? null)).toEqual({
        count: 3,
      });
      persisted.destroy();
    });

    it("does not write while hydrating, even though replaceState reaches event handlers", async () => {
      const storage = createSpyStorage();
      storage.entries.set("test", stored({ count: 10 }));
      const seen: string[] = [];
      const store = setup();
      store.addEventHandler(BuiltinEvent.StateChanged, () => {
        seen.push("stateChanged");
      });
      store.addEventHandler(BuiltinEvent.StateReset, () => {
        seen.push("stateReset");
      });

      const persisted = persistStore(store, {
        key: "test",
        storage,
        debounce: 0,
      });
      await persisted.hydrated;
      await store.flush();
      await vi.advanceTimersByTimeAsync(50);

      expect(store.state).toEqual({ count: 10 });
      expect(seen).toContain("stateChanged");
      expect(seen).toContain("stateReset");
      expect(storage.setItem).not.toHaveBeenCalled();
      persisted.destroy();
    });

    it("uses custom serialize and deserialize", async () => {
      const serialize = vi.fn((snapshot: { state: unknown }) =>
        String(readNumber(snapshot.state, "count") ?? 0),
      );
      const deserialize = vi.fn((raw: string) => ({ count: Number(raw) }));

      localStorage.setItem("test", "77");
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        serialize,
        deserialize,
        debounce: 0,
      });
      await persisted.hydrated;

      expect(deserialize).toHaveBeenCalledWith("77");
      expect(store.state).toEqual({ count: 77 });

      store.queue(createCommand("increment", 3));
      await store.flush();
      await vi.advanceTimersByTimeAsync(1);

      expect(localStorage.getItem("test")).toBe("80");
      persisted.destroy();
    });
  });

  describe("flush and destroy", () => {
    it("flushes the pending debounced write on destroy", async () => {
      const store = setup();
      const persisted = persistStore(store, { key: "test" });
      await persisted.hydrated;

      store.queue(createCommand("increment", 42));
      await store.flush();
      await vi.advanceTimersByTimeAsync(50);
      persisted.destroy();

      expect(readStored(localStorage.getItem("test"))).toEqual({ count: 42 });
    });

    it("flushes on demand without waiting for the debounce", async () => {
      const storage = createSpyStorage();
      const store = setup();
      const persisted = persistStore(store, { key: "test", storage });
      await persisted.hydrated;

      store.queue(createCommand("increment", 8));
      await store.flush();
      await persisted.flush();

      expect(storage.setItem).toHaveBeenCalledTimes(1);
      expect(readStored(storage.entries.get("test") ?? null)).toEqual({
        count: 8,
      });

      await vi.advanceTimersByTimeAsync(500);
      expect(storage.setItem).toHaveBeenCalledTimes(1);
      persisted.destroy();
    });

    it("flushes when the page is hidden", async () => {
      const storage = createSpyStorage();
      const store = setup();
      const persisted = persistStore(store, { key: "test", storage });
      await persisted.hydrated;

      store.queue(createCommand("increment", 4));
      await store.flush();
      globalThis.dispatchEvent(new Event("pagehide"));

      expect(readStored(storage.entries.get("test") ?? null)).toEqual({
        count: 4,
      });
      persisted.destroy();
    });

    it("stops persisting after destroy", async () => {
      const storage = createSpyStorage();
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage,
        debounce: 0,
      });
      await persisted.hydrated;
      persisted.destroy();

      store.queue(createCommand("increment", 1));
      await store.flush();
      await vi.advanceTimersByTimeAsync(50);

      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("is idempotent when destroy is called twice", async () => {
      const store = createFakeStore({ count: 0 });
      const storage = createSpyStorage({ withSubscribe: true });
      const persisted = persistStore(store, {
        key: "test",
        storage,
        syncTabs: true,
      });
      await persisted.hydrated;

      expect(store.listenerCount()).toBe(1);
      persisted.destroy();
      persisted.destroy();

      expect(store.listenerCount()).toBe(0);
      expect(storage.subscriberCount()).toBe(0);
    });
  });

  describe("clear", () => {
    it("removes the stored value and cancels pending writes", async () => {
      const storage = createSpyStorage();
      const store = setup();
      const persisted = persistStore(store, { key: "test", storage });
      await persisted.hydrated;

      store.queue(createCommand("increment", 1));
      await store.flush();
      await persisted.clear();
      await vi.advanceTimersByTimeAsync(500);

      expect(storage.entries.has("test")).toBe(false);
      expect(storage.setItem).not.toHaveBeenCalled();
      persisted.destroy();
    });

    it("reports adapters without removeItem", async () => {
      const reports: PersistErrorReport[] = [];
      const storage: StorageAdapter = {
        getItem: () => null,
        setItem: () => {},
      };
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage,
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;
      await persisted.clear();

      expect(reports[0]?.source).toBe("unsupported");
      persisted.destroy();
    });
  });

  describe("versioning", () => {
    const migrate = (persisted: unknown, from: number): TestState => {
      if (from === 1) return { count: readNumber(persisted, "value") ?? 0 };
      return { count: 0 };
    };

    it("migrates a persisted value from an older version", async () => {
      localStorage.setItem("test", stored({ value: 5 }, 1));
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        version: 2,
        migrate,
      });
      await persisted.hydrated;

      expect(store.state).toEqual({ count: 5 });
      persisted.destroy();
    });

    it("skips hydration on a version mismatch with no migrate function", async () => {
      const reports: PersistErrorReport[] = [];
      localStorage.setItem("test", stored({ value: 5 }, 1));
      const store = setup({ count: 3 });
      const persisted = persistStore(store, {
        key: "test",
        version: 2,
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      expect(reports[0]?.source).toBe("migrate");
      expect(store.state).toEqual({ count: 3 });
      persisted.destroy();
    });

    it("reports a throwing migrate function and keeps the initial state", async () => {
      const reports: PersistErrorReport[] = [];
      localStorage.setItem("test", stored({ value: 5 }, 1));
      const store = setup({ count: 3 });
      const persisted = persistStore(store, {
        key: "test",
        version: 2,
        migrate: () => {
          throw new Error("bad migration");
        },
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      expect(reports[0]?.source).toBe("migrate");
      expect(store.state).toEqual({ count: 3 });
      persisted.destroy();
    });

    it("writes the configured version into storage", async () => {
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        version: 3,
        debounce: 0,
      });
      await persisted.hydrated;

      store.queue(createCommand("increment", 1));
      await store.flush();
      await vi.advanceTimersByTimeAsync(1);

      const raw: unknown = JSON.parse(localStorage.getItem("test") ?? "null");
      expect(readNumber(raw, "version")).toBe(3);
      persisted.destroy();
    });
  });

  describe("validation and merging", () => {
    it("skips hydration when validate rejects the stored shape", async () => {
      const reports: PersistErrorReport[] = [];
      localStorage.setItem("test", stored({ nope: true }));
      const store = setup({ count: 1 });
      const persisted = persistStore(store, {
        key: "test",
        validate: (raw) => {
          const count = readNumber(raw, "count");
          return count === undefined ? null : { count };
        },
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      expect(reports[0]?.source).toBe("validate");
      expect(store.state).toEqual({ count: 1 });
      persisted.destroy();
    });

    it("accepts a validated shape", async () => {
      localStorage.setItem("test", stored({ count: 9 }));
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        validate: (raw) => ({ count: readNumber(raw, "count") ?? 0 }),
      });
      await persisted.hydrated;

      expect(store.state).toEqual({ count: 9 });
      persisted.destroy();
    });

    it("merges the persisted value over the initial state so new keys keep defaults", async () => {
      type Wide = { count: number; theme: string };
      localStorage.setItem("test", stored({ count: 3 }));
      const store = createStore<Wide>({ count: 0, theme: "light" });
      const persisted = persistStore(store, { key: "test" });
      await persisted.hydrated;

      expect(store.state).toEqual({ count: 3, theme: "light" });
      persisted.destroy();
    });

    it("uses a custom merge function", async () => {
      localStorage.setItem("test", stored({ count: 3 }));
      const store = setup({ count: 100 });
      const persisted = persistStore(store, {
        key: "test",
        merge: (_persisted, initial) => ({ count: initial.count }),
      });
      await persisted.hydrated;

      expect(store.state).toEqual({ count: 100 });
      persisted.destroy();
    });

    it("reports a merge rejection", async () => {
      const reports: PersistErrorReport[] = [];
      localStorage.setItem("test", stored({ count: 3 }));
      const store = setup({ count: 1 });
      const persisted = persistStore(store, {
        key: "test",
        merge: () => null,
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      expect(reports[0]?.source).toBe("merge");
      expect(store.state).toEqual({ count: 1 });
      persisted.destroy();
    });
  });

  describe("cross-tab sync", () => {
    it("applies external changes when syncTabs is enabled", async () => {
      const storage = createSpyStorage({ withSubscribe: true });
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage,
        syncTabs: true,
        debounce: 0,
      });
      await persisted.hydrated;

      storage.emit(stored({ count: 21 }));
      await vi.advanceTimersByTimeAsync(50);

      expect(store.state).toEqual({ count: 21 });
      expect(storage.setItem).not.toHaveBeenCalled();
      persisted.destroy();
    });

    it("ignores the echo of its own write", async () => {
      const storage = createSpyStorage({ withSubscribe: true });
      const store = setup();
      const merge = vi.fn((persisted: unknown, initial: DeepReadonly<TestState>) =>
        mergeOverInitial<TestState>(persisted, initial),
      );
      const result = persistStore(store, {
        key: "test",
        storage,
        syncTabs: true,
        debounce: 0,
        merge,
      });
      await result.hydrated;

      store.queue(createCommand("increment", 5));
      await store.flush();
      await result.flush();
      storage.emit(storage.entries.get("test") ?? "");

      expect(merge).not.toHaveBeenCalled();

      storage.emit(stored({ count: 9 }));

      expect(merge).toHaveBeenCalledTimes(1);
      expect(store.state).toEqual({ count: 9 });
      result.destroy();
    });

    it("ignores external removals", async () => {
      const storage = createSpyStorage({ withSubscribe: true });
      const store = setup({ count: 7 });
      const persisted = persistStore(store, {
        key: "test",
        storage,
        syncTabs: true,
      });
      await persisted.hydrated;

      storage.emit(null);

      expect(store.state).toEqual({ count: 7 });
      persisted.destroy();
    });

    it("reports a failing replaceState instead of throwing from the event listener", async () => {
      const reports: PersistErrorReport[] = [];
      const storage = createSpyStorage({ withSubscribe: true });
      const base = createFakeStore({ count: 0 });
      const store = {
        ...base,
        get state() {
          return base.state;
        },
        replaceState: () => {
          throw new Error("store rejected the state");
        },
      };
      const persisted = persistStore(store, {
        key: "test",
        storage,
        syncTabs: true,
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      storage.emit(stored({ count: 1 }));

      expect(reports[0]?.source).toBe("apply");
      persisted.destroy();
    });

    it("reports adapters that cannot subscribe", async () => {
      const reports: PersistErrorReport[] = [];
      const storage: StorageAdapter = {
        getItem: () => null,
        setItem: () => {},
      };
      const store = setup();
      const persisted = persistStore(store, {
        key: "test",
        storage,
        syncTabs: true,
        onError: (report) => reports.push(report),
      });
      await persisted.hydrated;

      expect(reports[0]?.source).toBe("unsupported");
      persisted.destroy();
    });
  });

  describe("server rendering", () => {
    it("degrades to a no-op when localStorage is unavailable", async () => {
      vi.stubGlobal("localStorage", undefined);
      const store = setup({ count: 2 });

      const persisted = persistStore(store, { key: "test", debounce: 0 });
      await persisted.hydrated;
      store.queue(createCommand("increment", 1));
      await store.flush();
      await vi.advanceTimersByTimeAsync(1);

      expect(store.state).toEqual({ count: 3 });
      persisted.destroy();
    });

    it("degrades when reading localStorage throws", async () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        "localStorage",
      );
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get: () => {
          throw new Error("access denied");
        },
      });

      try {
        const store = setup({ count: 1 });
        const persisted = persistStore(store, { key: "test" });
        await persisted.hydrated;
        expect(store.state).toEqual({ count: 1 });
        persisted.destroy();
      } finally {
        if (descriptor === undefined) {
          Reflect.deleteProperty(globalThis, "localStorage");
        } else {
          Object.defineProperty(globalThis, "localStorage", descriptor);
        }
      }
    });
  });
});
