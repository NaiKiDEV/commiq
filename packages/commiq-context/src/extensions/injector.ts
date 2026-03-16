import type { ContextExtensionDef } from "@naikidev/commiq";

type InjectorExtProps<Deps extends Record<string, unknown>> = {
  deps: Deps;
};

export function withInjector<S>() {
  return <Deps extends Record<string, unknown>>(
    deps: Deps,
  ): ContextExtensionDef<S, InjectorExtProps<Deps>> => ({
    command: () => ({ deps }),
    event: () => ({ deps }),
  });
}
