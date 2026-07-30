export type Unsubscribe = () => void;

export type Disposable = {
  destroy(): void;
}

type ReadonlyPassthrough =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | undefined
  | null
  | Date
  | RegExp;

export type DeepReadonly<T> = unknown extends T
  ? T
  : T extends ReadonlyPassthrough
    ? T
    : T extends (...args: never[]) => unknown
      ? T
      : T extends ReadonlyArray<infer U>
        ? ReadonlyArray<DeepReadonly<U>>
        : T extends ReadonlyMap<infer K, infer V>
          ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
          : T extends ReadonlySet<infer U>
            ? ReadonlySet<DeepReadonly<U>>
            : { readonly [K in keyof T]: DeepReadonly<T[K]> };

export type Command<N extends string = string, D = unknown> = {
  name: N;
  data: D;
  correlationId: string;
  causedBy: string | null;
}

export type CommandDef<N extends string = string, D = unknown> = {
  name: N;
  kind: "commandDef";
  readonly __data?: (data: D) => void;
}

export type CommandPayloadArgs<D> = [undefined] extends [D]
  ? [data?: D]
  : [data: D];

export type CommandStatus =
  | "handled"
  | "failed"
  | "interrupted"
  | "invalid"
  | "discarded";

export type CommandResult = {
  status: CommandStatus;
  command: Command;
  error?: unknown;
}

export type CommandHandle = Promise<CommandResult> & {
  readonly command: Command;
  readonly correlationId: string;
}

export type QueueFn = {
  <N extends string, D>(
    def: CommandDef<N, D>,
    ...args: CommandPayloadArgs<D>
  ): CommandHandle;
  (command: Command): CommandHandle;
}

export type EventDef<D = unknown> = {
  id: symbol;
  name: string;
  readonly __data?: (data: D) => void;
}

export type StoreEvent<D = unknown> = {
  id: symbol;
  name: string;
  data: D;
  timestamp: number;
  correlationId: string;
  causedBy: string | null;
}

export type StateChangedData<S> = {
  prev: DeepReadonly<S>;
  next: DeepReadonly<S>;
}

export type StateUpdater<S> = (prev: DeepReadonly<S>) => S;

export type StoreErrorSource =
  | "commandHandler"
  | "eventHandler"
  | "streamListener"
  | "contextExtension"
  | "disposedContext"
  | "queueProcessor"
  | "duplicateHandler"
  | "destroyedStore";

export type StoreErrorReport = {
  error: unknown;
  source: StoreErrorSource;
  command?: Command;
  event?: StoreEvent;
}

export type ErrorReporter = (report: StoreErrorReport) => void;

export type StoreOptions = {
  onError?: ErrorReporter;
}

export type CommandContext<S> = {
  state: DeepReadonly<S>;
  setState: (next: S | StateUpdater<S>) => void;
  emit: <D>(eventDef: EventDef<D>, data: D) => void;
  signal?: AbortSignal;
}

export type EventContext<S> = {
  state: DeepReadonly<S>;
  queue: QueueFn;
}

export type CommandHandler<S, D = unknown, Ctx extends Record<string, unknown> = {}> = (
  ctx: CommandContext<S> & Ctx,
  cmd: Command<string, D>
) => void | Promise<void>;

export type EventHandler<S, D = unknown, Ctx extends Record<string, unknown> = {}> = (
  ctx: EventContext<S> & Ctx,
  event: StoreEvent<D>
) => void | Promise<void>;

export type ContextExtensionDef<S, T extends Record<string, unknown> = Record<string, unknown>> = {
  command?: (ctx: CommandContext<S>, command: Command) => T;
  event?: (ctx: EventContext<S>, event: StoreEvent) => T;
  afterCommand?: () => void | Promise<void>;
  afterEvent?: () => void | Promise<void>;
}

export type StreamListener = (event: StoreEvent) => void;

export type CommandHandlerOptions = {
  notify?: boolean;
  interruptable?: boolean;
  rollbackOnInterrupt?: boolean;
}

export type SealedStore<S> = {
  readonly state: DeepReadonly<S>;
  queue: QueueFn;
  flush: () => Promise<void>;
  openStream: (listener: StreamListener) => Unsubscribe;
  closeStream: (listener: StreamListener) => void;
}

export function createCommand<N extends string, D>(
  name: N,
  data: D,
  options?: { causedBy?: string },
): Command<N, D> {
  return { name, data, correlationId: "", causedBy: options?.causedBy ?? null };
}

export function createCommandDef<D = void, N extends string = string>(
  name: N,
): CommandDef<N, D> {
  return { name, kind: "commandDef" };
}

export function isCommandDef(
  value: Command | CommandDef<string, never>,
): value is CommandDef<string, never> {
  return "kind" in value && value.kind === "commandDef";
}

export function createEvent<D = void>(name: string): EventDef<D> {
  return { id: Symbol(name), name };
}

const handledEventRegistry = new Map<string, EventDef<unknown>>();

export function handledEvent<D = { command: Command }>(
  commandName: string,
): EventDef<D> {
  const name = `${commandName}:handled`;
  const existing = handledEventRegistry.get(name);
  if (existing) return existing;

  const created = createEvent<unknown>(name);
  handledEventRegistry.set(name, created);
  return created;
}

export function matchEvent<D>(
  event: StoreEvent,
  eventDef: EventDef<D>,
): event is StoreEvent<D> {
  return event.id === eventDef.id;
}
