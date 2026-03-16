import { nanoid } from "nanoid";
import {
  Command,
  CommandContext,
  CommandHandler,
  CommandHandlerOptions,
  ContextExtensionDef,
  EventContext,
  EventDef,
  EventHandler,
  StoreEvent,
  StreamListener,
  createEvent,
} from "./types";

let _causalContext: string | null = null;
export const BuiltinEventName = {
  StateChanged: "stateChanged",
  CommandHandled: "commandHandled",
  CommandStarted: "commandStarted",
  InvalidCommand: "invalidCommand",
  CommandHandlingError: "commandHandlingError",
  StateReset: "stateReset",
  CommandInterrupted: "commandInterrupted",
} as const;

export const BuiltinEvent = {
  StateChanged: createEvent<{ prev: unknown; next: unknown }>(BuiltinEventName.StateChanged),
  CommandHandled: createEvent<{ command: Command }>(BuiltinEventName.CommandHandled),
  CommandStarted: createEvent<{ command: Command }>(BuiltinEventName.CommandStarted),
  InvalidCommand: createEvent<{ command: Command }>(BuiltinEventName.InvalidCommand),
  CommandHandlingError: createEvent<{ command: Command; error: unknown }>(
    BuiltinEventName.CommandHandlingError,
  ),
  StateReset: createEvent(BuiltinEventName.StateReset),
  CommandInterrupted: createEvent<{ command: Command; phase: "queued" | "running" }>(
    BuiltinEventName.CommandInterrupted,
  ),
} as const;

const RESERVED_COMMAND_CONTEXT_KEYS = new Set(["state", "setState", "emit", "signal"]);
const RESERVED_EVENT_CONTEXT_KEYS = new Set(["state", "queue"]);

type HandlerEntry<S> = {
  handler: CommandHandler<S>;
  options?: CommandHandlerOptions;
}

export class StoreImpl<S, Ctx extends Record<string, unknown> = {}> {
  private _state: S;
  private _commandHandlers = new Map<string, HandlerEntry<S>>();
  private _eventHandlers = new Map<symbol, EventHandler<S>[]>();
  private _streamListeners = new Set<StreamListener>();
  private _queue: Command<string, unknown>[] = [];
  private _processing = false;
  private _flushResolvers: Array<() => void> = [];
  private _currentCorrelationId: string | null = null;
  private _interruptControllers = new Map<string, AbortController>();
  private _contextExtensions: ContextExtensionDef<S>[] = [];
  private _active = false;

  constructor(initialState: S) {
    this._state = initialState;
  }

  get state(): S {
    return this._state;
  }

  useExtension<T extends Record<string, unknown>>(
    ext: ContextExtensionDef<S, T>,
  ): StoreImpl<S, Ctx & T> {
    if (this._active) {
      throw new Error("Cannot add extensions to an active store");
    }
    this._contextExtensions.push(ext as ContextExtensionDef<S>);
    return this as StoreImpl<S, Ctx & T>;
  }

  replaceState(next: S): void {
    if (next === this._state) return;
    const prev = this._state;
    this._state = next;
    void this._broadcast(
      this._createEvent(BuiltinEvent.StateChanged, { prev, next }),
    );
    void this._broadcast(
      this._createEvent(BuiltinEvent.StateReset, undefined as void),
    );
  }

  addCommandHandler<D = unknown>(
    name: string,
    handler: CommandHandler<S, D, Ctx>,
    options?: CommandHandlerOptions,
  ): this {
    this._commandHandlers.set(name, {
      handler: handler as CommandHandler<S>,
      options,
    });
    return this;
  }

  addEventHandler<D>(eventDef: EventDef<D>, handler: EventHandler<S, D, Ctx>): this {
    const handlers = this._eventHandlers.get(eventDef.id) ?? [];
    handlers.push(handler as EventHandler<S>);
    this._eventHandlers.set(eventDef.id, handlers);
    return this;
  }

  queue(command: Command): void {
    this._active = true;
    command.correlationId = nanoid();
    command.causedBy =
      this._currentCorrelationId ?? command.causedBy ?? _causalContext;

    const entry = this._commandHandlers.get(command.name);
    if (entry?.options?.interruptable) {
      const removed: Command[] = [];
      this._queue = this._queue.filter((queued) => {
        if (queued.name === command.name) {
          removed.push(queued);
          return false;
        }
        return true;
      });
      for (const cmd of removed) {
        this._broadcastSync(
          this._createEvent(BuiltinEvent.CommandInterrupted, { command: cmd, phase: "queued" as const }),
        );
      }

      const existing = this._interruptControllers.get(command.name);
      if (existing) {
        existing.abort();
      }
    }

    this._queue.push(command);
    if (!this._processing) {
      this._processQueue();
    }
  }

