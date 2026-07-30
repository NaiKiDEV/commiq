import { SpanStatusCode } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";
import type { ErrorSanitizer } from "./types";

export function defaultSanitizeError(error: unknown): string {
  return errorTypeOf(error);
}

export function errorTypeOf(error: unknown): string {
  if (error instanceof Error) {
    return error.name.length > 0 ? error.name : "Error";
  }
  if (error === null) return "null";
  if (typeof error !== "object") return typeof error;
  return Object.prototype.toString.call(error).slice(8, -1);
}

export function describeError(
  error: unknown,
  sanitize: ErrorSanitizer,
): string {
  try {
    const message = sanitize(error);
    return typeof message === "string" ? message : errorTypeOf(error);
  } catch {
    return errorTypeOf(error);
  }
}

export function recordError(
  span: Span,
  error: unknown,
  sanitize: ErrorSanitizer,
): void {
  const message = describeError(error, sanitize);
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.recordException({ name: errorTypeOf(error), message });
}
