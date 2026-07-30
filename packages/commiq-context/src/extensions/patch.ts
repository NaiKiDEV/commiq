import type { ContextExtensionDef, DeepReadonly } from "@naikidev/commiq";

type PatchExtProps<S> = {
  patch: (partial: Partial<S>) => void;
};

function mergeState<S extends Record<string, unknown>>(
  prev: DeepReadonly<S>,
  partial: Partial<S>,
): S {
  return { ...prev, ...partial } as S;
}

export function withPatch<
  S extends Record<string, unknown>,
>(): ContextExtensionDef<S, PatchExtProps<S>> {
  return {
    command: (ctx) => ({
      patch: (partial: Partial<S>) =>
        ctx.setState((prev) => mergeState(prev, partial)),
    }),
  };
}
