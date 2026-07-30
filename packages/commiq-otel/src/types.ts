import type { SpanContext } from "@opentelemetry/api";
import type { Disposable as CommiqDisposable } from "@naikidev/commiq";

export type TraceLink = {
  spanContext: SpanContext;
  commandId: string | null;
}

export type TraceRegistry = {
  link: (correlationId: string, link: TraceLink) => void;
  resolve: (correlationId: string) => TraceLink | undefined;
  size: () => number;
  clear: () => void;
}

export type TraceRegistryOptions = {
  maxEntries?: number;
}

export type ErrorSanitizer = (error: unknown) => string;

export type InstrumentOptions = {
  storeName: string;
  tracerName?: string;
  tracerVersion?: string;
  registry?: TraceRegistry;
  maxCommandDurationMs?: number;
  maxPendingCommands?: number;
  recordCorrelationIds?: boolean;
  sanitizeError?: ErrorSanitizer;
}

export type StoreInstrumentation = (() => void) & CommiqDisposable;
