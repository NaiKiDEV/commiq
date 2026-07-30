import type {
  Command,
  CommandContext,
  DeepReadonly,
  EventDef,
  StateUpdater,
  StoreEvent,
} from "./types";

export type CommandInvocation<S> = {
  ctx: CommandContext<S>;
  dispose: () => void;
};

export type CommandContextHost<S> = {
  getState: () => DeepReadonly<S>;
  applyState: (next: S) => void;
  publish: (event: StoreEvent) => void;
  createEvent: <D>(eventDef: EventDef<D>, data: D) => StoreEvent<D>;
  reportDisposed: (operation: string, command: Command) => void;
};

function isStateUpdater<S>(next: S | StateUpdater<S>): next is StateUpdater<S> {
  return typeof next === "function";
}

export function createCommandInvocation<S>(
  host: CommandContextHost<S>,
  command: Command,
  signal?: AbortSignal,
): CommandInvocation<S> {
  let isDisposed = false;

  const isUnusable = (operation: string): boolean => {
    if (!isDisposed) return false;
    host.reportDisposed(operation, command);
    return true;
  };

  const ctx: CommandContext<S> = {
    get state(): DeepReadonly<S> {
      return host.getState();
    },
    setState: (next: S | StateUpdater<S>) => {
      if (isUnusable("setState")) return;
      host.applyState(isStateUpdater(next) ? next(host.getState()) : next);
    },
    emit: <D>(eventDef: EventDef<D>, data: D) => {
      if (isUnusable("emit")) return;
      host.publish(host.createEvent(eventDef, data));
    },
    signal,
  };

  return {
    ctx,
    dispose: () => {
      isDisposed = true;
    },
  };
}
