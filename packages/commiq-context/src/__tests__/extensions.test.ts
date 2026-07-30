import { describe, it, expect } from "vitest";
import { createStore, createCommand, createEvent } from "@naikidev/commiq";
import { extendStore, withLogger, withMeta, withHistory } from "../index";
import type { LogEntry } from "../index";

type State = { count: number };

describe("withLogger", () => {
  it("calls onLog with log entries from command handlers", async () => {
    const entries: LogEntry[] = [];

    const store = createStore<State>({ count: 0 });
    extendStore(store)
      .use(withLogger<State>({ onLog: (entry) => entries.push(entry) }))
      .addCommandHandler("test", (ctx) => {
        ctx.log("info", "handling test command");
        ctx.log("debug", "some detail");
      });

    store.queue(createCommand("test", undefined));
    await store.flush();

    expect(entries).toHaveLength(2);
    expect(entries[0].level).toBe("info");
    expect(entries[0].message).toBe("handling test command");
    expect(entries[1].level).toBe("debug");
    expect(entries[1].message).toBe("some detail");
    expect(entries[0].timestamp).toBeGreaterThan(0);
  });

  it("calls onLog from event handlers", async () => {
    const TestEvent = createEvent("testEvent");
    const entries: LogEntry[] = [];

    const store = createStore<State>({ count: 0 });
    const extended = extendStore(store).use(
      withLogger<State>({ onLog: (entry) => entries.push(entry) }),
    );

    extended.addCommandHandler("fire", (ctx) => {
      ctx.emit(TestEvent, undefined);
    });
    extended.addEventHandler(TestEvent, (ctx) => {
      ctx.log("warn", "event received");
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("warn");
  });

  it("works without onLog handler", async () => {
    const store = createStore<State>({ count: 0 });
    extendStore(store)
      .use(withLogger<State>())
      .addCommandHandler("test", (ctx) => {
        ctx.log("info", "no handler");
      });

    store.queue(createCommand("test", undefined));
    await store.flush();

    expect(store.state.count).toBe(0);
  });
});

describe("withMeta", () => {
  it("provides command metadata in command handlers", async () => {
    const metas: { commandName: string; correlationId: string }[] = [];

    const store = createStore<State>({ count: 0 });
    extendStore(store)
      .use(withMeta<State>())
      .addCommandHandler("increment", (ctx) => {
        metas.push({
          commandName: ctx.meta.commandName,
          correlationId: ctx.meta.correlationId,
        });
      });

    store.queue(createCommand("increment", undefined));
    await store.flush();

    expect(metas).toHaveLength(1);
    expect(metas[0].commandName).toBe("increment");
    expect(metas[0].correlationId).toBeTruthy();
  });

  it("provides event metadata in event handlers", async () => {
    const TestEvent = createEvent("testEvent");
    const metas: { commandName: string }[] = [];

    const store = createStore<State>({ count: 0 });
    const extended = extendStore(store).use(withMeta<State>());

    extended.addCommandHandler("fire", (ctx) => {
      ctx.emit(TestEvent, undefined);
    });
    extended.addEventHandler(TestEvent, (ctx) => {
      metas.push({ commandName: ctx.meta.commandName });
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(metas).toHaveLength(1);
    expect(metas[0].commandName).toBe("testEvent");
  });
});

describe("withHistory", () => {
  it("tracks previous states in command handlers", async () => {
    const snapshots: { previous: State | undefined; length: number }[] = [];

    const store = createStore<State>({ count: 0 });
    extendStore(store)
      .use(withHistory<State>())
      .addCommandHandler("inc", (ctx) => {
        snapshots.push({
          previous: ctx.history.previous,
          length: ctx.history.entries.length,
        });
        ctx.setState({ count: ctx.state.count + 1 });
      });

    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(snapshots[0].previous).toBeUndefined();
    expect(snapshots[0].length).toBe(1);

    expect(snapshots[1].previous).toEqual({ count: 0 });
    expect(snapshots[1].length).toBe(2);

    expect(snapshots[2].previous).toEqual({ count: 1 });
    expect(snapshots[2].length).toBe(3);
  });

  it("respects maxEntries option", async () => {
    const lengths: number[] = [];

    const store = createStore<State>({ count: 0 });
    extendStore(store)
      .use(withHistory<State>({ maxEntries: 2 }))
      .addCommandHandler("inc", (ctx) => {
        lengths.push(ctx.history.entries.length);
        ctx.setState({ count: ctx.state.count + 1 });
      });

    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(lengths).toEqual([1, 2, 2, 2]);
  });

  it("does not record a transition for a command that never sets state", async () => {
    const snapshots: { previous: State | undefined; length: number }[] = [];

    const store = createStore<State>({ count: 0 });
    const extended = extendStore(store).use(withHistory<State>());

    extended.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    extended.addCommandHandler("read", (ctx) => {
      snapshots.push({
        previous: ctx.history.previous,
        length: ctx.history.entries.length,
      });
    });

    store.queue(createCommand("inc", undefined));
    for (let index = 0; index < 15; index += 1) {
      store.queue(createCommand("read", undefined));
    }
    await store.flush();

    expect(snapshots).toHaveLength(15);
    for (const snapshot of snapshots) {
      expect(snapshot.previous).toEqual({ count: 0 });
      expect(snapshot.length).toBe(2);
    }
  });

  it("does not record a transition for event context builds", async () => {
    const TestEvent = createEvent("noop");
    const lengths: number[] = [];

    const store = createStore<State>({ count: 0 });
    const extended = extendStore(store).use(withHistory<State>());

    extended.addCommandHandler("fire", (ctx) => {
      ctx.emit(TestEvent, undefined);
    });
    extended.addEventHandler(TestEvent, (ctx) => {
      lengths.push(ctx.history.entries.length);
    });

    store.queue(createCommand("fire", undefined));
    store.queue(createCommand("fire", undefined));
    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(lengths).toEqual([1, 1, 1]);
  });

  it("records one entry per setState call within a single command", async () => {
    const store = createStore<State>({ count: 0 });
    let observed: ReadonlyArray<State> = [];

    const extended = extendStore(store).use(withHistory<State>());
    extended.addCommandHandler("bump", (ctx) => {
      ctx.setState({ count: 1 });
      ctx.setState({ count: 2 });
      ctx.setState({ count: 3 });
      observed = ctx.history.entries;
    });

    store.queue(createCommand("bump", undefined));
    await store.flush();

    expect(observed).toEqual([
      { count: 0 },
      { count: 1 },
      { count: 2 },
      { count: 3 },
    ]);
  });

  it("exposes a live view that reflects transitions made by the running handler", async () => {
    const store = createStore<State>({ count: 0 });
    const seen: (State | undefined)[] = [];

    const extended = extendStore(store).use(withHistory<State>());
    extended.addCommandHandler("bump", (ctx) => {
      seen.push(ctx.history.previous);
      ctx.setState({ count: 1 });
      seen.push(ctx.history.previous);
    });

    store.queue(createCommand("bump", undefined));
    await store.flush();

    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toEqual({ count: 0 });
  });

  it("clear() drops recorded transitions but keeps the current state", async () => {
    const store = createStore<State>({ count: 0 });
    const results: { length: number; previous: State | undefined }[] = [];

    const extended = extendStore(store).use(withHistory<State>());
    extended.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    extended.addCommandHandler("reset", (ctx) => {
      ctx.history.clear();
      results.push({
        length: ctx.history.entries.length,
        previous: ctx.history.previous,
      });
    });

    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("reset", undefined));
    await store.flush();

    expect(results).toEqual([{ length: 1, previous: undefined }]);
  });

  it("keeps history per store when one factory is shared", async () => {
    const factory = withHistory<State>({ maxEntries: 5 });
    const storeA = createStore<State>({ count: 0 });
    const storeB = createStore<State>({ count: 100 });
    const lengths: number[] = [];

    const register = (store: typeof storeA) => {
      extendStore(store)
        .use(factory)
        .addCommandHandler("inc", (ctx) => {
          ctx.setState({ count: ctx.state.count + 1 });
          lengths.push(ctx.history.entries.length);
        });
    };

    register(storeA);
    register(storeB);

    storeA.queue(createCommand("inc", undefined));
    await storeA.flush();
    storeB.queue(createCommand("inc", undefined));
    await storeB.flush();
    storeA.queue(createCommand("inc", undefined));
    await storeA.flush();

    expect(lengths).toEqual([2, 2, 3]);
    expect(storeA.state.count).toBe(2);
    expect(storeB.state.count).toBe(101);
  });

  it("releases retained snapshots and stops recording after destroy", async () => {
    const store = createStore<State>({ count: 0 });
    const extended = extendStore(store).use(withHistory<State>());
    const lengths: number[] = [];

    extended.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
      lengths.push(ctx.history.entries.length);
    });

    store.queue(createCommand("inc", undefined));
    await store.flush();
    expect(lengths).toEqual([2]);

    extended.destroy();

    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(lengths).toEqual([2, 0]);
    expect(store.state.count).toBe(2);
  });
});
