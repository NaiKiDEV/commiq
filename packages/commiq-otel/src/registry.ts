import type { TraceLink, TraceRegistry, TraceRegistryOptions } from "./types";

const DEFAULT_MAX_ENTRIES = 512;

export function createTraceRegistry(
  options: TraceRegistryOptions = {},
): TraceRegistry {
  const maxEntries = normalizeMaxEntries(options.maxEntries);
  const entries = new Map<string, TraceLink>();

  const evictOverflow = (): void => {
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done) return;
      entries.delete(oldest.value);
    }
  };

  return {
    link: (correlationId: string, link: TraceLink): void => {
      if (correlationId.length === 0) return;
      entries.delete(correlationId);
      entries.set(correlationId, link);
      evictOverflow();
    },
    resolve: (correlationId: string): TraceLink | undefined =>
      entries.get(correlationId),
    size: (): number => entries.size,
    clear: (): void => entries.clear(),
  };
}

function normalizeMaxEntries(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return DEFAULT_MAX_ENTRIES;
  }
  return Math.floor(value);
}
