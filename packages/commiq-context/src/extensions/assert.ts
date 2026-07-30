import type { ContextExtensionDef } from "@naikidev/commiq";
import { AssertionError } from "../errors";
import type { CheckOptions } from "../types";
import { createCheck } from "./check";
import type { CheckFn } from "./check";

type AssertExtProps = {
  assert: CheckFn;
};

export function withAssert<S>(
  options?: CheckOptions,
): ContextExtensionDef<S, AssertExtProps, AssertExtProps> {
  const props: AssertExtProps = {
    assert: createCheck(options, (message) => new AssertionError(message)),
  };

  return { command: () => props, event: () => props };
}
