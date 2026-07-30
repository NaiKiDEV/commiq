import { describe, it, expect, vi } from "vitest";
import { createStore, createCommand, createEvent } from "@naikidev/commiq";
import { SpanStatusCode } from "@opentelemetry/api";
import { createTraceRegistry } from "../registry";
import { flushMicrotasks, setupOtelHarness } from "./harness";

const harness = setupOtelHarness();

describe("instrumentStore", () => {
  it("creates a span for a command lifecycle", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const uninstrument = harness.instrument(store, { storeName: "counter" });

    store.queue(createCommand("inc", undefined));
    await store.flush();
    uninstrument();

    const commandSpan = harness.spanNamed("commiq.command:inc");
    expect(commandSpan).toBeDefined();
    expect(commandSpan!.status.code).toBe(SpanStatusCode.OK);
    expect(commandSpan!.attributes["commiq.store"]).toBe("counter");
    expect(commandSpan!.attributes["commiq.command.name"]).toBe("inc");
  });

  it("keeps correlation ids off span attributes by default", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    harness.instrument(store, { storeName: "counter" });
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const commandSpan = harness.spanNamed("commiq.command:inc");
    expect(
      commandSpan!.attributes["commiq.command.correlation_id"],
    ).toBeUndefined();

    const correlation = commandSpan!.events.find(
      (event) => event.name === "commiq.correlation",
    );
    expect(correlation).toBeDefined();
    expect(
      correlation!.attributes!["commiq.command.correlation_id"],
    ).toBeDefined();
  });

  it("records correlation ids as attributes when recordCorrelationIds is enabled", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    harness.instrument(store, {
      storeName: "counter",
      recordCorrelationIds: true,
    });
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const commandSpan = harness.spanNamed("commiq.command:inc");
    expect(
      commandSpan!.attributes["commiq.command.correlation_id"],
    ).toBeDefined();
    expect(
      commandSpan!.events.some((event) => event.name === "commiq.correlation"),
    ).toBe(false);
  });

  it("records every stateChanged of a command on the same span", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
      ctx.setState({ count: ctx.state.count + 1 });
    });

    harness.instrument(store, { storeName: "counter" });
    store.queue(createCommand("inc", undefined));
    await store.flush();

    const commandSpans = harness.spansNamed("commiq.command:inc");
    expect(commandSpans).toHaveLength(1);

    const stateChanges = commandSpans[0].events.filter(
      (event) => event.name === "stateChanged",
    );
    expect(stateChanges).toHaveLength(2);
    expect(harness.spansNamed("commiq.event:stateChanged")).toHaveLength(0);
  });

  it("records custom events on the command span without ending it early", async () => {
    const todoAdded = createEvent<{ text: string }>("todoAdded");
    const todoIndexed = createEvent("todoIndexed");
    const store = createStore({ todos: [] as string[] });
    store.addCommandHandler<{ text: string }>("addTodo", (ctx, cmd) => {
      ctx.setState({ todos: [...ctx.state.todos, cmd.data.text] });
      ctx.emit(todoAdded, { text: cmd.data.text });
      ctx.setState({ todos: [...ctx.state.todos] });
      ctx.emit(todoIndexed, undefined);
    });

    harness.instrument(store, { storeName: "todos" });
    store.queue(createCommand("addTodo", { text: "buy milk" }));
    await store.flush();

    const commandSpans = harness.spansNamed("commiq.command:addTodo");
    expect(commandSpans).toHaveLength(1);

    const names = commandSpans[0].events.map((event) => event.name);
    expect(names).toContain("todoAdded");
    expect(names).toContain("todoIndexed");
    expect(names.filter((name) => name === "stateChanged")).toHaveLength(2);
  });

  it("keeps the registry bounded without uninstrument", async () => {
    const ping = createEvent("ping");
    const registry = createTraceRegistry({ maxEntries: 16 });
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
      ctx.emit(ping, undefined);
    });

    const uninstrument = harness.instrument(store, {
      storeName: "counter",
      registry,
    });

    for (let index = 0; index < 60; index += 1) {
      store.queue(createCommand("inc", undefined));
    }
    await store.flush();

    expect(registry.size()).toBeLessThanOrEqual(16);
    expect(harness.spansNamed("commiq.command:inc")).toHaveLength(60);

    const before = harness.spans().length;
    uninstrument();
    expect(harness.spans().length).toBe(before);
  });

  it("sets ERROR status on commandHandlingError", async () => {
    const store = createStore({ count: 0 }, { onError: () => {} });
    store.addCommandHandler("fail", () => {
      throw new TypeError("boom");
    });

    harness.instrument(store, { storeName: "counter" });
    store.queue(createCommand("fail", undefined));
    await store.flush();

    const commandSpan = harness.spanNamed("commiq.command:fail");
    expect(commandSpan!.status.code).toBe(SpanStatusCode.ERROR);

    const exception = commandSpan!.events.find(
      (event) => event.name === "exception",
    );
    expect(exception).toBeDefined();
    expect(exception!.attributes!["exception.type"]).toBe("TypeError");
  });

  it("omits raw error messages from spans by default", async () => {
    const store = createStore({ count: 0 }, { onError: () => {} });
    store.addCommandHandler("register", () => {
      throw new Error("invalid email: user@example.com");
    });

    harness.instrument(store, { storeName: "users" });
    store.queue(createCommand("register", undefined));
    await store.flush();

    const commandSpan = harness.spanNamed("commiq.command:register");
    expect(commandSpan!.status.message).toBe("Error");
    expect(JSON.stringify(commandSpan!.events)).not.toContain(
      "user@example.com",
    );
  });

  it("applies a custom sanitizeError", async () => {
    const store = createStore({ count: 0 }, { onError: () => {} });
    store.addCommandHandler("fail", () => {
      throw new Error("secret detail");
    });

    harness.instrument(store, {
      storeName: "counter",
      sanitizeError: (error) => (error instanceof Error ? "redacted" : "other"),
    });
    store.queue(createCommand("fail", undefined));
    await store.flush();

    const commandSpan = harness.spanNamed("commiq.command:fail");
    expect(commandSpan!.status.message).toBe("redacted");
    expect(JSON.stringify(commandSpan!.events)).not.toContain("secret detail");
  });

  it("falls back to a safe description when sanitizeError throws", async () => {
    const store = createStore({ count: 0 }, { onError: () => {} });
    store.addCommandHandler("fail", () => {
      throw new RangeError("nope");
    });

    harness.instrument(store, {
      storeName: "counter",
      sanitizeError: () => {
        throw new Error("sanitizer exploded");
      },
    });
    store.queue(createCommand("fail", undefined));
    await store.flush();

    const commandSpan = harness.spanNamed("commiq.command:fail");
    expect(commandSpan!.status.message).toBe("RangeError");
  });

  it("ends dangling command spans as abandoned on uninstrument", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("hang", () => new Promise<void>(() => {}));

    const uninstrument = harness.instrument(store, { storeName: "counter" });
    store.queue(createCommand("hang", undefined));
    await flushMicrotasks();

    expect(harness.spanNamed("commiq.command:hang")).toBeUndefined();

    uninstrument();

    const commandSpan = harness.spanNamed("commiq.command:hang");
    expect(commandSpan).toBeDefined();
    expect(commandSpan!.status.code).toBe(SpanStatusCode.ERROR);
    expect(commandSpan!.attributes["commiq.command.abandoned"]).toBe(true);
    expect(commandSpan!.attributes["commiq.command.abandoned_reason"]).toBe(
      "disposed",
    );
    store.destroy();
  });

  it("ends abandoned command spans after maxCommandDurationMs", async () => {
    vi.useFakeTimers();
    try {
      const store = createStore({ count: 0 });
      store.addCommandHandler("hang", () => new Promise<void>(() => {}));

      harness.instrument(store, {
        storeName: "counter",
        maxCommandDurationMs: 1_000,
      });

      store.queue(createCommand("hang", undefined));
      await flushMicrotasks();
      expect(harness.spanNamed("commiq.command:hang")).toBeUndefined();

      vi.advanceTimersByTime(1_500);

      const commandSpan = harness.spanNamed("commiq.command:hang");
      expect(commandSpan).toBeDefined();
      expect(commandSpan!.status.code).toBe(SpanStatusCode.ERROR);
      expect(commandSpan!.attributes["commiq.command.abandoned"]).toBe(true);
      expect(commandSpan!.attributes["commiq.command.abandoned_reason"]).toBe(
        "timeout",
      );
      store.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is idempotent across uninstrument and destroy", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("hang", () => new Promise<void>(() => {}));

    const instrumentation = harness.instrument(store, {
      storeName: "counter",
    });
    store.queue(createCommand("hang", undefined));
    await flushMicrotasks();

    instrumentation();
    const afterFirst = harness.spans().length;
    instrumentation();
    instrumentation.destroy();

    expect(harness.spans().length).toBe(afterFirst);
    expect(harness.spansNamed("commiq.command:hang")).toHaveLength(1);
    store.destroy();
  });

  it("stops recording after uninstrument", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const uninstrument = harness.instrument(store, { storeName: "counter" });
    uninstrument();

    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(harness.spans()).toHaveLength(0);
  });

  it("respects custom tracerName and tracerVersion options", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    harness.instrument(store, {
      storeName: "counter",
      tracerName: "my-app",
      tracerVersion: "9.9.9",
    });

    store.queue(createCommand("inc", undefined));
    await store.flush();

    const commandSpan = harness.spanNamed("commiq.command:inc");
    expect(commandSpan!.instrumentationLibrary.name).toBe("my-app");
    expect(commandSpan!.instrumentationLibrary.version).toBe("9.9.9");
  });

  it("creates an ERROR span for invalid commands (no handler registered)", async () => {
    const store = createStore({ count: 0 });

    harness.instrument(store, { storeName: "counter" });
    store.queue(createCommand("nonexistent", undefined));
    await store.flush();

    const commandSpan = harness.spanNamed("commiq.command:nonexistent");
    expect(commandSpan).toBeDefined();
    expect(commandSpan!.status.code).toBe(SpanStatusCode.ERROR);
    expect(commandSpan!.status.message).toContain("nonexistent");
    expect(commandSpan!.events.some((event) => event.name === "exception")).toBe(
      true,
    );
    expect(commandSpan!.attributes["commiq.store"]).toBe("counter");
  });

  it("marks interrupted commands on their span", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const store = createStore({ count: 0 });
    store.addCommandHandler(
      "search",
      async (ctx) => {
        await gate;
        if (ctx.signal?.aborted === true) return;
        ctx.setState({ count: ctx.state.count + 1 });
      },
      { interruptable: true },
    );

    harness.instrument(store, { storeName: "search" });

    store.queue(createCommand("search", undefined));
    await flushMicrotasks();
    store.queue(createCommand("search", undefined));
    release!();
    await store.flush();

    const interrupted = harness
      .spansNamed("commiq.command:search")
      .find((span) => span.attributes["commiq.command.interrupted"] === true);

    expect(interrupted).toBeDefined();
    expect(interrupted!.attributes["commiq.command.interrupted_phase"]).toBe(
      "running",
    );
    expect(interrupted!.status.message).toBe("interrupted");
  });

  it("records a failing event handler as its own ERROR span", async () => {
    const todoAdded = createEvent("todoAdded");
    const store = createStore({ count: 0 }, { onError: () => {} });
    store.addCommandHandler("addTodo", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
      ctx.emit(todoAdded, undefined);
    });
    store.addEventHandler(todoAdded, () => {
      throw new Error("handler blew up");
    });

    harness.instrument(store, { storeName: "todos" });
    store.queue(createCommand("addTodo", undefined));
    await store.flush();

    const commandSpan = harness.spanNamed("commiq.command:addTodo");
    expect(commandSpan!.status.code).toBe(SpanStatusCode.OK);

    const handlerSpan = harness.spanNamed("commiq.event_handler:todoAdded");
    expect(handlerSpan).toBeDefined();
    expect(handlerSpan!.status.code).toBe(SpanStatusCode.ERROR);
    expect(handlerSpan!.parentSpanId).toBe(commandSpan!.spanContext().spanId);
  });

  it("records unhandledError as a dedicated ERROR span", async () => {
    const store = createStore({ count: 0 }, { onError: () => {} });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    harness.instrument(store, { storeName: "counter" });
    store.openStream(() => {
      throw new Error("listener blew up");
    });

    store.queue(createCommand("inc", undefined));
    await store.flush();

    const errorSpan = harness.spanNamed("commiq.error:streamListener");
    expect(errorSpan).toBeDefined();
    expect(errorSpan!.status.code).toBe(SpanStatusCode.ERROR);
    expect(errorSpan!.attributes["commiq.error.source"]).toBe("streamListener");
  });

  it("creates a standalone span for events with no known cause", async () => {
    const todoAdded = createEvent("todoAdded");
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const store = createStore({ todos: 0 });
    store.addCommandHandler("addTodo", async (ctx) => {
      await gate;
      ctx.emit(todoAdded, undefined);
    });

    store.queue(createCommand("addTodo", undefined));
    await flushMicrotasks();

    harness.instrument(store, { storeName: "todos" });
    release!();
    await store.flush();

    const eventSpan = harness.spanNamed("commiq.event:todoAdded");
    expect(eventSpan).toBeDefined();
    expect(eventSpan!.attributes["commiq.store"]).toBe("todos");
    expect(eventSpan!.parentSpanId).toBeUndefined();
    expect(harness.spanNamed("commiq.command:addTodo")).toBeUndefined();
  });

  it("rejects an empty storeName", () => {
    const store = createStore({ count: 0 });
    expect(() => harness.instrument(store, { storeName: "" })).toThrow(
      /storeName/,
    );
  });
});
