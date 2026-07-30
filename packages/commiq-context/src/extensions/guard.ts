import { GuardError } from "../errors";
import type { CheckOptions, ContextExtensionFactory } from "../types";
import { createCheck } from "./check";
import type { CheckFn } from "./check";

type GuardExtProps = {
  guard: CheckFn;
};

export function withGuard<S>(
  options?: CheckOptions,
): ContextExtensionFactory<S, GuardExtProps> {
  const props: GuardExtProps = {
    guard: createCheck(options, (message) => new GuardError(message)),
  };

  return () => ({ command: () => props });
}
