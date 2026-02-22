import { describe, it, expect } from "vitest";
import { createStore, createCommand, createEvent } from "@naikidev/commiq";
import { EventCollector } from "../collector";

describe("EventCollector", () => {
  it("collects events into timeline", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const collector = new EventCollector({ maxEvents: 1000 });
    collector.connect(store, "counter");

    store.queue(createCommand("inc", undefined));
    await store.flush();

    const timeline = collector.getTimeline();
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[0].storeName).toBe("counter");
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
    expect(s1Events.every((e) => e.storeName === "store1")).toBe(true);
    expect(s2Events.every((e) => e.storeName === "store2")).toBe(true);
  });

  it("returns causality chain for a correlationId", async () => {
    const userCreated = createEvent<{ name: string }>("userCreated");
    const store = createStore({ user: "", greeting: "" });

    store.addCommandHandler("createUser", (ctx, cmd) => {
      ctx.setState({ ...ctx.state, user: cmd.data.name });
      ctx.emit(userCreated, { name: cmd.data.name });
    });
    store.addCommandHandler("greet", (ctx, cmd) => {
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
    const firstCommandStarted = timeline.find((e) => e.name === "commandStarted");
    expect(firstCommandStarted).toBeDefined();

    const chain = collector.getChain(firstCommandStarted!.causedBy!);
    expect(chain.length).toBeGreaterThan(0);
  });

  it("tracks state history", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const collector = new EventCollector({ maxEvents: 1000 });
    collector.connect(store, "counter");

    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const history = collector.getStateHistory("counter");
    expect(history.length).toBe(2);
    expect(history[0].state).toEqual({ count: 1 });
    expect(history[1].state).toEqual({ count: 2 });
  });

  it("respects maxEvents ring buffer", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const collector = new EventCollector({ maxEvents: 5 });
    collector.connect(store, "counter");

    for (let i = 0; i < 10; i++) {
      store.queue(createCommand("inc", undefined));
    }
    await store.flush();

    const timeline = collector.getTimeline();
    expect(timeline.length).toBeLessThanOrEqual(5);
  });

  it("disconnects store and stops collecting", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const collector = new EventCollector({ maxEvents: 1000 });
    collector.connect(store, "counter");
    collector.disconnect("counter");

    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(collector.getTimeline()).toHaveLength(0);
  });
});
