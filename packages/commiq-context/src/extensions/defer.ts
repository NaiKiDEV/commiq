import type { ContextExtensionDef, DeepReadonly } from "@naikidev/commiq";
import type { ExtensionTarget } from "../types";

const SHARED_TARGET_MESSAGE =
  "withDefer(target) is bound to a single store, but this extension is registered on more than one store — create one withDefer(store) per store";

type DeferredFn = () => void | Promise<void>;

type DeferExtProps = {
  defer: (fn: DeferredFn) => void;
};

type DeferState = {
  isDisposed: boolean;
  isShared: boolean;
};

type DeferPhase = {
  open: (isOwner: boolean) => DeferExtProps;
  close: () => Promise<void>;
  reset: () => void;
};

const INERT_PROPS: DeferExtProps = { defer: () => {} };

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

function createPhase(state: DeferState): DeferPhase {
  let open: DeferredFn[] | null = null;

  return {
    open: (isOwner) => {
      if (!isOwner || open !== null) {
        state.isShared = true;
        return INERT_PROPS;
      }
      const callbacks: DeferredFn[] = [];
      open = callbacks;
      return {
        defer: (fn: DeferredFn) => {
          if (state.isDisposed) return;
          callbacks.push(fn);
        },
      };
    },
    close: async () => {
      const callbacks = open ?? [];
      open = null;
      if (state.isShared) throw new Error(SHARED_TARGET_MESSAGE);
      await drain(callbacks);
    },
    reset: () => {
      open = null;
    },
  };
}

export function withDefer<S>(
  target: ExtensionTarget<S>,
): ContextExtensionDef<S, DeferExtProps, DeferExtProps> {
  const state: DeferState = { isDisposed: false, isShared: false };
  const commands = createPhase(state);
  const events = createPhase(state);
  const isOwner = (ctx: { state: DeepReadonly<S> }) =>
    ctx.state === target.state;

  return {
    command: (ctx) => commands.open(isOwner(ctx)),
    event: (ctx) => events.open(isOwner(ctx)),
    afterCommand: () => commands.close(),
    afterEvent: () => events.close(),
    destroy: () => {
      state.isDisposed = true;
      commands.reset();
      events.reset();
    },
  };
}
