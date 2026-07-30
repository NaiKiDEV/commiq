import type { StreamListener } from "@naikidev/commiq";

type ErrorReporterGlobal = {
  reportError?: (error: unknown) => void;
}

export function rethrowAsync(error: unknown): void {
  const host = globalThis as ErrorReporterGlobal;
  if (typeof host.reportError === "function") {
    host.reportError(error);
    return;
  }
  queueMicrotask(() => {
    throw error;
  });
}

export function isolate(listener: StreamListener): StreamListener {
  return (event) => {
    try {
      listener(event);
    } catch (error) {
      rethrowAsync(error);
    }
  };
}
