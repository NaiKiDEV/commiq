import { trace } from "@opentelemetry/api";
import type { Tracer } from "@opentelemetry/api";
import { defaultSanitizeError } from "./errors";
import { createTraceRegistry } from "./registry";
import type { ErrorSanitizer, InstrumentOptions, TraceRegistry } from "./types";

const DEFAULT_TRACER_NAME = "commiq";
const DEFAULT_MAX_COMMAND_DURATION_MS = 60_000;
const DEFAULT_MAX_PENDING_COMMANDS = 1_024;

export type InstrumentConfig = {
  storeName: string;
  tracer: Tracer;
  registry: TraceRegistry;
  sanitizeError: ErrorSanitizer;
  recordCorrelationIds: boolean;
  maxCommandDurationMs: number;
  maxPendingCommands: number;
}

export function resolveConfig(options: InstrumentOptions): InstrumentConfig {
  if (typeof options.storeName !== "string" || options.storeName.length === 0) {
    throw new Error(
      "[commiq-otel] instrumentStore requires a non-empty storeName",
    );
  }

  return {
    storeName: options.storeName,
    tracer: trace.getTracer(
      options.tracerName ?? DEFAULT_TRACER_NAME,
      options.tracerVersion,
    ),
    registry: options.registry ?? createTraceRegistry(),
    sanitizeError:
      typeof options.sanitizeError === "function"
        ? options.sanitizeError
        : defaultSanitizeError,
    recordCorrelationIds: options.recordCorrelationIds === true,
    maxCommandDurationMs: normalizeDuration(options.maxCommandDurationMs),
    maxPendingCommands: normalizeCount(
      options.maxPendingCommands,
      DEFAULT_MAX_PENDING_COMMANDS,
    ),
  };
}

function normalizeDuration(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_COMMAND_DURATION_MS;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function normalizeCount(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.floor(value);
}
