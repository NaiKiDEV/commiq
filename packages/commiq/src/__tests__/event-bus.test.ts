import { describe, it, expect, vi } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  createEventBus,
} from "../index";

describe("createEventBus", () => {
  it("routes events between connected stores", async () => {
    const userCreated = createEvent<{ name: string }>("userCreated");

    const storeA = createStore({ user: "" });
    const storeB = createStore({ greeting: "" });

    storeA.addCommandHandler<{ name: string }>("createUser", (ctx, cmd) => {
      ctx.setState({ user: cmd.data.name });
      ctx.emit(userCreated, { name: cmd.data.name });
    });

    storeB.addCommandHandler<{ name: string }>("greet", (ctx, cmd) => {
      ctx.setState({ greeting: `Hello ${cmd.data.name}` });
    });

    const bus = createEventBus();
    bus.connect(storeA);
    bus.connect(storeB);
    bus.on(userCreated, (event) => {
      storeB.queue(createCommand("greet", { name: event.data.name }));
    });

    storeA.queue(createCommand("createUser", { name: "Alice" }));
    await storeA.flush();
    await storeB.flush();
    expect(storeB.state.greeting).toBe("Hello Alice");
  });

  it("disconnects a store from the bus", async () => {
    const evt = createEvent<undefined>("test");
    const listener = vi.fn();
    const store = createStore({});
    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(evt, undefined);
    });

    const bus = createEventBus();
    bus.connect(store);
    bus.on(evt, listener);
    bus.disconnect(store);

    store.queue(createCommand("fire", undefined));
    await store.flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps delivering when a doubly connected store is disconnected once", async () => {
    const evt = createEvent<undefined>("test");
    const listener = vi.fn();
    const store = createStore({});
    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(evt, undefined);
    });

    const bus = createEventBus();
    bus.on(evt, listener);
    bus.connect(store);
    bus.connect(store);
    bus.disconnect(store);

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(listener).toHaveBeenCalledOnce();

    bus.disconnect(store);
    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(listener).toHaveBeenCalledOnce();
  });

  it("delivers an event once per connected store", async () => {
    const evt = createEvent<undefined>("test");
    const listener = vi.fn();
    const store = createStore({});
    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(evt, undefined);
    });

    const bus = createEventBus();
    bus.on(evt, listener);
    bus.connect(store);
    bus.connect(store);

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(listener).toHaveBeenCalledOnce();
  });

  it("unsubscribes a handler through the return value of on()", async () => {
    const evt = createEvent<undefined>("test");
    const listener = vi.fn();
    const store = createStore({});
    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(evt, undefined);
    });

    const bus = createEventBus();
    bus.connect(store);
    const unsubscribe = bus.on(evt, listener);
    unsubscribe();

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(listener).not.toHaveBeenCalled();
  });

  it("removes a handler through off()", async () => {
    const evt = createEvent<undefined>("test");
    const kept = vi.fn();
    const removed = vi.fn();
    const store = createStore({});
    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(evt, undefined);
    });

    const bus = createEventBus();
    bus.connect(store);
    bus.on(evt, kept);
    bus.on(evt, removed);

    expect(bus.off(evt, removed)).toBe(true);
    expect(bus.off(evt, removed)).toBe(false);

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(kept).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
  });

  it("unsubscribes a store through the return value of connect()", async () => {
    const evt = createEvent<undefined>("test");
    const listener = vi.fn();
    const store = createStore({});
    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(evt, undefined);
    });

    const bus = createEventBus();
    bus.on(evt, listener);
    const disconnect = bus.connect(store);
    disconnect();

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(listener).not.toHaveBeenCalled();
  });

  it("disconnects every store and drops handlers on destroy", async () => {
    const evt = createEvent<undefined>("test");
    const listener = vi.fn();
    const storeA = createStore({});
    const storeB = createStore({});

    for (const store of [storeA, storeB]) {
      store.addCommandHandler("fire", (ctx) => {
        ctx.emit(evt, undefined);
      });
    }

    const bus = createEventBus();
    bus.on(evt, listener);
    bus.connect(storeA);
    bus.connect(storeB);
    bus.destroy();

    storeA.queue(createCommand("fire", undefined));
    storeB.queue(createCommand("fire", undefined));
    await storeA.flush();
    await storeB.flush();

    expect(listener).not.toHaveBeenCalled();
  });
});
