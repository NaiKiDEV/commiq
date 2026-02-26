export type Command<N extends string = string, D = unknown> = {
  name: N;
  data: D;
  correlationId: string;
  causedBy: string | null;
}

export type EventDef<D = unknown> = {
  id: symbol;
  name: string;
}

export type StoreEvent<D = unknown> = {
  id: symbol;
  name: string;
  data: D;
  timestamp: number;
  correlationId: string;
  causedBy: string | null;
}

export type CommandContext<S> = {
  state: S;
  setState: (next: S) => void;
  emit: <D>(eventDef: EventDef<D>, data: D) => void;
}

export type EventContext<S> = {
  state: S;
  queue: (command: Command) => void;
}

export type CommandHandler<S, D = unknown> = (
  ctx: CommandContext<S>,
  cmd: Command<string, D>
) => void | Promise<void>;

export type EventHandler<S, D = unknown> = (
  ctx: EventContext<S>,
  event: StoreEvent<D>
) => void | Promise<void>;

export type StreamListener = (event: StoreEvent) => void;

export type CommandHandlerOptions = {
  notify?: boolean;
}

export type SealedStore<S> = {
  readonly state: S;
  queue: (command: Command) => void;
  openStream: (listener: StreamListener) => void;
  closeStream: (listener: StreamListener) => void;
}

export function createCommand<N extends string, D>(
  name: N,
  data: D,
  options?: { causedBy?: string },
): Command<N, D> {
  return { name, data, correlationId: "", causedBy: options?.causedBy ?? null };
}

export function createEvent<D = void>(name: string): EventDef<D> {
  return { id: Symbol(name), name };
}

export function handledEvent<D = unknown>(commandName: string): EventDef<D> {
  return { id: Symbol(`${commandName}:handled`), name: `${commandName}:handled` };
}
