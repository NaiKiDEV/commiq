import { afterEach, beforeEach } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { trace } from "@opentelemetry/api";
import type { Streamable } from "@naikidev/commiq";
import { instrumentStore } from "../instrument";
import type { InstrumentOptions, StoreInstrumentation } from "../types";

export type OtelHarness = {
  instrument: (
    store: Streamable,
    options: InstrumentOptions,
  ) => StoreInstrumentation;
  spans: () => ReadableSpan[];
  spanNamed: (name: string) => ReadableSpan | undefined;
  spansNamed: (name: string) => ReadableSpan[];
}

export function setupOtelHarness(): OtelHarness {
  let provider: BasicTracerProvider | null = null;
  let exporter: InMemorySpanExporter | null = null;
  const active: StoreInstrumentation[] = [];

  const currentExporter = (): InMemorySpanExporter => {
    if (!exporter) throw new Error("otel harness is not initialized");
    return exporter;
  };

  beforeEach(() => {
    trace.disable();
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
  });

  afterEach(async () => {
    for (const instrumentation of active.splice(0)) {
      instrumentation.destroy();
    }
    exporter?.reset();
    await provider?.shutdown();
    provider = null;
    exporter = null;
    trace.disable();
  });

  return {
    instrument: (store, options) => {
      const instrumentation = instrumentStore(store, options);
      active.push(instrumentation);
      return instrumentation;
    },
    spans: () => currentExporter().getFinishedSpans(),
    spanNamed: (name) =>
      currentExporter()
        .getFinishedSpans()
        .find((span) => span.name === name),
    spansNamed: (name) =>
      currentExporter()
        .getFinishedSpans()
        .filter((span) => span.name === name),
  };
}

export async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}
