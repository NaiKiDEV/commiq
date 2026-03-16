import type { ContextExtensionDef } from "@naikidev/commiq";

type PatchExtProps<S> = {
  patch: (partial: Partial<S>) => void;
};

export function withPatch<S extends Record<string, unknown>>(): ContextExtensionDef<S, PatchExtProps<S>> {
  return {
    command: (ctx) => ({
      patch: (partial: Partial<S>) => ctx.setState({ ...ctx.state, ...partial }),
    }),
  };
}
