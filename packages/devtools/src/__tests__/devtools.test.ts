import { describe, it, expect, vi } from "vitest";
import { createStore, createCommand } from "@naikidev/commiq";
import { createDevtools } from "../devtools";
import { memoryTransport } from "../transport";

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

    devtools.destroy();
  });

  it("sends EVENT messages for store events", async () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    devtools.connect(store, "counter");
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const eventMessages = transport.messages.filter((m) => m.type === "EVENT");
    expect(eventMessages.length).toBeGreaterThan(0);

    devtools.destroy();
  });

  it("sends STORE_DISCONNECTED on disconnect", () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const store = createStore({ count: 0 });

    devtools.connect(store, "counter");
    devtools.disconnect("counter");

    const disconnectMsg = transport.messages.find((m) => m.type === "STORE_DISCONNECTED");
    expect(disconnectMsg).toEqual({
      type: "STORE_DISCONNECTED",
      storeName: "counter",
    });

    devtools.destroy();
  });

  it("exposes collector query methods", async () => {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport });
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    devtools.connect(store, "counter");
    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(devtools.getTimeline().length).toBeGreaterThan(0);
    expect(devtools.getStateHistory("counter").length).toBe(1);

    devtools.destroy();
  });

  it("logs to console when logToConsole is true", async () => {
    const transport = memoryTransport();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const devtools = createDevtools({ transport, logToConsole: true });
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

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
  });
});
