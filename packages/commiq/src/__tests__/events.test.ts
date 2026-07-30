import { describe, it, expect, vi } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  matchEvent,
  BuiltinEvent,
} from "../index";
import type { StoreErrorReport } from "../index";

describe("events", () => {
  it("emits custom events from command handler", async () => {
    const userCreated = createEvent<{ name: string }>("userCreated");
    const listener = vi.fn();
    const store = createStore({ user: "" });

    store.addCommandHandler<{ name: string }>("createUser", (ctx, cmd) => {
      ctx.setState({ user: cmd.data.name });
      ctx.emit(userCreated, { name: cmd.data.name });
    });
    store.openStream(listener);
    store.queue(createCommand("createUser", { name: "Alice" }));
    await store.flush();

    const emittedNames = listener.mock.calls.map((c) => c[0].name);
    expect(emittedNames).toContain("userCreated");
  });

  it("handles events with event handlers", async () => {
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

    store.queue(createCommand("createUser", { name: "Alice" }));
    await store.flush();
    expect(store.state.greeting).toBe("Hello Alice");
  });

  it("emits stateChanged builtin event", async () => {
    const listener = vi.fn();
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    store.openStream(listener);
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const stateChanges = listener.mock.calls
      .map((c) => c[0])
      .filter((e) => e.id === BuiltinEvent.StateChanged.id);
    expect(stateChanges).toHaveLength(1);
    expect(stateChanges[0].data).toEqual({
      prev: { count: 0 },
      next: { count: 1 },
    });
  });

  it("emits invalidCommand for unregistered commands", async () => {
    const listener = vi.fn();
    const store = createStore({});
    store.openStream(listener);
    store.queue(createCommand("nonexistent", undefined));
    await store.flush();

    const invalid = listener.mock.calls
      .map((c) => c[0])
      .filter((e) => e.id === BuiltinEvent.InvalidCommand.id);
    expect(invalid).toHaveLength(1);
  });

  it("emits commandHandlingError on handler error", async () => {
    const listener = vi.fn();
    const store = createStore({}, { onError: () => {} });
    store.addCommandHandler("fail", () => {
      throw new Error("oops");
    });
    store.openStream(listener);
    store.queue(createCommand("fail", undefined));
    await store.flush();

    const errors = listener.mock.calls
      .map((c) => c[0])
      .filter((e) => e.id === BuiltinEvent.CommandHandlingError.id);
    expect(errors).toHaveLength(1);
    expect(errors[0].data.error.message).toBe("oops");
  });

  it("closes stream to stop receiving events", async () => {
    const listener = vi.fn();
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    store.openStream(listener);
    store.closeStream(listener);
    store.queue(createCommand("inc", undefined));
    await store.flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it("routes a throwing event handler to eventHandlingError and keeps commandHandled", async () => {
    const testEvent = createEvent("test");
    const handlerCalls: string[] = [];
    const reported: StoreErrorReport[] = [];

    const store = createStore(
      { count: 0 },
      { onError: (report) => reported.push(report) },
    );
    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(testEvent, undefined);
    });
    store.addEventHandler(testEvent, () => {
      handlerCalls.push("first");
      throw new Error("handler error");
    });
    store.addEventHandler(testEvent, () => {
      handlerCalls.push("second");
    });

    const eventErrors: unknown[] = [];
    const commandErrors: unknown[] = [];
    const names: string[] = [];
    store.openStream((event) => {
      names.push(event.name);
      if (matchEvent(event, BuiltinEvent.EventHandlingError)) {
        eventErrors.push(event.data.error);
      }
      if (matchEvent(event, BuiltinEvent.CommandHandlingError)) {
        commandErrors.push(event.data.error);
      }
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(handlerCalls).toEqual(["first", "second"]);
    expect(eventErrors).toHaveLength(1);
    expect((eventErrors[0] as Error).message).toBe("handler error");
    expect(commandErrors).toEqual([]);
    expect(names).toContain("commandHandled");
    expect(reported.map((r) => r.source)).toEqual(["eventHandler"]);
  });

  it("reports the error and keeps processing when a builtin event handler throws", async () => {
    const reported: StoreErrorReport[] = [];
    const store = createStore(
      { values: [] as string[] },
      { onError: (report) => reported.push(report) },
    );

    store.addEventHandler(BuiltinEvent.CommandStarted, () => {
      throw new Error("commandStarted handler blew up");
    });

    store.addCommandHandler<string>("append", (ctx, cmd) => {
      ctx.setState({ values: [...ctx.state.values, cmd.data] });
    });

    store.queue(createCommand("append", "a"));
    store.queue(createCommand("append", "b"));
    await store.flush();

    expect(store.state.values).toEqual(["a", "b"]);
    expect(reported).toHaveLength(2);
    expect(reported[0].source).toBe("eventHandler");
    expect(reported[0].event?.name).toBe("commandStarted");
    expect((reported[0].error as Error).message).toBe(
      "commandStarted handler blew up",
    );
  });

  it("reports the error and resolves flush when an error event handler throws", async () => {
    const reported: StoreErrorReport[] = [];
    const store = createStore(
      { count: 0 },
      { onError: (report) => reported.push(report) },
    );

    store.addCommandHandler("fail", () => {
      throw new Error("command error");
    });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    store.addEventHandler(BuiltinEvent.CommandHandlingError, () => {
      throw new Error("error handler also blew up");
    });

    store.queue(createCommand("fail", undefined));
    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(store.state.count).toBe(1);
    const messages = reported.map((r) => (r.error as Error).message);
    expect(messages).toContain("command error");
    expect(messages).toContain("error handler also blew up");
  });

  it("does not recurse when an eventHandlingError handler throws", async () => {
    const testEvent = createEvent("test");
    const reported: StoreErrorReport[] = [];
    const store = createStore(
      { count: 0 },
      { onError: (report) => reported.push(report) },
    );

    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(testEvent, undefined);
    });
    store.addEventHandler(testEvent, () => {
      throw new Error("first failure");
    });
    store.addEventHandler(BuiltinEvent.EventHandlingError, () => {
      throw new Error("reporter failure");
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(reported).toHaveLength(2);
    expect((reported[1].error as Error).message).toBe("reporter failure");
  });

  it("emits auto-notify event when notify option is true", async () => {
    const listener = vi.fn();
    const store = createStore({ count: 0 });
    store.addCommandHandler(
      "inc",
      (ctx) => {
        ctx.setState({ count: ctx.state.count + 1 });
      },
      { notify: true },
    );
    store.openStream(listener);
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const notifyEvents = listener.mock.calls
      .map((c) => c[0])
      .filter((e) => e.name === "inc:handled");
    expect(notifyEvents).toHaveLength(1);
  });
});
