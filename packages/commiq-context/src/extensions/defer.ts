import type { ContextExtensionDef } from "@naikidev/commiq";

type DeferredFn = () => void | Promise<void>;

type DeferExtProps = {
  defer: (fn: DeferredFn) => void;
};

type DeferPhase = {
  open: () => DeferExtProps;
  close: () => Promise<void>;
  reset: () => void;
};

async function drain(callbacks: ReadonlyArray<DeferredFn>): Promise<void> {
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

function createPhase(isDisposed: () => boolean): DeferPhase {
  const open: DeferredFn[][] = [];

  return {
    open: () => {
      const callbacks: DeferredFn[] = [];
      open.push(callbacks);
      return {
        defer: (fn: DeferredFn) => {
          if (isDisposed()) return;
          callbacks.push(fn);
        },
      };
    },
    close: () => drain(open.pop() ?? []),
    reset: () => {
      open.length = 0;
    },
  };
}

export function withDefer<S>(): ContextExtensionDef<
  S,
  DeferExtProps,
  DeferExtProps
> {
  let isDisposed = false;
  const checkDisposed = () => isDisposed;
  const commands = createPhase(checkDisposed);
  const events = createPhase(checkDisposed);

  return {
    command: () => commands.open(),
    event: () => events.open(),
    afterCommand: () => commands.close(),
    afterEvent: () => events.close(),
    destroy: () => {
      isDisposed = true;
      commands.reset();
      events.reset();
    },
  };
}
