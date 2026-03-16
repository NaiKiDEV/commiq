import type { ContextExtensionDef } from "@naikidev/commiq";

type AssertOptions = {
  enabled?: boolean;
};

type AssertExtProps = {
  assert: (condition: boolean, message: string) => void;
};

export function withAssert<S>(options?: AssertOptions): ContextExtensionDef<S, AssertExtProps> {
  const enabled = options?.enabled ?? true;

  return {
    command: () => ({
      assert: (condition: boolean, message: string) => {
        if (enabled && !condition) {
          throw new Error(`Assertion failed: ${message}`);
        }
      },
    }),
    event: () => ({
      assert: (condition: boolean, message: string) => {
        if (enabled && !condition) {
          throw new Error(`Assertion failed: ${message}`);
        }
      },
    }),
  };
}
