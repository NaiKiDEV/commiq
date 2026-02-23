import { describe, it, expect, vi } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  builtinEvents,
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
      .filter((e) => e.id === builtinEvents.stateChanged.id);
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
      .filter((e) => e.id === builtinEvents.invalidCommand.id);
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
      .filter((e) => e.id === builtinEvents.commandHandlingError.id);
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
