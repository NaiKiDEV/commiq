import { nanoid } from "nanoid";
import {
  Command,
  CommandContext,
  CommandDef,
  CommandHandle,
  CommandHandler,
  CommandHandlerOptions,
  CommandResult,
  CommandStatus,
  ContextExtensionDef,
  DeepReadonly,
  ErrorReporter,
  EventContext,
  EventDef,
  EventHandler,
  QueueFn,
  StateUpdater,
  StoreErrorReport,
  StoreEvent,
  StoreOptions,
  StreamListener,
  Unsubscribe,
  createCommand,
  handledEvent,
  isCommandDef,
} from "./types";
import {
  BuiltinEvent,
  RESERVED_COMMAND_CONTEXT_KEYS,
  RESERVED_EVENT_CONTEXT_KEYS,
} from "./constants";
import {
  CommandSettler,
  createPendingHandle,
  createSettledHandle,
} from "./command-handle";
import { freezeState } from "./freeze";
import { reportToConsole, runSafe } from "./run-safe";

const _causalStack: string[] = [];

const noop: Unsubscribe = () => {};

type HandlerEntry<S> = {
  handler: CommandHandler<S>;
  options?: CommandHandlerOptions;
};

type CommandInvocation<S> = {
  ctx: CommandContext<S>;
  dispose: () => void;
};

type AfterHookName = "afterCommand" | "afterEvent";

const defaultErrorReporter: ErrorReporter = (report) => {
  reportToConsole(`[commiq] unhandled ${report.source} error`, report.error);
};

