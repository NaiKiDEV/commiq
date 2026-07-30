import type { DeepReadonly } from "@naikidev/commiq";
import type { ContextExtensionFactory } from "../types";

type PatchExtProps<S> = {
  patch: (partial: Partial<S>) => void;
};

function mergeState<S extends Record<string, unknown>>(
  prev: DeepReadonly<S>,
  partial: Partial<S>,
): S {
  return { ...prev, ...partial } as S;
}

export function withPatch<S extends Record<string, unknown>>(): ContextExtensionFactory<
  S,
  PatchExtProps<S>
> {
  return () => ({
    command: (ctx) => ({
      patch: (partial: Partial<S>) =>
        ctx.setState((prev) => mergeState(prev, partial)),
    }),
  });
}
