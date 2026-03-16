import type { ContextExtensionDef } from "@naikidev/commiq";

type GuardExtProps = {
  guard: (condition: boolean, message: string) => void;
};

export function withGuard<S>(): ContextExtensionDef<S, GuardExtProps> {
  return {
    command: () => ({
      guard: (condition: boolean, message: string) => {
        if (!condition) {
          throw new Error(message);
        }
      },
    }),
  };
}
