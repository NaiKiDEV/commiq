import { describe, it, expect, vi } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  BuiltinEvent,
} from "../index";

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
    const store = createStore({});
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

  it("runs all event handlers even when one throws", async () => {
    const testEvent = createEvent("test");
    const handlerCalls: string[] = [];

    const store = createStore({ count: 0 });
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

    const errors: unknown[] = [];
    store.openStream((event) => {
      if (event.id === BuiltinEvent.CommandHandlingError.id) {
        errors.push((event.data as { error: unknown }).error);
      }
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(handlerCalls).toEqual(["first", "second"]);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("handler error");
  });

  it("queue continues processing after event handler error on builtin event", async () => {
    const store = createStore({ values: [] as string[] });

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
  });

  it("flush resolves even when error event handler throws", async () => {
    const store = createStore({ count: 0 });

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
