import type { ContextExtensionFactory } from "../types";

type DeferredFn = () => void | Promise<void>;

type DeferExtProps = {
  defer: (fn: DeferredFn) => void;
};

async function drain(queue: DeferredFn[]): Promise<void> {
  const callbacks = queue.splice(0);
  const errors: unknown[] = [];

  for (const callback of callbacks) {
    try {
      await callback();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) throw errors[0];
}

export function withDefer<S>(): ContextExtensionFactory<
  S,
  DeferExtProps,
  DeferExtProps
> {
  return () => {
    const commandCallbacks: DeferredFn[] = [];
    const eventCallbacks: DeferredFn[] = [];
    let isDisposed = false;

    const collector = (queue: DeferredFn[]): DeferExtProps => ({
      defer: (fn: DeferredFn) => {
        if (isDisposed) return;
        queue.push(fn);
      },
    });

    const commandProps = collector(commandCallbacks);
    const eventProps = collector(eventCallbacks);

    return {
      command: () => commandProps,
      event: () => eventProps,
      afterCommand: () => drain(commandCallbacks),
      afterEvent: () => drain(eventCallbacks),
      destroy: () => {
        isDisposed = true;
        commandCallbacks.length = 0;
        eventCallbacks.length = 0;
      },
    };
  };
}
