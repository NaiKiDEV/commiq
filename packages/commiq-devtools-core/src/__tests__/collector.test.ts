import { describe, it, expect, vi } from "vitest";
import {
  BuiltinEventName,
  createStore,
  createCommand,
  createEvent,
} from "@naikidev/commiq";
import { EventCollector } from "../collector";
import type { TimelineEntry } from "../types";

function counterStore() {
  const store = createStore({ count: 0 });
  store.addCommandHandler("inc", (ctx) => {
    ctx.setState({ count: ctx.state.count + 1 });
  });
  return store;
}

describe("EventCollector", () => {
  it("collects events into timeline with monotonic seq", async () => {
    const store = counterStore();
    const collector = new EventCollector({ maxEvents: 1000 });
    collector.connect(store, "counter");

    store.queue(createCommand("inc", undefined));
    await store.flush();

    const timeline = collector.getTimeline();
    expect(timeline.length).toBeGreaterThanOrEqual(3);
    expect(timeline.every((e) => e.storeName === "counter")).toBe(true);
    expect(timeline.map((e) => e.name)).toContain(BuiltinEventName.CommandStarted);
    expect(timeline.map((e) => e.name)).toContain(BuiltinEventName.StateChanged);
    expect(timeline.map((e) => e.name)).toContain(BuiltinEventName.CommandHandled);

    const seqs = timeline.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it("classifies command lifecycle events as commands", async () => {
    const store = counterStore();
    const collector = new EventCollector();
    collector.connect(store, "counter");

    store.queue(createCommand("inc", undefined));
    await store.flush();

    const timeline = collector.getTimeline();
    const started = timeline.find((e) => e.name === BuiltinEventName.CommandStarted);
    const stateChanged = timeline.find((e) => e.name === BuiltinEventName.StateChanged);
    expect(started?.type).toBe("command");
    expect(stateChanged?.type).toBe("event");
  });

  it("filters timeline by store name", async () => {
    const store1 = createStore({ a: 0 });
    const store2 = createStore({ b: 0 });
    store1.addCommandHandler("inc", (ctx) => ctx.setState({ a: ctx.state.a + 1 }));
    store2.addCommandHandler("inc", (ctx) => ctx.setState({ b: ctx.state.b + 1 }));

    const collector = new EventCollector({ maxEvents: 1000 });
    collector.connect(store1, "store1");
    collector.connect(store2, "store2");

    store1.queue(createCommand("inc", undefined));
    store2.queue(createCommand("inc", undefined));
    await store1.flush();
    await store2.flush();

    const s1Events = collector.getTimeline("store1");
    const s2Events = collector.getTimeline("store2");
    expect(s1Events.length).toBeGreaterThan(0);
    expect(s2Events.length).toBeGreaterThan(0);
    expect(s1Events.length + s2Events.length).toBe(collector.getTimeline().length);
    expect(s1Events.every((e) => e.storeName === "store1")).toBe(true);
    expect(s2Events.every((e) => e.storeName === "store2")).toBe(true);
  });

  it("walks the full causality chain across multiple hops", async () => {
    const userCreated = createEvent<{ name: string }>("userCreated");
    const store = createStore({ user: "", greeting: "" });

    store.addCommandHandler<{ name: string }>("createUser", (ctx, cmd) => {
      ctx.setState({ ...ctx.state, user: cmd.data.name });
      ctx.emit(userCreated, { name: cmd.data.name });
    });
    store.addCommandHandler<{ name: string }>("greet", (ctx, cmd) => {
      ctx.setState({ ...ctx.state, greeting: `Hello ${cmd.data.name}` });
    });
    store.addEventHandler(userCreated, (ctx, event) => {
      ctx.queue(createCommand("greet", { name: event.data.name }));
    });

    const collector = new EventCollector({ maxEvents: 1000 });
    collector.connect(store, "app");

    store.queue(createCommand("createUser", { name: "Alice" }));
    await store.flush();

    const timeline = collector.getTimeline();
    const firstCommandStarted = timeline.find(
      (e) => e.name === BuiltinEventName.CommandStarted,
    );
    expect(firstCommandStarted).toBeDefined();

    const rootId = firstCommandStarted!.causedBy!;
    const chain = collector.getChain(rootId);

    expect(chain.map((e) => e.seq)).toEqual([...chain].map((e) => e.seq).sort((a, b) => a - b));
    expect(chain).toHaveLength(timeline.length);
    expect(chain.map((e) => e.name).filter((n) => n === BuiltinEventName.CommandStarted))
      .toHaveLength(2);
    expect(chain.map((e) => e.name)).toContain("userCreated");
    expect(chain.map((e) => e.name).filter((n) => n === BuiltinEventName.CommandHandled))
      .toHaveLength(2);

    const greetStates = chain.filter((e) => e.name === BuiltinEventName.StateChanged);
    expect(greetStates.length).toBe(2);
    expect(greetStates[greetStates.length - 1].stateAfter).toEqual({
      user: "Alice",
      greeting: "Hello Alice",
    });
  });

  it("resolves the same chain from a mid-chain correlationId", async () => {
    const userCreated = createEvent<{ name: string }>("userCreatedMid");
    const store = createStore({ user: "", greeting: "" });

    store.addCommandHandler<{ name: string }>("createUser", (ctx, cmd) => {
      ctx.setState({ ...ctx.state, user: cmd.data.name });
      ctx.emit(userCreated, { name: cmd.data.name });
    });
    store.addCommandHandler<{ name: string }>("greet", (ctx, cmd) => {
      ctx.setState({ ...ctx.state, greeting: `Hi ${cmd.data.name}` });
    });
    store.addEventHandler(userCreated, (ctx, event) => {
      ctx.queue(createCommand("greet", { name: event.data.name }));
    });

    const collector = new EventCollector();
    collector.connect(store, "app");
    store.queue(createCommand("createUser", { name: "Bob" }));
    await store.flush();

    const timeline = collector.getTimeline();
    const emitted = timeline.find((e) => e.name === "userCreatedMid");
    expect(emitted).toBeDefined();

    const chain = collector.getChain(emitted!.correlationId);
    expect(chain).toHaveLength(timeline.length);
  });

  it("returns an empty chain for an unknown correlationId", () => {
    const collector = new EventCollector();
    expect(collector.getChain("does-not-exist")).toEqual([]);
  });

  it("tracks state history", async () => {
    const store = counterStore();
    const collector = new EventCollector({ maxEvents: 1000 });
    collector.connect(store, "counter");

    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const history = collector.getStateHistory("counter");
    expect(history.length).toBe(2);
    expect(history[0].state).toEqual({ count: 1 });
    expect(history[1].state).toEqual({ count: 2 });
    expect(collector.getStateHistory("unknown")).toEqual([]);
  });

  it("bounds state history by maxSnapshots", async () => {
    const store = counterStore();
    const collector = new EventCollector({ maxEvents: 1000, maxSnapshots: 3 });
    collector.connect(store, "counter");

    for (let i = 0; i < 10; i += 1) {
      store.queue(createCommand("inc", undefined));
    }
    await store.flush();

    const history = collector.getStateHistory("counter");
    expect(history).toHaveLength(3);
    expect(history[0].state).toEqual({ count: 8 });
    expect(history[2].state).toEqual({ count: 10 });
  });

  it("respects maxEvents ring buffer and keeps the newest entries", async () => {
    const store = counterStore();
    const collector = new EventCollector({ maxEvents: 5 });
    collector.connect(store, "counter");

    for (let i = 0; i < 10; i += 1) {
      store.queue(createCommand("inc", undefined));
    }
    await store.flush();

    const timeline = collector.getTimeline();
    expect(timeline).toHaveLength(5);

    const seqs = timeline.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(seqs[seqs.length - 1]).toBeGreaterThan(5);
  });

  it("clamps invalid maxEvents and maxSnapshots to at least one", async () => {
    const zeroStore = counterStore();
    const zero = new EventCollector({ maxEvents: 0 });
    zero.connect(zeroStore, "counter");
    zeroStore.queue(createCommand("inc", undefined));
    await zeroStore.flush();
    expect(zero.getTimeline()).toHaveLength(1);

    const negativeStore = counterStore();
    const negative = new EventCollector({ maxEvents: -5, maxSnapshots: Number.NaN });
    negative.connect(negativeStore, "counter");
    negativeStore.queue(createCommand("inc", undefined));
    negativeStore.queue(createCommand("inc", undefined));
    await negativeStore.flush();
    expect(negative.getTimeline()).toHaveLength(1);
    expect(negative.getStateHistory("counter").length).toBeGreaterThanOrEqual(1);
  });

  it("snapshots defensively so later mutation cannot rewrite history", async () => {
    const store = createStore({ items: [] as number[] });
    store.addCommandHandler<number>("add", (ctx, cmd) => {
      ctx.state.items.push(cmd.data);
      ctx.setState({ items: ctx.state.items });
    });

    const collector = new EventCollector();
    collector.connect(store, "list");

    store.queue(createCommand("add", 1));
    await store.flush();
    store.queue(createCommand("add", 2));
    await store.flush();

    const history = collector.getStateHistory("list");
    expect(history).toHaveLength(2);
    expect(history[0].state).toEqual({ items: [1] });
    expect(history[1].state).toEqual({ items: [1, 2] });
  });

  it("aliases live state when snapshotMode is none", async () => {
    const store = createStore({ items: [] as number[] });
    store.addCommandHandler<number>("add", (ctx, cmd) => {
      ctx.state.items.push(cmd.data);
      ctx.setState({ items: ctx.state.items });
    });

    const collector = new EventCollector({ snapshotMode: "none" });
    collector.connect(store, "list");

    store.queue(createCommand("add", 1));
    await store.flush();
    store.queue(createCommand("add", 2));
    await store.flush();

    const history = collector.getStateHistory("list");
    expect(history[0].state).toEqual({ items: [1, 2] });
  });

  it("does not throw on non-cloneable state in structured mode", async () => {
    const store = createStore<{ handler: () => void; count: number }>({
      handler: () => {},
      count: 0,
    });
    store.addCommandHandler("bump", (ctx) => {
      ctx.setState({ handler: ctx.state.handler, count: ctx.state.count + 1 });
    });

    const collector = new EventCollector({ snapshotMode: "structured" });
    collector.connect(store, "fn");

    store.queue(createCommand("bump", undefined));
    await expect(store.flush()).resolves.toBeUndefined();
    expect(collector.getStateHistory("fn")).toHaveLength(1);
  });

  it("gives independently created same-named events distinct eventIds", async () => {
    const first = createEvent<void>("duplicateName");
    const second = createEvent<void>("duplicateName");
    const store = createStore({ n: 0 });

    store.addCommandHandler("emitBoth", (ctx) => {
      ctx.emit(first, undefined);
      ctx.emit(second, undefined);
    });

    const collector = new EventCollector();
    collector.connect(store, "dup");
    store.queue(createCommand("emitBoth", undefined));
    await store.flush();

    const ids = collector
      .getTimeline()
      .filter((e) => e.name === "duplicateName")
      .map((e) => e.eventId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("exposes a version counter and caches timeline identity per version", async () => {
    const store = counterStore();
    const collector = new EventCollector();
    collector.connect(store, "counter");

    expect(collector.getVersion()).toBe(0);

    store.queue(createCommand("inc", undefined));
    await store.flush();

    const versionAfterEvents = collector.getVersion();
    expect(versionAfterEvents).toBeGreaterThan(0);

    const first = collector.getTimeline();
    expect(collector.getTimeline()).toBe(first);
    expect(collector.getStateHistory("counter")).toBe(
      collector.getStateHistory("counter"),
    );

    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(collector.getVersion()).toBeGreaterThan(versionAfterEvents);
    expect(collector.getTimeline()).not.toBe(first);
  });

  it("invokes onEntry once per event with the recorded entry", async () => {
    const store = counterStore();
    const seen: TimelineEntry[] = [];
    const collector = new EventCollector({
      onEntry: (entry) => {
        seen.push(entry);
      },
    });
    collector.connect(store, "counter");

    store.queue(createCommand("inc", undefined));
    await store.flush();

    const timeline = collector.getTimeline();
    expect(seen).toHaveLength(timeline.length);
    expect(seen[0]).toBe(timeline[0]);
  });

  it("routes a throwing onEntry to onError without breaking the store", async () => {
    const store = counterStore();
    const onError = vi.fn();
    const collector = new EventCollector({
      onError,
      onEntry: () => {
        throw new Error("panel exploded");
      },
    });
    collector.connect(store, "counter");

    store.queue(createCommand("inc", undefined));
    await expect(store.flush()).resolves.toBeUndefined();

    expect(store.state).toEqual({ count: 1 });
    expect(onError).toHaveBeenCalled();
    expect(collector.getTimeline().length).toBeGreaterThan(0);
  });

  it("clear resets timeline, state history and chains while bumping version", async () => {
    const store = counterStore();
    const collector = new EventCollector();
    collector.connect(store, "counter");

    store.queue(createCommand("inc", undefined));
    await store.flush();

    const started = collector
      .getTimeline()
      .find((e) => e.name === BuiltinEventName.CommandStarted);
    const rootId = started!.causedBy!;
    expect(collector.getChain(rootId).length).toBeGreaterThan(0);

    const versionBefore = collector.getVersion();
    collector.clear();

    expect(collector.getVersion()).toBeGreaterThan(versionBefore);
    expect(collector.getTimeline()).toEqual([]);
    expect(collector.getStateHistory("counter")).toEqual([]);
    expect(collector.getChain(rootId)).toEqual([]);
    expect(collector.isConnected("counter")).toBe(true);

    store.queue(createCommand("inc", undefined));
    await store.flush();
    expect(collector.getTimeline().length).toBeGreaterThan(0);
  });

  it("destroy disconnects every store, empties history and stops onEntry", async () => {
    const store = counterStore();
    const onEntry = vi.fn();
    const collector = new EventCollector({ onEntry });
    collector.connect(store, "counter");

    store.queue(createCommand("inc", undefined));
    await store.flush();
    expect(onEntry).toHaveBeenCalled();

    collector.destroy();
    onEntry.mockClear();

    expect(collector.getConnectedStores()).toEqual([]);
    expect(collector.getTimeline()).toEqual([]);
    expect(collector.getStateHistory("counter")).toEqual([]);

    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(onEntry).not.toHaveBeenCalled();
    expect(collector.getTimeline()).toEqual([]);
  });

  it("disconnects store and stops collecting", async () => {
    const store = counterStore();
    const collector = new EventCollector({ maxEvents: 1000 });

    collector.connect(store, "counter");
    expect(collector.getConnectedStores()).toEqual(["counter"]);
    collector.disconnect("counter");
    expect(collector.isConnected("counter")).toBe(false);

    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(collector.getTimeline()).toHaveLength(0);
  });

  it("reconnecting the same store name replaces the previous stream", async () => {
    const store = counterStore();
    const collector = new EventCollector();

    collector.connect(store, "counter");
    collector.connect(store, "counter");

    store.queue(createCommand("inc", undefined));
    await store.flush();

    const started = collector
      .getTimeline()
      .filter((e) => e.name === BuiltinEventName.CommandStarted);
    expect(started).toHaveLength(1);
  });
});