function isStateUpdater<S>(next: S | StateUpdater<S>): next is StateUpdater<S> {
  return typeof next === "function";
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
  private _pendingEvents: StoreEvent[] = [];
  private _settlers = new Map<string, CommandSettler>();
  private _handlerDepth = 0;
  private _active = false;
  private _destroyed = false;
  private _onError: ErrorReporter;
  private _isReporting = false;

  constructor(initialState: S, options?: StoreOptions) {
    this._state = freezeState(initialState);
    this._onError = options?.onError ?? defaultErrorReporter;
  }

  readonly queue: QueueFn = (
    first: Command | CommandDef<string, never>,
    ...args: unknown[]
  ): CommandHandle =>
    this._dispatch(
      isCommandDef(first) ? createCommand(first.name, args[0]) : first,
    );

  get state(): DeepReadonly<S> {
    return this._state as DeepReadonly<S>;
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
    this._applyState(next);
    this._publish(this._createEvent<void>(BuiltinEvent.StateReset, undefined));
    this._schedule();
  }

  addCommandHandler<N extends string, D>(
    def: CommandDef<N, D>,
    handler: CommandHandler<S, D, Ctx>,
    options?: CommandHandlerOptions,
  ): this;
  addCommandHandler<D = unknown>(
    name: string,
    handler: CommandHandler<S, D, Ctx>,
    options?: CommandHandlerOptions,
  ): this;
  addCommandHandler(
    nameOrDef: string | CommandDef<string, never>,
    handler: CommandHandler<S, never, Ctx>,
    options?: CommandHandlerOptions,
  ): this {
    const name = typeof nameOrDef === "string" ? nameOrDef : nameOrDef.name;

    if (this._destroyed) {
      this._reportDestroyed(`addCommandHandler("${name}")`);
      return this;
    }

    if (this._commandHandlers.has(name)) {
      this._report({
        error: new Error(
          `A command handler for "${name}" is already registered and will be replaced`,
        ),
        source: "duplicateHandler",
      });
    }

    this._commandHandlers.set(name, {
      handler: handler as CommandHandler<S>,
      options,
    });
    return this;
  }

  removeCommandHandler(nameOrDef: string | CommandDef<string, never>): boolean {
    const name = typeof nameOrDef === "string" ? nameOrDef : nameOrDef.name;
    return this._commandHandlers.delete(name);
  }

  addEventHandler<D>(
    eventDef: EventDef<D>,
    handler: EventHandler<S, D, Ctx>,
  ): Unsubscribe {
    if (this._destroyed) {
      this._reportDestroyed(`addEventHandler("${eventDef.name}")`);
      return noop;
    }

    const handlers = this._eventHandlers.get(eventDef.id) ?? [];
    handlers.push(handler as EventHandler<S>);
    this._eventHandlers.set(eventDef.id, handlers);

    return () => {
      this.removeEventHandler(eventDef, handler);
    };
  }

  removeEventHandler<D>(
    eventDef: EventDef<D>,
    handler: EventHandler<S, D, Ctx>,
  ): boolean {
    const handlers = this._eventHandlers.get(eventDef.id);
    if (!handlers) return false;

    const index = handlers.indexOf(handler as EventHandler<S>);
    if (index === -1) return false;

    handlers.splice(index, 1);
    if (handlers.length === 0) this._eventHandlers.delete(eventDef.id);
    return true;
  }

  flush(): Promise<void> {
    if (this._handlerDepth > 0) {
      throw new Error(
        "flush() cannot be called from inside a command or event handler — await the handle returned by queue() instead",
      );
    }
    if (this._destroyed) return Promise.resolve();
    if (!this._processing && !this._hasWork()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this._flushResolvers.push(resolve);
    });
  }

  openStream(listener: StreamListener): Unsubscribe {
    if (this._destroyed) {
      this._reportDestroyed("openStream()");
      return noop;
    }
    this._streamListeners.add(listener);
    return () => {
      this._streamListeners.delete(listener);
    };
  }

  closeStream(listener: StreamListener): void {
    this._streamListeners.delete(listener);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    for (const controller of this._interruptControllers.values()) {
      controller.abort();
    }
    this._interruptControllers.clear();

    this._queue.length = 0;
    this._pendingEvents.length = 0;
    this._streamListeners.clear();
    this._eventHandlers.clear();
    this._commandHandlers.clear();
    this._contextExtensions.length = 0;

    for (const settler of [...this._settlers.values()]) {
      this._settleCommand(settler.command, "discarded");
    }
    this._settlers.clear();

    for (const resolve of this._flushResolvers.splice(0)) {
      resolve();
    }
  }

  private _dispatch(command: Command): CommandHandle {
    if (this._destroyed) {
      this._reportDestroyed(`queue("${command.name}")`, command);
      return createSettledHandle({ status: "discarded", command });
    }

    this._active = true;
    const handle = this._enqueue(
      command,
      _causalStack[_causalStack.length - 1] ?? null,
    );
    this._schedule();
    return handle;
  }

  private _hasWork(): boolean {
    return this._queue.length > 0 || this._pendingEvents.length > 0;
  }

  private _enqueue(
    command: Command,
    fallbackCausedBy: string | null,
  ): CommandHandle {
    const queued: Command = {
      ...command,
      correlationId: nanoid(),
      causedBy:
        command.causedBy ?? this._currentCorrelationId ?? fallbackCausedBy,
    };

    const entry = this._commandHandlers.get(queued.name);
    if (entry?.options?.interruptable) {
      this._interruptDuplicates(queued.name);
    }

    this._queue.push(queued);

    const { handle, settler } = createPendingHandle(queued);
    this._settlers.set(queued.correlationId, settler);
    return handle;
  }

  private _settleCommand(
    command: Command,
    status: CommandStatus,
    error?: unknown,
  ): void {
    const settler = this._settlers.get(command.correlationId);
    if (!settler) return;
    this._settlers.delete(command.correlationId);

    const result: CommandResult =
      status === "failed" ? { status, command, error } : { status, command };
    settler.settle(result);
  }

  private _interruptDuplicates(name: string): void {
    const removed: Command[] = [];
    this._queue = this._queue.filter((queued) => {
      if (queued.name !== name) return true;
      removed.push(queued);
      return false;
    });

    for (const command of removed) {
      this._publish(
        this._createEvent(BuiltinEvent.CommandInterrupted, {
          command,
          phase: "queued" as const,
        }),
      );
      this._settleCommand(command, "interrupted");
    }

    this._interruptControllers.get(name)?.abort();
  }

  private _schedule(): void {
    if (this._processing || this._destroyed) return;
    void this._processQueue().catch((error: unknown) => {
      this._report({ error, source: "queueProcessor" });
    });
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

  private _publish(event: StoreEvent): void {
    if (this._destroyed) return;
    this._notifyStreamListeners(event);
    this._pendingEvents.push(event);
  }

  private _applyState(next: S): void {
    const prev = this._state;
    if (next === prev) return;
    this._state = freezeState(next);
    this._publish(
      this._createEvent(BuiltinEvent.StateChanged, { prev, next: this._state }),
    );
  }

  private _report(report: StoreErrorReport): void {
    try {
      this._onError(report);
    } catch (error) {
      reportToConsole("[commiq] onError reporter threw", error);
    }
  }

  private _reportDestroyed(operation: string, command?: Command): void {
    this._report({
      error: new Error(`${operation} called after the store was destroyed`),
      source: "destroyedStore",
      command,
    });
  }

  private _reportUnhandled(report: StoreErrorReport): void {
    this._report(report);
    if (this._isReporting) return;
    this._isReporting = true;
    try {
      this._publish(this._createEvent(BuiltinEvent.UnhandledError, report));
    } finally {
      this._isReporting = false;
    }
    this._schedule();
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

  private async _runAfterHooks(name: AfterHookName): Promise<void> {
    for (const ext of this._contextExtensions) {
      const hook = ext[name];
      if (!hook) continue;
      await runSafe(
        () => hook(),
        (error) =>
          this._reportUnhandled({ error, source: "contextExtension" }),
      );
    }
  }

  private async _processQueue(): Promise<void> {
    this._processing = true;

    try {
      while (this._hasWork()) {
        await this._dispatchPending();
        if (this._queue.length > 0) {
          await this._processNextCommand();
        }
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

  private async _dispatchPending(): Promise<void> {
    while (this._pendingEvents.length > 0) {
      const event = this._pendingEvents.shift();
      if (!event) return;
      await this._handleEvent(event);
    }
  }

  private async _processNextCommand(): Promise<void> {
    const command = this._queue.shift();
    if (!command) return;
    this._currentCorrelationId = command.correlationId;
    const entry = this._commandHandlers.get(command.name);

    if (!entry) {
      this._publish(
        this._createEvent(BuiltinEvent.InvalidCommand, { command }),
      );
      this._settleCommand(command, "invalid");
      this._currentCorrelationId = null;
      await this._dispatchPending();
      return;
    }

    this._publish(
      this._createEvent(BuiltinEvent.CommandStarted, { command }),
    );
    await this._dispatchPending();
    await this._runCommand(entry, command);
  }

  private async _runCommand(
    entry: HandlerEntry<S>,
    command: Command,
  ): Promise<void> {
    this._currentCorrelationId = command.correlationId;
    const prevState = this._state;
    const isInterruptable = entry.options?.interruptable === true;
    const controller = isInterruptable
      ? this._createInterruptController(command.name)
      : undefined;
    const invocation = this._createCommandContext(command, controller?.signal);

    try {
      this._applyCommandExtensions(invocation.ctx, command);
      await this._invokeCommandHandler(entry, invocation.ctx, command);

      if (controller?.signal.aborted) {
        this._finishInterrupted(entry, command, prevState);
        return;
      }

      this._finishHandled(entry, command);
    } catch (error) {
      if (controller?.signal.aborted) {
        this._finishInterrupted(entry, command, prevState);
      } else {
        this._failCommand(command, error);
      }
    } finally {
      invocation.dispose();
      await this._runAfterHooks("afterCommand");
      if (isInterruptable) this._interruptControllers.delete(command.name);
      this._currentCorrelationId = null;
      await this._dispatchPending();
    }
  }

  private _invokeCommandHandler(
    entry: HandlerEntry<S>,
    ctx: CommandContext<S>,
    command: Command,
  ): void | Promise<void> {
    this._handlerDepth += 1;
    try {
      return entry.handler(ctx, command);
    } finally {
      this._handlerDepth -= 1;
    }
  }

  private _finishHandled(entry: HandlerEntry<S>, command: Command): void {
    this._publish(
      this._createEvent(BuiltinEvent.CommandHandled, { command }),
    );

    if (entry.options?.notify) {
      this._publish(
        this._createEvent(handledEvent(command.name), { command }),
      );
    }

    this._settleCommand(command, "handled");
  }

  private _finishInterrupted(
    entry: HandlerEntry<S>,
    command: Command,
    prevState: S,
  ): void {
    if (entry.options?.rollbackOnInterrupt === true) {
      this._applyState(prevState);
    }
    this._publish(
      this._createEvent(BuiltinEvent.CommandInterrupted, {
        command,
        phase: "running" as const,
      }),
    );
    this._settleCommand(command, "interrupted");
  }

  private _failCommand(command: Command, error: unknown): void {
    this._report({ error, source: "commandHandler", command });
    this._publish(
      this._createEvent(BuiltinEvent.CommandHandlingError, { command, error }),
    );
    this._settleCommand(command, "failed", error);
  }

  private _createInterruptController(name: string): AbortController {
    this._interruptControllers.get(name)?.abort();
    const controller = new AbortController();
    this._interruptControllers.set(name, controller);
    return controller;
  }

  private _createCommandContext(
    command: Command,
    signal?: AbortSignal,
  ): CommandInvocation<S> {
    const store = this;
    let isDisposed = false;

    const isUnusable = (operation: string): boolean => {
      if (!isDisposed) return false;
      store._reportUnhandled({
        error: new Error(
          `${operation}() called after command "${command.name}" finished`,
        ),
        source: "disposedContext",
        command,
      });
      return true;
    };

    const ctx: CommandContext<S> = {
      get state(): DeepReadonly<S> {
        return store.state;
      },
      setState: (next: S | StateUpdater<S>) => {
        if (isUnusable("setState")) return;
        store._applyState(isStateUpdater(next) ? next(store.state) : next);
      },
      emit: <D>(eventDef: EventDef<D>, data: D) => {
        if (isUnusable("emit")) return;
        store._publish(store._createEvent(eventDef, data));
      },
      signal,
    };

    return {
      ctx,
      dispose: () => {
        isDisposed = true;
      },
    };
  }

  private _createEventContext(): EventContext<S> {
    const store = this;
    return {
      get state(): DeepReadonly<S> {
        return store.state;
      },
      queue: store.queue,
    };
  }

  private _notifyStreamListeners(event: StoreEvent): void {
    _causalStack.push(event.correlationId);
    try {
      for (const listener of [...this._streamListeners]) {
        try {
          listener(event);
        } catch (error) {
          this._reportUnhandled({ error, source: "streamListener", event });
        }
      }
    } finally {
      _causalStack.pop();
    }
  }

  private async _handleEvent(event: StoreEvent): Promise<void> {
    const handlers = this._eventHandlers.get(event.id);
    if (!handlers || handlers.length === 0) return;

    const snapshot = [...handlers];
    const prevCorrelationId = this._currentCorrelationId;
    this._currentCorrelationId = event.correlationId;

    try {
      const eventCtx = this._createEventContext();
      this._applyEventExtensions(eventCtx, event);

      for (const handler of snapshot) {
        try {
          await this._invokeEventHandler(handler, eventCtx, event);
        } catch (error) {
          this._failEvent(event, error);
        }
      }
    } catch (error) {
      this._failEvent(event, error);
    } finally {
      await this._runAfterHooks("afterEvent");
      this._currentCorrelationId = prevCorrelationId;
    }
  }

  private _invokeEventHandler(
    handler: EventHandler<S>,
    ctx: EventContext<S>,
    event: StoreEvent,
  ): void | Promise<void> {
    this._handlerDepth += 1;
    try {
      return handler(ctx, event);
    } finally {
      this._handlerDepth -= 1;
    }
  }

  private _failEvent(event: StoreEvent, error: unknown): void {
    this._report({ error, source: "eventHandler", event });
    if (
      event.id === BuiltinEvent.EventHandlingError.id ||
      event.id === BuiltinEvent.UnhandledError.id
    ) {
      return;
    }
    this._publish(
      this._createEvent(BuiltinEvent.EventHandlingError, { event, error }),
    );
  }
}

export function createStore<S>(
  initialState: S,
  options?: StoreOptions,
): StoreImpl<S, {}> {
  return new StoreImpl(initialState, options);
}
