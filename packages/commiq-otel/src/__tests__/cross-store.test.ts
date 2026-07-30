import { describe, it, expect } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  createEventBus,
} from "@naikidev/commiq";
import { createTraceRegistry } from "../registry";
import { setupOtelHarness } from "./harness";

const harness = setupOtelHarness();

describe("cross-store trace propagation", () => {
  it("propagates causality across stores that share a trace registry", async () => {
    const orderValidated = createEvent<{ orderId: string }>("orderValidated");
    const storeA = createStore<{ placed: boolean }>({ placed: false });
    storeA.addCommandHandler("placeOrder", (ctx) => {
      ctx.setState({ placed: true });
      ctx.emit(orderValidated, { orderId: "ORD-1" });
    });

    const storeB = createStore<{ paid: boolean }>({ paid: false });
    storeB.addCommandHandler<{ orderId: string }>("processPayment", (ctx) => {
      ctx.setState({ paid: true });
    });

    const bus = createEventBus();
    bus.connect(storeA);
    bus.connect(storeB);
    bus.on(orderValidated, (event) => {
      storeB.queue(
        createCommand("processPayment", { orderId: event.data.orderId }),
      );
    });

    const registry = createTraceRegistry();
    harness.instrument(storeA, { storeName: "orders", registry });
    harness.instrument(storeB, { storeName: "payments", registry });

    storeA.queue(createCommand("placeOrder", undefined));
    await storeA.flush();
    await storeB.flush();

    const placeOrderSpan = harness.spanNamed("commiq.command:placeOrder");
    const processPaymentSpan = harness.spanNamed(
      "commiq.command:processPayment",
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

  it("keeps a shared registry chain intact across three stores", async () => {
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

    const registry = createTraceRegistry();
    harness.instrument(storeA, { storeName: "A", registry });
    harness.instrument(storeB, { storeName: "B", registry });
    harness.instrument(storeC, { storeName: "C", registry });

    storeA.queue(createCommand("cmdA", undefined));
    await storeA.flush();
    await storeB.flush();
    await storeC.flush();

    const spanA = harness.spanNamed("commiq.command:cmdA")!;
    const spanB = harness.spanNamed("commiq.command:cmdB")!;
    const spanC = harness.spanNamed("commiq.command:cmdC")!;

    expect(spanA).toBeDefined();
    expect(spanB).toBeDefined();
    expect(spanC).toBeDefined();

    const traceId = spanA.spanContext().traceId;
    expect(spanB.spanContext().traceId).toBe(traceId);
    expect(spanC.spanContext().traceId).toBe(traceId);
    expect(spanB.parentSpanId).toBe(spanA.spanContext().spanId);
    expect(spanC.parentSpanId).toBe(spanB.spanContext().spanId);
  });

  it("does not share parents between independent instrumentStore calls", async () => {
    const orderValidated = createEvent<{ orderId: string }>("orderValidated");
    const storeA = createStore<{ placed: boolean }>({ placed: false });
    storeA.addCommandHandler("placeOrder", (ctx) => {
      ctx.setState({ placed: true });
      ctx.emit(orderValidated, { orderId: "ORD-1" });
    });

    const storeB = createStore<{ paid: boolean }>({ paid: false });
    storeB.addCommandHandler<{ orderId: string }>("processPayment", (ctx) => {
      ctx.setState({ paid: true });
    });

    const bus = createEventBus();
    bus.connect(storeA);
    bus.connect(storeB);
    bus.on(orderValidated, (event) => {
      storeB.queue(
        createCommand("processPayment", { orderId: event.data.orderId }),
      );
    });

    harness.instrument(storeA, { storeName: "orders" });
    harness.instrument(storeB, { storeName: "payments" });

    storeA.queue(createCommand("placeOrder", undefined));
    await storeA.flush();
    await storeB.flush();

    const placeOrderSpan = harness.spanNamed("commiq.command:placeOrder")!;
    const processPaymentSpan = harness.spanNamed(
      "commiq.command:processPayment",
    )!;

    expect(processPaymentSpan.parentSpanId).toBeUndefined();
    expect(processPaymentSpan.spanContext().traceId).not.toBe(
      placeOrderSpan.spanContext().traceId,
    );
  });

  it("does not leak parents between unrelated stores that share a registry", async () => {
    const registry = createTraceRegistry();

    const storeA = createStore({ v: 0 });
    storeA.addCommandHandler("slow", async (ctx) => {
      await Promise.resolve();
      ctx.setState({ v: 1 });
    });

    const storeB = createStore({ v: 0 });
    storeB.addCommandHandler("unrelated", (ctx) => {
      ctx.setState({ v: 2 });
    });

    harness.instrument(storeA, { storeName: "A", registry });
    harness.instrument(storeB, { storeName: "B", registry });

    storeA.queue(createCommand("slow", undefined));
    storeB.queue(createCommand("unrelated", undefined));
    await storeA.flush();
    await storeB.flush();

    const slowSpan = harness.spanNamed("commiq.command:slow")!;
    const unrelatedSpan = harness.spanNamed("commiq.command:unrelated")!;

    expect(unrelatedSpan.parentSpanId).toBeUndefined();
    expect(unrelatedSpan.spanContext().traceId).not.toBe(
      slowSpan.spanContext().traceId,
    );
  });
});
