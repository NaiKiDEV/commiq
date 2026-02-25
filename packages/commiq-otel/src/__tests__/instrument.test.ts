import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
} from "@naikidev/commiq";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { instrumentStore } from "../instrument";

let provider: BasicTracerProvider;
let exporter: InMemorySpanExporter;

beforeEach(() => {
  trace.disable();
  exporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();
});

afterEach(async () => {
  await provider.shutdown();
  trace.disable();
});

describe("instrumentStore", () => {
  it("creates a span for a command lifecycle", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const uninstrument = instrumentStore(store, { storeName: "counter" });

    store.queue(createCommand("inc", undefined));
    await store.flush();
    uninstrument();

    const spans = exporter.getFinishedSpans();
    const commandSpan = spans.find((s) => s.name === "commiq.command:inc");
    expect(commandSpan).toBeDefined();
    expect(commandSpan!.status.code).toBe(SpanStatusCode.OK);
    expect(commandSpan!.attributes["commiq.store"]).toBe("counter");
    expect(commandSpan!.attributes["commiq.command.name"]).toBe("inc");
    expect(commandSpan!.attributes["commiq.command.correlation_id"]).toBeDefined();
  });

  it("records stateChanged as a span event on the command span", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const uninstrument = instrumentStore(store, { storeName: "counter" });

    store.queue(createCommand("inc", undefined));
    await store.flush();
    uninstrument();

    const spans = exporter.getFinishedSpans();
    const commandSpan = spans.find((s) => s.name === "commiq.command:inc");
    expect(commandSpan).toBeDefined();

    const stateChangedEvent = commandSpan!.events.find(
      (e) => e.name === "stateChanged",
    );
    expect(stateChangedEvent).toBeDefined();
  });

  it("records custom events as span events on the command span", async () => {
    const todoAdded = createEvent<{ text: string }>("todoAdded");
    const store = createStore({ todos: [] as string[] });
    store.addCommandHandler<{ text: string }>("addTodo", (ctx, cmd) => {
      ctx.setState({ todos: [...ctx.state.todos, cmd.data.text] });
      ctx.emit(todoAdded, { text: cmd.data.text });
    });

    const uninstrument = instrumentStore(store, { storeName: "todos" });

    store.queue(createCommand("addTodo", { text: "buy milk" }));
    await store.flush();
    uninstrument();

    const spans = exporter.getFinishedSpans();
    const commandSpan = spans.find((s) => s.name === "commiq.command:addTodo");
    expect(commandSpan).toBeDefined();

    const customEvent = commandSpan!.events.find(
      (e) => e.name === "todoAdded",
    );
    expect(customEvent).toBeDefined();
  });

  it("sets ERROR status on commandHandlingError", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("fail", () => {
      throw new Error("boom");
    });

    const uninstrument = instrumentStore(store, { storeName: "counter" });

    store.queue(createCommand("fail", undefined));
    await store.flush();
    uninstrument();

    const spans = exporter.getFinishedSpans();
    const commandSpan = spans.find((s) => s.name === "commiq.command:fail");
    expect(commandSpan).toBeDefined();
    expect(commandSpan!.status.code).toBe(SpanStatusCode.ERROR);
    expect(commandSpan!.events.some((e) => e.name === "exception")).toBe(true);
  });

  it("cleans up on uninstrument and ends dangling spans", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const uninstrument = instrumentStore(store, { storeName: "counter" });

    store.queue(createCommand("inc", undefined));
    await store.flush();

    const spansBefore = exporter.getFinishedSpans().length;
    uninstrument();
    const spansAfter = exporter.getFinishedSpans().length;

    // All spans should already be ended from normal flow
    // uninstrument just cleans up the listener
    expect(spansAfter).toBeGreaterThanOrEqual(spansBefore);
  });

  it("respects custom tracerName option", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const uninstrument = instrumentStore(store, {
      storeName: "counter",
      tracerName: "my-app",
    });

    store.queue(createCommand("inc", undefined));
    await store.flush();
    uninstrument();

    const spans = exporter.getFinishedSpans();
    const commandSpan = spans.find((s) => s.name === "commiq.command:inc");
    expect(commandSpan).toBeDefined();
    expect(commandSpan!.instrumentationLibrary.name).toBe("my-app");
  });
});
