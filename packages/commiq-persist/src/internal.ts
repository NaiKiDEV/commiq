import type {
  PersistErrorReport,
  PersistErrorReporter,
  PersistErrorSource,
} from "./types";

type ProcessLike = { env?: { NODE_ENV?: string } };

export type Report = (
  source: PersistErrorSource,
  error: unknown,
  raw?: string,
) => void;

export function isProductionEnv(): boolean {
  const scope = globalThis as { process?: ProcessLike };
  return scope.process?.env?.NODE_ENV === "production";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function defaultReporter(report: PersistErrorReport): void {
  if (isProductionEnv()) return;
  console.error(
    `[commiq-persist] ${report.source} failed for key "${report.key}"`,
    report.error,
  );
}

export function createReporter(
  key: string,
  onError: PersistErrorReporter = defaultReporter,
): Report {
  return (source, error, raw) => {
    try {
      onError({ error, source, key, raw });
    } catch {
      defaultReporter({ error, source, key, raw });
    }
  };
}
