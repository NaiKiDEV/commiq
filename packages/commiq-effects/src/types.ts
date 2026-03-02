import type { Command, EventDef } from "@naikidev/commiq";

export type EffectContext = {
  queue: (command: Command) => void;
  signal: AbortSignal;
};

export type EffectHandler<D> = (data: D, ctx: EffectContext) => void | Promise<void>;

export type EffectOptions = {
  cancelOn?: EventDef;
  restartOnNew?: boolean;
  debounce?: number;
};

export type Effects = {
  on<D>(eventDef: EventDef<D>, handler: EffectHandler<D>, options?: EffectOptions): void;
  destroy(): void;
};
