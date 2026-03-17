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
import {
  BuiltinEvent,
  RESERVED_COMMAND_CONTEXT_KEYS,
  RESERVED_EVENT_CONTEXT_KEYS,
} from "./constants";
import { runSafe } from "./run-safe";

const _causalStack: string[] = [];

type HandlerEntry<S> = {
  handler: CommandHandler<S>;
  options?: CommandHandlerOptions;
};

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
  private _pendingEvents: StoreEvent[] = [];
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
    this._notifyStreamListeners(
      this._createEvent(BuiltinEvent.StateChanged, { prev, next }),
    );
    this._notifyStreamListeners(
      this._createEvent<void>(BuiltinEvent.StateReset, undefined),
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

  addEventHandler<D>(
    eventDef: EventDef<D>,
    handler: EventHandler<S, D, Ctx>,
  ): this {
    const handlers = this._eventHandlers.get(eventDef.id) ?? [];
    handlers.push(handler as EventHandler<S>);
    this._eventHandlers.set(eventDef.id, handlers);
    return this;
  }

  queue(command: Command): void {
    this._active = true;
    this._enqueue(command, _causalStack[_causalStack.length - 1] ?? null);
    if (!this._processing) {
      this._processQueue();
    }
  }

  private _enqueue(command: Command, fallbackCausedBy: string | null): void {
    command.correlationId = nanoid();
    command.causedBy =
      this._currentCorrelationId ?? command.causedBy ?? fallbackCausedBy;

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
        const event = this._createEvent(BuiltinEvent.CommandInterrupted, {
          command: cmd,
          phase: "queued" as const,
        });
        this._pendingEvents.push(event);
        this._notifyStreamListeners(event);
      }

      const existing = this._interruptControllers.get(command.name);
      if (existing) {
        existing.abort();
      }
    }

    this._queue.push(command);
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

  private _applyCommandExtensions(
    ctx: CommandContext<S>,
    command: Command,
  ): void {
    const claimed = new Set<string>();
    for (const ext of this._contextExtensions) {
      if (!ext.command) continue;
      const props = ext.command(ctx, command);
      for (const key of Object.keys(props)) {
        if (RESERVED_COMMAND_CONTEXT_KEYS.has(key) || claimed.has(key)) {
          throw new Error(
            `Context extension key "${key}" conflicts with existing context property`,
          );
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
          throw new Error(
            `Context extension key "${key}" conflicts with existing context property`,
          );
        }
        claimed.add(key);
      }
      Object.assign(ctx, props);
    }
  }

  private async _processQueue(): Promise<void> {
    this._processing = true;

    try {
      while (this._queue.length > 0) {
        await this._drainPendingEvents();
        await this._processNextCommand();
      }
    } finally {
      this._processing = false;
      this._currentCorrelationId = null;

      const resolvers = this._flushResolvers.splice(0);
      for (const resolve of resolvers) {
        resolve();
      }
    }
  }

  private async _drainPendingEvents(): Promise<void> {
    if (this._pendingEvents.length === 0) return;
    const pending = this._pendingEvents.splice(0);
    for (const event of pending) {
      await runSafe(() => this._handleEvent(event));
    }
  }

  private async _processNextCommand(): Promise<void> {
    const command = this._queue.shift();
    if (!command) return;
    this._currentCorrelationId = command.correlationId;
    const entry = this._commandHandlers.get(command.name);

    if (!entry) {
      await runSafe(() =>
        this._broadcast(
          this._createEvent(BuiltinEvent.InvalidCommand, { command }),
        ),
      );
      this._currentCorrelationId = null;
      return;
    }

    await runSafe(() =>
      this._broadcast(
        this._createEvent(BuiltinEvent.CommandStarted, { command }),
      ),
    );

    const collectedEvents: StoreEvent[] = [];
    const prevState = this._state;
    const isInterruptable = entry.options?.interruptable === true;
    const shouldRollback =
      isInterruptable && entry.options?.rollbackOnInterrupt === true;

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

      if (isInterruptable && abortController?.signal.aborted) {
        if (shouldRollback) {
          this._state = prevState;
        }
        await this._broadcast(
          this._createEvent(BuiltinEvent.CommandInterrupted, {
            command,
            phase: "running" as const,
          }),
        );
        return;
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
      if (isInterruptable && abortController?.signal.aborted) {
        if (shouldRollback) {
          this._state = prevState;
        }
        await runSafe(() =>
          this._broadcast(
            this._createEvent(BuiltinEvent.CommandInterrupted, {
              command,
              phase: "running" as const,
            }),
          ),
        );
      } else {
        await runSafe(() =>
          this._broadcast(
            this._createEvent(BuiltinEvent.CommandHandlingError, {
              command,
              error,
            }),
          ),
        );
      }
    } finally {
      for (const ext of this._contextExtensions) {
        const hook = ext.afterCommand;
        if (hook) {
          await runSafe(() => hook());
        }
      }
      if (isInterruptable) this._interruptControllers.delete(command.name);
      this._currentCorrelationId = null;
    }
  }

  private _notifyStreamListeners(event: StoreEvent): void {
    _causalStack.push(event.correlationId);
    try {
      for (const listener of this._streamListeners) {
        listener(event);
      }
    } finally {
      _causalStack.pop();
    }
  }

  private async _broadcast(event: StoreEvent): Promise<void> {
    this._notifyStreamListeners(event);
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
        this._enqueue(command, null);
      },
    };

    this._applyEventExtensions(eventCtx, event);

    let firstError: unknown;
    for (const handler of handlers) {
      try {
        await handler(eventCtx, event);
      } catch (error) {
        firstError ??= error;
      }
    }

    for (const ext of this._contextExtensions) {
      const hook = ext.afterEvent;
      if (hook) {
        await runSafe(() => hook());
      }
    }

    this._currentCorrelationId = prevCorrelationId;

    if (firstError !== undefined) {
      throw firstError;
    }
  }
}

export function createStore<S>(initialState: S): StoreImpl<S, {}> {
  return new StoreImpl(initialState);
}
