import { nanoid } from "nanoid";
import {
  Command,
  CommandContext,
  CommandHandler,
  CommandHandlerOptions,
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
} as const;

type HandlerEntry<S> = {
  handler: CommandHandler<S>;
  options?: CommandHandlerOptions;
}

export class StoreImpl<S> {
  private _state: S;
  private _commandHandlers = new Map<string, HandlerEntry<S>>();
  private _eventHandlers = new Map<symbol, EventHandler<S, any>[]>();
  private _streamListeners = new Set<StreamListener>();
  private _queue: Command[] = [];
  private _processing = false;
  private _flushResolvers: Array<() => void> = [];
  private _currentCorrelationId: string | null = null;

  constructor(initialState: S) {
    this._state = initialState;
  }

  get state(): S {
    return this._state;
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
    handler: CommandHandler<S, D>,
    options?: CommandHandlerOptions,
  ): this {
    this._commandHandlers.set(name, {
      handler: handler as CommandHandler<S>,
      options,
    });
    return this;
  }

  addEventHandler<D>(eventDef: EventDef<D>, handler: EventHandler<S, D>): this {
    const handlers = this._eventHandlers.get(eventDef.id) ?? [];
    handlers.push(handler);
    this._eventHandlers.set(eventDef.id, handlers);
    return this;
  }

  queue(command: Command): void {
    command.correlationId = nanoid();
    command.causedBy =
      this._currentCorrelationId ?? command.causedBy ?? _causalContext;
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

      const ctx: CommandContext<S> = {
        state: this._state,
        setState: (next: S) => {
          this._state = next;
          ctx.state = next;
        },
        emit: <D>(eventDef: EventDef<D>, data: D) => {
          collectedEvents.push(this._createEvent(eventDef, data));
        },
      };

      try {
        await entry.handler(ctx, command);

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
        await this._broadcast(
          this._createEvent(BuiltinEvent.CommandHandlingError, {
            command,
            error,
          }),
        );
      }

      this._currentCorrelationId = null;
    }

    this._processing = false;

    const resolvers = this._flushResolvers.splice(0);
    for (const resolve of resolvers) {
      resolve();
    }
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

    for (const handler of handlers) {
      await handler(eventCtx, event);
    }

    this._currentCorrelationId = prevCorrelationId;
  }
}

export function createStore<S>(initialState: S): StoreImpl<S> {
  return new StoreImpl(initialState);
}
