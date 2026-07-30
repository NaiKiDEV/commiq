import type {
  Command,
  DeepReadonly,
  Disposable,
  EventDef,
  QueueFn,
  StoreEvent,
  Unsubscribe,
} from "@naikidev/commiq";

export type EffectErrorSource =
  | "effectHandler"
  | "abortedDispatch"
  | "destroyedEffects";

export type EffectErrorReport = {
  error: unknown;
  source: EffectErrorSource;
  event?: StoreEvent;
  command?: Command;
};

export type EffectErrorReporter = (report: EffectErrorReport) => void;

export type EffectContext<S> = {
  readonly state: DeepReadonly<S>;
  queue: QueueFn;
  signal: AbortSignal;
};

export type EffectHandler<S, D = unknown> = (
  data: D,
  ctx: EffectContext<S>,
) => void | Promise<void>;

export type EffectConcurrencyMode = "parallel" | "switch" | "drop" | "queue";

export type EffectOptions = {
  cancelOn?: EventDef<never>;
  mode?: EffectConcurrencyMode;
  /** @deprecated Use `mode` instead: `true` maps to `"switch"`, `false` maps to `"parallel"`. */
  restartOnNew?: boolean;
  debounce?: number;
  onError?: EffectErrorReporter;
};

export type EffectsOptions = {
  onError?: EffectErrorReporter;
};

export type Effects<S> = Disposable & {
  on<D>(
    eventDef: EventDef<D>,
    handler: EffectHandler<S, D>,
    options?: EffectOptions,
  ): Unsubscribe;
};
