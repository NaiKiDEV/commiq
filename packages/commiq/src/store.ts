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

export const builtinEventDefs = {
  stateChanged: createEvent<{ prev: unknown; next: unknown }>("stateChanged"),
  commandHandled: createEvent<{ command: Command }>("commandHandled"),
  commandStarted: createEvent<{ command: Command }>("commandStarted"),
  invalidCommand: createEvent<{ command: Command }>("invalidCommand"),
  commandHandlingError: createEvent<{ command: Command; error: unknown }>(
    "commandHandlingError"
  ),
  stateReset: createEvent("stateReset"),
} as const;

interface HandlerEntry<S> {
  handler: CommandHandler<S>;
  options?: CommandHandlerOptions;
}

export class StoreImpl<S> {
  private _state: S;
  private _initialState: S;
  private _commandHandlers = new Map<string, HandlerEntry<S>>();
  private _eventHandlers = new Map<symbol, EventHandler<S, any>[]>();
  private _streamListeners = new Set<StreamListener>();
  private _queue: Command[] = [];
  private _processing = false;
  private _flushResolvers: Array<() => void> = [];

  constructor(initialState: S) {
    this._state = initialState;
    this._initialState = initialState;
  }

  get state(): S {
    return this._state;
  }

  addCommandHandler<D = unknown>(
    name: string,
    handler: CommandHandler<S, D>,
    options?: CommandHandlerOptions
  ): this {
    this._commandHandlers.set(name, {
      handler: handler as CommandHandler<S>,
      options,
    });
    return this;
  }

  addEventHandler<D>(
    eventDef: EventDef<D>,
    handler: EventHandler<S, D>
  ): this {
    const handlers = this._eventHandlers.get(eventDef.id) ?? [];
    handlers.push(handler);
    this._eventHandlers.set(eventDef.id, handlers);
    return this;
  }

  queue(command: Command): void {
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

  private async _processQueue(): Promise<void> {
    this._processing = true;

    while (this._queue.length > 0) {
      const command = this._queue.shift()!;
      const entry = this._commandHandlers.get(command.name);

      if (!entry) {
        await this._broadcast({
          id: builtinEventDefs.invalidCommand.id,
          name: builtinEventDefs.invalidCommand.name,
          data: { command },
        });
        continue;
      }

      // Broadcast commandStarted
      await this._broadcast({
        id: builtinEventDefs.commandStarted.id,
        name: builtinEventDefs.commandStarted.name,
        data: { command },
      });

      // Collect events emitted during handler execution
      const collectedEvents: StoreEvent[] = [];
      const prevState = this._state;

      const ctx: CommandContext<S> = {
        state: this._state,
        setState: (next: S) => {
          this._state = next;
          ctx.state = next;
        },
        emit: <D>(eventDef: EventDef<D>, data: D) => {
          collectedEvents.push({
            id: eventDef.id,
            name: eventDef.name,
            data,
          });
        },
      };

      try {
        await entry.handler(ctx, command);

        // Broadcast stateChanged if state changed
        if (this._state !== prevState) {
          await this._broadcast({
            id: builtinEventDefs.stateChanged.id,
            name: builtinEventDefs.stateChanged.name,
            data: { prev: prevState, next: this._state },
          });
        }

        // Broadcast collected events
        for (const event of collectedEvents) {
          await this._broadcast(event);
        }

        // Broadcast commandHandled
        await this._broadcast({
          id: builtinEventDefs.commandHandled.id,
          name: builtinEventDefs.commandHandled.name,
          data: { command },
        });

        // Auto-notify if option set
        if (entry.options?.notify) {
          const notifyEvent = createEvent(`${command.name}:handled`);
          await this._broadcast({
            id: notifyEvent.id,
            name: notifyEvent.name,
            data: { command },
          });
        }
      } catch (error) {
        await this._broadcast({
          id: builtinEventDefs.commandHandlingError.id,
          name: builtinEventDefs.commandHandlingError.name,
          data: { command, error },
        });
      }
    }

    this._processing = false;

    // Resolve all flush promises
    const resolvers = this._flushResolvers.splice(0);
    for (const resolve of resolvers) {
      resolve();
    }
  }

  private async _broadcast(event: StoreEvent): Promise<void> {
    // Notify stream listeners
    for (const listener of this._streamListeners) {
      listener(event);
    }

    // Handle event handlers
    await this._handleEvent(event);
  }

  private async _handleEvent(event: StoreEvent): Promise<void> {
    const handlers = this._eventHandlers.get(event.id);
    if (!handlers) return;

    const eventCtx: EventContext<S> = {
      state: this._state,
      queue: (command: Command) => {
        this._queue.push(command);
      },
    };

    for (const handler of handlers) {
      await handler(eventCtx, event);
    }
  }
}

export function createStore<S>(initialState: S): StoreImpl<S> {
  return new StoreImpl(initialState);
}
