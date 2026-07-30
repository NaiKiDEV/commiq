import type {
  Command,
  CommandContext,
  CommandDef,
  CommandHandler,
  CommandHandlerOptions,
  DeepReadonly,
  Disposable,
  EventContext,
  EventDef,
  EventHandler,
  StoreEvent,
  StreamListener,
  Unsubscribe,
} from "@naikidev/commiq";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: number;
};

export type LoggerOptions = {
  onLog?: (entry: LogEntry) => void;
};

export type CommandMeta = {
  commandName: string;
  correlationId: string;
  causedBy: string | null;
  timestamp: number;
};

export type CheckOptions = {
  enabled?: boolean;
};

export type HistoryOptions = {
  maxEntries?: number;
};

export type StateHistory<S> = {
  readonly entries: ReadonlyArray<DeepReadonly<S>>;
  readonly previous: DeepReadonly<S> | undefined;
  clear: () => void;
};

export type ExtensionTarget<S> = {
  readonly state: DeepReadonly<S>;
  openStream: (listener: StreamListener) => Unsubscribe;
};

export type ContextExtension<
  S,
  TCommand extends Record<string, unknown> = {},
  TEvent extends Record<string, unknown> = {},
> = {
  command?: (ctx: CommandContext<S>, command: Command) => TCommand;
  event?: (ctx: EventContext<S>, event: StoreEvent) => TEvent;
  afterCommand?: () => void | Promise<void>;
  afterEvent?: () => void | Promise<void>;
  destroy?: () => void;
};

export type ContextExtensionFactory<
  S,
  TCommand extends Record<string, unknown> = {},
  TEvent extends Record<string, unknown> = {},
> = (target: ExtensionTarget<S>) => ContextExtension<S, TCommand, TEvent>;

export type ExtendedStore<
  S,
  TCommand extends Record<string, unknown>,
  TEvent extends Record<string, unknown>,
> = Disposable & {
  use<TC extends Record<string, unknown>, TE extends Record<string, unknown>>(
    factory: ContextExtensionFactory<S, TC, TE>,
  ): ExtendedStore<S, TCommand & TC, TEvent & TE>;
  addCommandHandler<N extends string, D>(
    def: CommandDef<N, D>,
    handler: CommandHandler<S, D, TCommand>,
    options?: CommandHandlerOptions,
  ): ExtendedStore<S, TCommand, TEvent>;
  addCommandHandler<D = unknown>(
    name: string,
    handler: CommandHandler<S, D, TCommand>,
    options?: CommandHandlerOptions,
  ): ExtendedStore<S, TCommand, TEvent>;
  addEventHandler<D>(
    eventDef: EventDef<D>,
    handler: EventHandler<S, D, TEvent>,
  ): Unsubscribe;
};
