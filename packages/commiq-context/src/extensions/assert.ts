import { AssertionError } from "../errors";
import type { CheckOptions, ContextExtensionFactory } from "../types";
import { createCheck } from "./check";
import type { CheckFn } from "./check";

type AssertExtProps = {
  assert: CheckFn;
};

export function withAssert<S>(
  options?: CheckOptions,
): ContextExtensionFactory<S, AssertExtProps, AssertExtProps> {
  const props: AssertExtProps = {
    assert: createCheck(options, (message) => new AssertionError(message)),
  };

  return () => ({ command: () => props, event: () => props });
}
