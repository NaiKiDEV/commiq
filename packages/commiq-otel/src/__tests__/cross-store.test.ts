import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  createEventBus,
} from "@naikidev/commiq";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { trace } from "@opentelemetry/api";
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

describe("cross-store trace propagation", () => {
  it("commands triggered via event bus share the same trace", async () => {
    const orderValidated = createEvent<{ orderId: string }>("orderValidated");
    const storeA = createStore<{ placed: boolean }>({ placed: false });
    storeA.addCommandHandler("placeOrder", (ctx) => {
      ctx.setState({ placed: true });
      ctx.emit(orderValidated, { orderId: "ORD-1" });
    });

    const paymentDone = createEvent<{ txId: string }>("paymentDone");
    const storeB = createStore<{ paid: boolean }>({ paid: false });
    storeB.addCommandHandler<{ orderId: string }>("processPayment", (ctx) => {
      ctx.setState({ paid: true });
      ctx.emit(paymentDone, { txId: "TX-1" });
    });

    const bus = createEventBus();
    bus.connect(storeA);
    bus.connect(storeB);
    bus.on(orderValidated, (event) => {
      storeB.queue(
        createCommand("processPayment", { orderId: event.data.orderId }),
      );
    });

    const cleanupA = instrumentStore(storeA, { storeName: "orders" });
    const cleanupB = instrumentStore(storeB, { storeName: "payments" });

    storeA.queue(createCommand("placeOrder", undefined));
    await storeA.flush();
    await storeB.flush();

    cleanupA();
    cleanupB();

    const spans = exporter.getFinishedSpans();
    const placeOrderSpan = spans.find(
      (s) => s.name === "commiq.command:placeOrder",
    );
    const processPaymentSpan = spans.find(
      (s) => s.name === "commiq.command:processPayment",
    );

    expect(placeOrderSpan).toBeDefined();
    expect(processPaymentSpan).toBeDefined();

    expect(processPaymentSpan!.spanContext().traceId).toBe(
      placeOrderSpan!.spanContext().traceId,
    );

    expect(processPaymentSpan!.parentSpanId).toBe(
      placeOrderSpan!.spanContext().spanId,
    );
  });

  it("three-store chain produces a single trace with correct parent hierarchy", async () => {
    const eventAB = createEvent("eventAB");
    const eventBC = createEvent("eventBC");

    const storeA = createStore({ v: 0 });
    storeA.addCommandHandler("cmdA", (ctx) => {
      ctx.setState({ v: 1 });
      ctx.emit(eventAB, undefined);
    });

    const storeB = createStore({ v: 0 });
    storeB.addCommandHandler("cmdB", (ctx) => {
      ctx.setState({ v: 2 });
      ctx.emit(eventBC, undefined);
    });

    const storeC = createStore({ v: 0 });
    storeC.addCommandHandler("cmdC", (ctx) => {
      ctx.setState({ v: 3 });
    });

    const bus = createEventBus();
    bus.connect(storeA);
    bus.connect(storeB);
    bus.connect(storeC);
    bus.on(eventAB, () => storeB.queue(createCommand("cmdB", undefined)));
    bus.on(eventBC, () => storeC.queue(createCommand("cmdC", undefined)));

    const cleanups = [
      instrumentStore(storeA, { storeName: "A" }),
      instrumentStore(storeB, { storeName: "B" }),
      instrumentStore(storeC, { storeName: "C" }),
    ];

    storeA.queue(createCommand("cmdA", undefined));
    await storeA.flush();
    await storeB.flush();
    await storeC.flush();

    cleanups.forEach((fn) => fn());

    const spans = exporter.getFinishedSpans();
    const spanA = spans.find((s) => s.name === "commiq.command:cmdA")!;
    const spanB = spans.find((s) => s.name === "commiq.command:cmdB")!;
    const spanC = spans.find((s) => s.name === "commiq.command:cmdC")!;

    expect(spanA).toBeDefined();
    expect(spanB).toBeDefined();
    expect(spanC).toBeDefined();

    const traceId = spanA.spanContext().traceId;
    expect(spanB.spanContext().traceId).toBe(traceId);
    expect(spanC.spanContext().traceId).toBe(traceId);

    expect(spanB.parentSpanId).toBe(spanA.spanContext().spanId);
    expect(spanC.parentSpanId).toBe(spanB.spanContext().spanId);
  });
});
