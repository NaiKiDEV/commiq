import { matchEvent } from "@naikidev/commiq";
import type {
  Command,
  CommandHandle,
  EventDef,
  QueueFn,
  SealedStore,
  StoreEvent,
} from "@naikidev/commiq";
import type {
  EffectConcurrencyMode,
  EffectContext,
  EffectErrorReport,
  EffectErrorReporter,
  EffectHandler,
  EffectOptions,
} from "./types";
import { defaultEffectErrorReporter, isAbortError } from "./report";
import { discardedHandle, toCommand, type QueueTarget } from "./handle";

export type Registration<S> = {
  eventId: symbol;
  eventName: string;
  invoke: (event: StoreEvent, ctx: EffectContext<S>) => void | Promise<void>;
  cancelOnId: symbol | undefined;
  mode: EffectConcurrencyMode;
  debounceMs: number;
  onError: EffectErrorReporter | undefined;
  controllers: Set<AbortController>;
  timer: ReturnType<typeof setTimeout> | undefined;
  tail: Promise<void> | undefined;
  disposed: boolean;
};

export type EffectsRuntime<S> = {
  store: SealedStore<S>;
  registrations: Set<Registration<S>>;
  fallbackReporter: EffectErrorReporter | undefined;
  destroyed: boolean;
};

type DropSource = "destroyedEffects" | "abortedDispatch";

const DROP_REASON: Record<DropSource, string> = {
  destroyedEffects: "the effects instance was destroyed",
  abortedDispatch: "the effect run was cancelled",
};

export function resolveMode(
  options: EffectOptions | undefined,
): EffectConcurrencyMode {
  if (options?.mode !== undefined) return options.mode;
  return options?.restartOnNew === true ? "switch" : "parallel";
}

export function reportError<S>(
  runtime: EffectsRuntime<S>,
  reg: Registration<S> | undefined,
  report: EffectErrorReport,
): void {
  const reporter =
    reg?.onError ?? runtime.fallbackReporter ?? defaultEffectErrorReporter;
  reporter(report);
}

export function clearDebounce<S>(reg: Registration<S>): void {
  if (reg.timer === undefined) return;
  clearTimeout(reg.timer);
  reg.timer = undefined;
}

export function abortRuns<S>(reg: Registration<S>): void {
  for (const controller of reg.controllers) {
    controller.abort();
  }
}

export function cancelRegistration<S>(reg: Registration<S>): void {
  clearDebounce(reg);
  abortRuns(reg);
}

export function disposeRegistration<S>(
  runtime: EffectsRuntime<S>,
  reg: Registration<S>,
): void {
  reg.disposed = true;
  cancelRegistration(reg);
  reg.tail = undefined;
  runtime.registrations.delete(reg);
}

function hasActiveRun<S>(reg: Registration<S>): boolean {
  for (const controller of reg.controllers) {
    if (!controller.signal.aborted) return true;
  }
  return false;
}

function dropDispatch<S>(
  runtime: EffectsRuntime<S>,
  reg: Registration<S>,
  event: StoreEvent,
  command: Command,
  source: DropSource,
): CommandHandle {
  reportError(runtime, reg, {
    error: new Error(
      `queue("${command.name}") from the effect on "${reg.eventName}" was dropped because ${DROP_REASON[source]}`,
    ),
    source,
    event,
    command,
  });
  return discardedHandle(command);
}

function createGuardedQueue<S>(
  runtime: EffectsRuntime<S>,
  reg: Registration<S>,
  signal: AbortSignal,
  event: StoreEvent,
): QueueFn {
  const guarded = (target: QueueTarget, ...args: unknown[]): CommandHandle => {
    const command = toCommand(target, args[0]);
    if (runtime.destroyed) {
      return dropDispatch(runtime, reg, event, command, "destroyedEffects");
    }
    if (signal.aborted) {
      return dropDispatch(runtime, reg, event, command, "abortedDispatch");
    }
    return runtime.store.queue(command);
  };
  return guarded;
}

function createContext<S>(
  runtime: EffectsRuntime<S>,
  reg: Registration<S>,
  signal: AbortSignal,
  event: StoreEvent,
): EffectContext<S> {
  return {
    get state() {
      return runtime.store.state;
    },
    queue: createGuardedQueue(runtime, reg, signal, event),
    signal,
  };
}

export async function runEffect<S>(
  runtime: EffectsRuntime<S>,
  reg: Registration<S>,
  event: StoreEvent,
): Promise<void> {
  if (runtime.destroyed || reg.disposed) return;

  const controller = new AbortController();
  reg.controllers.add(controller);

  try {
    await reg.invoke(
      event,
      createContext(runtime, reg, controller.signal, event),
    );
  } catch (error) {
    if (!isAbortError(error)) {
      reportError(runtime, reg, { error, source: "effectHandler", event });
    }
  } finally {
    reg.controllers.delete(controller);
  }
}

export function startRun<S>(
  runtime: EffectsRuntime<S>,
  reg: Registration<S>,
  event: StoreEvent,
): void {
  if (reg.mode === "switch") {
    abortRuns(reg);
  }
  if (reg.mode === "drop" && hasActiveRun(reg)) return;
  if (reg.mode === "queue") {
    const tail = reg.tail ?? Promise.resolve();
    reg.tail = tail.then(() => runEffect(runtime, reg, event));
    return;
  }
  void runEffect(runtime, reg, event);
}

export function scheduleRun<S>(
  runtime: EffectsRuntime<S>,
  reg: Registration<S>,
  event: StoreEvent,
): void {
  if (reg.debounceMs <= 0) {
    startRun(runtime, reg, event);
    return;
  }

  clearDebounce(reg);
  if (reg.mode === "switch") {
    abortRuns(reg);
  }
  reg.timer = setTimeout(() => {
    reg.timer = undefined;
    startRun(runtime, reg, event);
  }, reg.debounceMs);
}

export function handleEvent<S>(
  runtime: EffectsRuntime<S>,
  event: StoreEvent,
): void {
  if (runtime.destroyed) return;

  const snapshot = [...runtime.registrations];
  for (const reg of snapshot) {
    if (!reg.disposed && reg.cancelOnId === event.id) {
      cancelRegistration(reg);
    }
  }
  for (const reg of snapshot) {
    if (!reg.disposed && reg.eventId === event.id) {
      scheduleRun(runtime, reg, event);
    }
  }
}

export function createRegistration<S, D>(
  eventDef: EventDef<D>,
  handler: EffectHandler<S, D>,
  options: EffectOptions | undefined,
): Registration<S> {
  return {
    eventId: eventDef.id,
    eventName: eventDef.name,
    invoke: (event, ctx) =>
      matchEvent(event, eventDef) ? handler(event.data, ctx) : undefined,
    cancelOnId: options?.cancelOn?.id,
    mode: resolveMode(options),
    debounceMs: options?.debounce ?? 0,
    onError: options?.onError,
    controllers: new Set(),
    timer: undefined,
    tail: undefined,
    disposed: false,
  };
}
