import type { ContextExtensionDef } from "@naikidev/commiq";

type DeferExtProps = {
  defer: (fn: () => void | Promise<void>) => void;
};

export function withDefer<S>(): ContextExtensionDef<S, DeferExtProps> {
  let commandCallbacks: Array<() => void | Promise<void>> = [];
  let eventCallbacks: Array<() => void | Promise<void>> = [];

  return {
    command: () => ({
      defer: (fn: () => void | Promise<void>) => { commandCallbacks.push(fn); },
    }),
    afterCommand: async () => {
      const callbacks = commandCallbacks.splice(0);
      for (const cb of callbacks) {
        try {
          await cb();
        } catch {
          // deferred callback errors are swallowed
        }
      }
    },
    event: () => ({
      defer: (fn: () => void | Promise<void>) => { eventCallbacks.push(fn); },
    }),
    afterEvent: async () => {
      const callbacks = eventCallbacks.splice(0);
      for (const cb of callbacks) {
        try {
          await cb();
        } catch {
          // deferred callback errors are swallowed
        }
      }
    },
  };
}