  flush(): Promise<void> {
    if (!this._processing && this._queue.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this._flushResolvers.push(resolve);
    });
  }

  openStream(listener: StreamListener): void {
    this._streamListeners.add(listener);
  }

  closeStream(listener: StreamListener): void {
    this._streamListeners.delete(listener);
  }

  private _createEvent<D>(eventDef: EventDef<D>, data: D): StoreEvent<D> {
    return {
      id: eventDef.id,
      name: eventDef.name,
      data,
      timestamp: Date.now(),
      correlationId: nanoid(),
      causedBy: this._currentCorrelationId,
    };
  }

  private _applyCommandExtensions(ctx: CommandContext<S>, command: Command): void {
    const claimed = new Set<string>();
    for (const ext of this._contextExtensions) {
      if (!ext.command) continue;
      const props = ext.command(ctx, command);
      for (const key of Object.keys(props)) {
        if (RESERVED_COMMAND_CONTEXT_KEYS.has(key) || claimed.has(key)) {
          throw new Error(`Context extension key "${key}" conflicts with existing context property`);
        }
        claimed.add(key);
      }
      Object.assign(ctx, props);
    }
  }

  private _applyEventExtensions(ctx: EventContext<S>, event: StoreEvent): void {
    const claimed = new Set<string>();
    for (const ext of this._contextExtensions) {
      if (!ext.event) continue;
      const props = ext.event(ctx, event);
      for (const key of Object.keys(props)) {
        if (RESERVED_EVENT_CONTEXT_KEYS.has(key) || claimed.has(key)) {
          throw new Error(`Context extension key "${key}" conflicts with existing context property`);
        }
        claimed.add(key);
      }
      Object.assign(ctx, props);
    }
  }

  private async _processQueue(): Promise<void> {
    this._processing = true;

    while (this._queue.length > 0) {
      const command = this._queue.shift()!;
      this._currentCorrelationId = command.correlationId;
      const entry = this._commandHandlers.get(command.name);

      if (!entry) {
        await this._broadcast(
          this._createEvent(BuiltinEvent.InvalidCommand, { command }),
        );
        this._currentCorrelationId = null;
        continue;
      }

      await this._broadcast(
        this._createEvent(BuiltinEvent.CommandStarted, { command }),
      );

      const collectedEvents: StoreEvent[] = [];
      const prevState = this._state;
      const isInterruptable = entry.options?.interruptable === true;

      let abortController: AbortController | undefined;
      if (isInterruptable) {
        const existing = this._interruptControllers.get(command.name);
        if (existing) {
          existing.abort();
        }
        abortController = new AbortController();
        this._interruptControllers.set(command.name, abortController);
      }

      const ctx: CommandContext<S> = {
        state: this._state,
        setState: (next: S) => {
          this._state = next;
          ctx.state = next;
        },
        emit: <D>(eventDef: EventDef<D>, data: D) => {
          collectedEvents.push(this._createEvent(eventDef, data));
        },
        signal: abortController?.signal,
      };

      try {
        this._applyCommandExtensions(ctx, command);
        await entry.handler(ctx, command);

        if (isInterruptable && abortController!.signal.aborted) {
          await this._broadcast(
            this._createEvent(BuiltinEvent.CommandInterrupted, { command, phase: "running" as const }),
          );
          if (isInterruptable) this._interruptControllers.delete(command.name);
          this._currentCorrelationId = null;
          continue;
        }

        if (this._state !== prevState) {
          await this._broadcast(
            this._createEvent(BuiltinEvent.StateChanged, {
              prev: prevState,
              next: this._state,
            }),
          );
        }

        for (const event of collectedEvents) {
          await this._broadcast(event);
        }

        await this._broadcast(
          this._createEvent(BuiltinEvent.CommandHandled, { command }),
        );

        if (entry.options?.notify) {
          const notifyEventDef = createEvent<{ command: Command }>(
            `${command.name}:handled`,
          );
          await this._broadcast(this._createEvent(notifyEventDef, { command }));
        }
      } catch (error) {
        if (isInterruptable && abortController!.signal.aborted) {
          await this._broadcast(
            this._createEvent(BuiltinEvent.CommandInterrupted, { command, phase: "running" as const }),
          );
        } else {
          await this._broadcast(
            this._createEvent(BuiltinEvent.CommandHandlingError, {
              command,
              error,
            }),
          );
        }
      } finally {
        for (const ext of this._contextExtensions) {
          if (ext.afterCommand) {
            try {
              await ext.afterCommand();
            } catch {
              // lifecycle hook errors are swallowed
            }
          }
        }
        if (isInterruptable) this._interruptControllers.delete(command.name);
      }

      this._currentCorrelationId = null;
    }

    this._processing = false;

    const resolvers = this._flushResolvers.splice(0);
    for (const resolve of resolvers) {
      resolve();
    }
  }

  private _broadcastSync(event: StoreEvent): void {
    const prevCausalContext = _causalContext;
    _causalContext = event.correlationId;
    for (const listener of this._streamListeners) {
      listener(event);
    }
    _causalContext = prevCausalContext;
  }

  private async _broadcast(event: StoreEvent): Promise<void> {
    const prevCausalContext = _causalContext;
    _causalContext = event.correlationId;

    for (const listener of this._streamListeners) {
      listener(event);
    }

    _causalContext = prevCausalContext;

    await this._handleEvent(event);
  }

  private async _handleEvent(event: StoreEvent): Promise<void> {
    const handlers = this._eventHandlers.get(event.id);
    if (!handlers) return;

    const prevCorrelationId = this._currentCorrelationId;
    this._currentCorrelationId = event.correlationId;

    const eventCtx: EventContext<S> = {
      state: this._state,
      queue: (command: Command) => {
        command.correlationId = nanoid();
        command.causedBy = this._currentCorrelationId;
        this._queue.push(command);
      },
    };

    this._applyEventExtensions(eventCtx, event);

    try {
      for (const handler of handlers) {
        await handler(eventCtx, event);
      }
    } finally {
      for (const ext of this._contextExtensions) {
        if (ext.afterEvent) {
          try {
            await ext.afterEvent();
          } catch {
            // lifecycle hook errors are swallowed
          }
        }
      }
    }

    this._currentCorrelationId = prevCorrelationId;
  }
}

export function createStore<S>(initialState: S): StoreImpl<S, {}> {
  return new StoreImpl(initialState);
}
