import type { ContextExtensionFactory } from "../types";

type InjectorExtProps<Deps extends Record<string, unknown>> = {
  deps: Deps;
};

export function withInjector<S>() {
  return <Deps extends Record<string, unknown>>(
    deps: Deps,
  ): ContextExtensionFactory<
    S,
    InjectorExtProps<Deps>,
    InjectorExtProps<Deps>
  > => {
    const props: InjectorExtProps<Deps> = { deps };

    return () => ({
      command: () => props,
      event: () => props,
    });
  };
}
