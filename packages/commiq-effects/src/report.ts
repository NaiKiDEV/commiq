import type { EffectErrorReport } from "./types";
import { isProductionEnv } from "./env";

type MaybeNamed = { name?: unknown };

function isObjectLike(value: unknown): value is MaybeNamed {
  return typeof value === "object" && value !== null;
}

export function isAbortError(error: unknown): boolean {
  return isObjectLike(error) && error.name === "AbortError";
}

export function defaultEffectErrorReporter(report: EffectErrorReport): void {
  if (isProductionEnv()) return;
  console.error("[commiq-effects]", report);
}
