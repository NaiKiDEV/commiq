import { describe, it, expect, vi } from "vitest";
import { createStore, createCommand, createEvent } from "../index";

describe("instrumentation", () => {
  it("emits events with timestamp, correlationId, and causedBy", async () => {
    const listener = vi.fn();
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    store.openStream(listener);
    store.queue(createCommand("inc", undefined));
    await store.flush();

    for (const [event] of listener.mock.calls) {
      expect(event).toHaveProperty("timestamp");
      expect(event).toHaveProperty("correlationId");
      expect(event).toHaveProperty("causedBy");
      expect(typeof event.timestamp).toBe("number");
      expect(typeof event.correlationId).toBe("string");
    }
  });

  it("tracks causality through command → event → cascading command", async () => {
    const userCreated = createEvent<{ name: string }>("userCreated");
    const listener = vi.fn();
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

    store.openStream(listener);
    store.queue(createCommand("createUser", { name: "Alice" }));
    await store.flush();

    const events = listener.mock.calls.map((c) => c[0]);

    const userCreatedEvent = events.find((e) => e.name === "userCreated");
    expect(userCreatedEvent).toBeDefined();

    const commandStartedEvents = events.filter(
      (e) => e.name === "commandStarted",
    );
    expect(commandStartedEvents).toHaveLength(2);

    const greetStarted = commandStartedEvents[1];
    const greetCommand = greetStarted.data.command;

    expect(greetCommand.causedBy).toBe(userCreatedEvent.correlationId);
  });

  it("assigns unique correlationIds to each event", async () => {
    const listener = vi.fn();
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    store.openStream(listener);
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const correlationIds = listener.mock.calls.map((c) => c[0].correlationId);
    const unique = new Set(correlationIds);
    expect(unique.size).toBe(correlationIds.length);
  });

  it("sets timestamps close to current time", async () => {
    const listener = vi.fn();
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    store.openStream(listener);

    const before = Date.now();
    store.queue(createCommand("inc", undefined));
    await store.flush();
    const after = Date.now();

    for (const [event] of listener.mock.calls) {
      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    }
  });

  it("automatically tracks cross-store causality without explicit causedBy", async () => {
    const userCreated = createEvent<{ name: string }>("userCreated");
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    const storeA = createStore({ user: "" });
    const storeB = createStore({ greeting: "" });

    storeA.addCommandHandler<{ name: string }>("createUser", (ctx, cmd) => {
      ctx.setState({ user: cmd.data.name });
      ctx.emit(userCreated, { name: cmd.data.name });
    });
    storeB.addCommandHandler<{ name: string }>("greet", (ctx, cmd) => {
      ctx.setState({ greeting: `Hello ${cmd.data.name}` });
    });

    storeA.openStream(listenerA);
    storeB.openStream(listenerB);

    storeA.openStream((event) => {
      if (event.name === "userCreated") {
        storeB.queue(
          createCommand("greet", { name: (event.data as any).name }),
        );
      }
    });

    storeA.queue(createCommand("createUser", { name: "Alice" }));
    await storeA.flush();
    await storeB.flush();

    const userCreatedEvent = listenerA.mock.calls
      .map((c) => c[0])
      .find((e) => e.name === "userCreated");
    expect(userCreatedEvent).toBeDefined();

    const greetStarted = listenerB.mock.calls
      .map((c) => c[0])
      .find((e) => e.name === "commandStarted");
    expect(greetStarted).toBeDefined();
    expect(greetStarted.data.command.causedBy).toBe(
      userCreatedEvent.correlationId,
    );
  });

  it("preserves explicit causedBy when provided", async () => {
    const userCreated = createEvent<{ name: string }>("userCreated");
    const listenerB = vi.fn();

    const storeA = createStore({ user: "" });
    const storeB = createStore({ greeting: "" });

    storeA.addCommandHandler<{ name: string }>("createUser", (ctx, cmd) => {
      ctx.setState({ user: cmd.data.name });
      ctx.emit(userCreated, { name: cmd.data.name });
    });
    storeB.addCommandHandler<{ name: string }>("greet", (ctx, cmd) => {
      ctx.setState({ greeting: `Hello ${cmd.data.name}` });
    });

    storeB.openStream(listenerB);

    storeA.openStream((event) => {
      if (event.name === "userCreated") {
        storeB.queue(
          createCommand(
            "greet",
            { name: (event.data as any).name },
            { causedBy: "custom-id" },
          ),
        );
      }
    });

    storeA.queue(createCommand("createUser", { name: "Alice" }));
    await storeA.flush();
    await storeB.flush();

    const greetStarted = listenerB.mock.calls
      .map((c) => c[0])
      .find((e) => e.name === "commandStarted");
    expect(greetStarted.data.command.causedBy).toBe("custom-id");
  });

  it("commands queued from outside have causedBy null", async () => {
    const listener = vi.fn();
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    store.openStream(listener);
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const commandStarted = listener.mock.calls.find(
      (c) => c[0].name === "commandStarted",
    );
    expect(commandStarted![0].data.command.causedBy).toBeNull();
  });
});
