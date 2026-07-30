import type { CheckOptions } from "../types";

export type CheckFn = (condition: boolean, message: string) => void;

export function createCheck(
  options: CheckOptions | undefined,
  createError: (message: string) => Error,
): CheckFn {
  const enabled = options?.enabled ?? true;

  return (condition, message) => {
    if (!enabled || condition) return;
    throw createError(message);
  };
}
