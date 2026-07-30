import { describe, it, expect, vi } from "vitest";
import { BuiltinEventName, createStore, createCommand } from "@naikidev/commiq";
import { createDevtools } from "../devtools";
import { memoryTransport } from "../transport";
import type { DevtoolsMessage, DevtoolsStore, Transport } from "../types";

function counterStore() {
  const store = createStore({ count: 0 });
  store.addCommandHandler("inc", (ctx) => {
    ctx.setState({ count: ctx.state.count + 1 });
  });
  return store;
}

function cloningTransport(): Transport & { messages: DevtoolsMessage[] } {
  const messages: DevtoolsMessage[] = [];
  return {
    messages,
    send(message: DevtoolsMessage): void {
      messages.push(structuredClone(message));
    },
    onMessage(): () => void {
      return () => {};
    },
    destroy(): void {},
  };
}

describe("createDevtools", () => {
  it("connects store and sends STORE_CONNECTED message", () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const store = createStore({ count: 0 });

    devtools.connect(store, "counter");

    expect(transport.messages).toHaveLength(1);
    expect(transport.messages[0]).toEqual({
      type: "STORE_CONNECTED",
      storeName: "counter",
      initialState: { count: 0 },
    });
    expect(devtools.getConnectedStores()).toEqual(["counter"]);

    devtools.destroy();
  });

  it("snapshots initial state so later mutation cannot rewrite it", () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const live = { items: [] as number[] };
    const store: DevtoolsStore = {
      get state(): unknown {
        return live;
      },
      openStream(): void {},
      closeStream(): void {},
    };

    devtools.connect(store, "list");
    live.items.push(1);

    expect(transport.messages[0]).toEqual({
      type: "STORE_CONNECTED",
      storeName: "list",
      initialState: { items: [] },
    });

    devtools.destroy();
  });

  it("sends exactly one EVENT message per collected entry", async () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const store = counterStore();

    devtools.connect(store, "counter");
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const eventMessages = transport.messages.filter((m) => m.type === "EVENT");
    const timeline = devtools.getTimeline();
    expect(timeline.length).toBeGreaterThanOrEqual(3);
    expect(eventMessages).toHaveLength(timeline.length);
    expect(eventMessages.map((m) => m.type === "EVENT" && m.entry.seq)).toEqual(
      timeline.map((e) => e.seq),
    );

    devtools.destroy();
  });

  it("sends STORE_DISCONNECTED on disconnect and ignores unknown stores", () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const store = createStore({ count: 0 });

    devtools.connect(store, "counter");
    devtools.disconnect("counter");
    devtools.disconnect("counter");

    const disconnects = transport.messages.filter((m) => m.type === "STORE_DISCONNECTED");
    expect(disconnects).toEqual([{ type: "STORE_DISCONNECTED", storeName: "counter" }]);
    expect(devtools.getConnectedStores()).toEqual([]);

    devtools.destroy();
  });

  it("exposes collector query methods", async () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const store = counterStore();

    devtools.connect(store, "counter");
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const timeline = devtools.getTimeline();
    expect(timeline.length).toBeGreaterThanOrEqual(3);
    expect(devtools.getStateHistory("counter")).toHaveLength(1);

    const started = timeline.find((e) => e.name === BuiltinEventName.CommandStarted);
    expect(devtools.getChain(started!.causedBy!)).toHaveLength(timeline.length);

    devtools.destroy();
  });

  it("exposes a version counter that changes only when entries are recorded", async () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const store = counterStore();

    devtools.connect(store, "counter");
    const before = devtools.getVersion();
    const cached = devtools.getTimeline();
    expect(devtools.getTimeline()).toBe(cached);

    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(devtools.getVersion()).toBeGreaterThan(before);
    expect(devtools.getTimeline()).not.toBe(cached);

    devtools.destroy();
  });

  it("clear resets collected data and broadcasts CLEARED without dropping connections", async () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const store = counterStore();

    devtools.connect(store, "counter");
    store.queue(createCommand("inc", undefined));
    await store.flush();
    expect(devtools.getTimeline().length).toBeGreaterThan(0);

    devtools.clear();

    expect(transport.messages.some((m) => m.type === "CLEARED")).toBe(true);
    expect(devtools.getTimeline()).toEqual([]);
    expect(devtools.getStateHistory("counter")).toEqual([]);
    expect(devtools.getConnectedStores()).toEqual(["counter"]);

    store.queue(createCommand("inc", undefined));
    await store.flush();
    expect(devtools.getTimeline().length).toBeGreaterThan(0);

    devtools.destroy();
  });

  it("honours maxEvents", async () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport, maxEvents: 2 });
    const store = counterStore();

    devtools.connect(store, "counter");
    for (let i = 0; i < 5; i += 1) {
      store.queue(createCommand("inc", undefined));
    }
    await store.flush();

    expect(devtools.getTimeline()).toHaveLength(2);
    devtools.destroy();
  });

  it("logs to console when logToConsole is true", async () => {
    const transport = memoryTransport();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const devtools = createDevtools({ transport, logToConsole: true });
    const store = counterStore();

    devtools.connect(store, "counter");
    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
    devtools.destroy();
  });

  it("destroy disconnects all stores and cleans transport", () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const store1 = createStore({ a: 0 });
    const store2 = createStore({ b: 0 });

    devtools.connect(store1, "s1");
    devtools.connect(store2, "s2");
    devtools.destroy();

    const disconnects = transport.messages.filter((m) => m.type === "STORE_DISCONNECTED");
    expect(disconnects).toHaveLength(2);
    expect(devtools.getConnectedStores()).toEqual([]);
    expect(devtools.getTimeline()).toEqual([]);
  });

  it("stops collecting after destroy", async () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const store = counterStore();

    devtools.connect(store, "counter");
    devtools.destroy();
    const messageCount = transport.messages.length;

    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(transport.messages).toHaveLength(messageCount);
    expect(devtools.getTimeline()).toEqual([]);
  });

  it("degrades non-cloneable payloads instead of throwing into the store", async () => {
    const transport = cloningTransport();
    const onError = vi.fn();
    const devtools = createDevtools({ transport, onError });
    const store = createStore<{ onDone: () => void; count: number }>({
      onDone: () => {},
      count: 0,
    });
    store.addCommandHandler("bump", (ctx) => {
      ctx.setState({ onDone: ctx.state.onDone, count: ctx.state.count + 1 });
    });

    devtools.connect(store, "fn");
    store.queue(createCommand("bump", undefined));

    await expect(store.flush()).resolves.toBeUndefined();
    expect(store.state.count).toBe(1);
    expect(onError).toHaveBeenCalled();

    const stateChanged = transport.messages.find(
      (m) => m.type === "EVENT" && m.entry.name === BuiltinEventName.StateChanged,
    );
    expect(stateChanged).toBeDefined();
    expect(stateChanged?.type === "EVENT" && stateChanged.entry.stateAfter).toEqual({
      onDone: "[Function onDone]",
      count: 1,
    });

    devtools.destroy();
  });
});
