import { nanoid } from "nanoid";
import {
  AnyContextExtension,
  Command,
  CommandContext,
  CommandDef,
  CommandHandle,
  CommandHandler,
  CommandHandlerOptions,
  ContextExtensionDef,
  DeepReadonly,
  ErrorReporter,
  EventContext,
  EventDef,
  EventHandler,
  QueueFn,
  StoreErrorReport,
  StoreEvent,
  StoreOptions,
  StreamListener,
  Unsubscribe,
  createCommand,
  handledEvent,
  isCommandDef,
} from "./types";
import { BuiltinEvent } from "./constants";
import {
  createSettledHandle,
  createSettlerRegistry,
} from "./command-handle";
import {
  CommandContextHost,
  CommandInvocation,
  createCommandInvocation,
} from "./command-context";
import {
  AfterHookName,
  applyCommandExtensions,
  applyEventExtensions,
  destroyExtensions,
  runAfterHooks,
} from "./extensions";
import {
  DEFAULT_SUSPEND_WARNING_MS,
  SuspensionGate,
  createSuspensionGate,
} from "./suspension";
import { freezeState } from "./freeze";
import { reportToConsole } from "./run-safe";

const _causalStack: string[] = [];

const noop: Unsubscribe = () => {};

type HandlerEntry<S> = {
  handler: CommandHandler<S>;
  options?: CommandHandlerOptions;
};

const defaultErrorReporter: ErrorReporter = (report) => {
  reportToConsole(`[commiq] unhandled ${report.source} error`, report.error);
};

export class StoreImpl<
  S,
  CmdCtx extends Record<string, unknown> = {},
  EvtCtx extends Record<string, unknown> = {},
> {
  private _state: S;
  private _commandHandlers = new Map<string, HandlerEntry<S>>();
  private _eventHandlers = new Map<symbol, EventHandler<S>[]>();
  private _streamListeners = new Set<StreamListener>();
  private _queue: Command<string, unknown>[] = [];
  private _processing = false;
  private _flushResolvers: Array<() => void> = [];
  private _currentCorrelationId: string | null = null;
  private _interruptControllers = new Map<string, AbortController>();
  private _contextExtensions: AnyContextExtension<S>[] = [];
  private _pendingEvents: StoreEvent[] = [];
  private _settlers = createSettlerRegistry();
  private _handlerDepth = 0;
  private _active = false;
  private _destroyed = false;
  private _onError: ErrorReporter;
  private _isReporting = false;
  private _gate: SuspensionGate;
  private _commandHost: CommandContextHost<S> = {
    getState: () => this.state,
    applyState: (next: S) => this._applyState(next),
    publish: (event: StoreEvent) => this._publish(event),
    createEvent: <D>(eventDef: EventDef<D>, data: D) =>
      this._createEvent(eventDef, data),
    reportDisposed: (operation: string, command: Command) =>
      this._reportDisposedContext(operation, command),
  };

  constructor(initialState: S, options?: StoreOptions) {
    this._state = freezeState(initialState);
    this._onError = options?.onError ?? defaultErrorReporter;
    this._gate = createSuspensionGate({
      warningMs: options?.suspendWarningMs ?? DEFAULT_SUSPEND_WARNING_MS,
      onWarn: (heldMs) => this._reportStalledGate(heldMs),
      onResume: () => this._schedule(),
    });
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

  get isSuspended(): boolean {
    return this._gate.isSuspended;
  }

  useExtension<
    TCommand extends Record<string, unknown> = {},
    TEvent extends Record<string, unknown> = {},
  >(
    ext: ContextExtensionDef<S, TCommand, TEvent>,
  ): StoreImpl<S, CmdCtx & TCommand, EvtCtx & TEvent> {
    if (this._active) {
      throw new Error("Cannot add extensions to an active store");
    }
    this._contextExtensions.push(ext);
    return this as StoreImpl<S, CmdCtx & TCommand, EvtCtx & TEvent>;
  }

  removeExtension<
    TCommand extends Record<string, unknown> = {},
    TEvent extends Record<string, unknown> = {},
  >(ext: ContextExtensionDef<S, TCommand, TEvent>): boolean {
    const index = this._contextExtensions.indexOf(ext);
    if (index === -1) return false;
    const [removed] = this._contextExtensions.splice(index, 1);
    this._destroyExtensions([removed]);
    return true;
  }

  suspend(): Unsubscribe {
    if (this._destroyed) {
      this._reportDestroyed("suspend()");
      return noop;
    }
    return this._gate.suspend();
  }

  replaceState(next: S): void {
    if (next === this._state) return;
    this._applyState(next);
    this._publish(this._createEvent<void>(BuiltinEvent.StateReset, undefined));
    this._schedule();
  }

  addCommandHandler<N extends string, D>(
    def: CommandDef<N, D>,
    handler: CommandHandler<S, D, CmdCtx>,
    options?: CommandHandlerOptions,
  ): this;
  addCommandHandler<D = unknown>(
    name: string,
    handler: CommandHandler<S, D, CmdCtx>,
    options?: CommandHandlerOptions,
  ): this;
  addCommandHandler(
    nameOrDef: string | CommandDef<string, never>,
    handler: CommandHandler<S, never, CmdCtx>,
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
    handler: EventHandler<S, D, EvtCtx>,
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
    handler: EventHandler<S, D, EvtCtx>,
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
    if (!this._processing && this._isQuiescent()) {
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
    this._gate.reset();

    for (const controller of this._interruptControllers.values()) {
      controller.abort();
    }
    this._interruptControllers.clear();

    this._queue.length = 0;
    this._pendingEvents.length = 0;
    this._streamListeners.clear();
    this._eventHandlers.clear();
    this._commandHandlers.clear();
    this._destroyExtensions(this._contextExtensions.splice(0));

    this._settlers.settleAll("discarded");
    this._resolveFlushers();
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
    return this._pendingEvents.length > 0 || this._canRunCommand();
  }

  private _canRunCommand(): boolean {
    return this._queue.length > 0 && !this._gate.isSuspended;
  }

  private _isQuiescent(): boolean {
    return this._queue.length === 0 && this._pendingEvents.length === 0;
  }

  private _resolveFlushers(): void {
    for (const resolve of this._flushResolvers.splice(0)) {
      resolve();
    }
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

    return this._settlers.register(queued);
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
      this._settlers.settle(command, "interrupted");
    }

    this._interruptControllers.get(name)?.abort();
  }

  private _schedule(): void {
    if (this._processing || this._destroyed || !this._hasWork()) return;
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

  private _reportStalledGate(heldMs: number): void {
    this._report({
      error: new Error(
        `Command processing has been suspended for more than ${heldMs}ms — a suspend() release was probably missed`,
      ),
      source: "suspendedQueue",
    });
  }

  private _reportDisposedContext(operation: string, command: Command): void {
    this._reportUnhandled({
      error: new Error(
        `${operation}() called after command "${command.name}" finished`,
      ),
      source: "disposedContext",
      command,
    });
  }

  private _destroyExtensions(
    extensions: ReadonlyArray<AnyContextExtension<S>>,
  ): void {
    destroyExtensions(extensions, (error) =>
      this._reportUnhandled({ error, source: "contextExtension" }),
    );
  }

  private _runAfterHooks(name: AfterHookName): Promise<void> {
    return runAfterHooks(this._contextExtensions, name, (error) =>
      this._reportUnhandled({ error, source: "contextExtension" }),
    );
  }

  private async _processQueue(): Promise<void> {
    this._processing = true;

    try {
      while (this._hasWork()) {
        await this._dispatchPending();
        if (this._canRunCommand()) {
          await this._processNextCommand();
        }
      }
    } finally {
      this._processing = false;
      this._currentCorrelationId = null;
      if (this._isQuiescent()) this._resolveFlushers();
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
      this._settlers.settle(command, "invalid");
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
      applyCommandExtensions(this._contextExtensions, invocation.ctx, command);
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

    this._settlers.settle(command, "handled");
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
    this._settlers.settle(command, "interrupted");
  }

  private _failCommand(command: Command, error: unknown): void {
    this._report({ error, source: "commandHandler", command });
    this._publish(
      this._createEvent(BuiltinEvent.CommandHandlingError, { command, error }),
    );
    this._settlers.settle(command, "failed", error);
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
    return createCommandInvocation(this._commandHost, command, signal);
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
      applyEventExtensions(this._contextExtensions, eventCtx, event);

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
): StoreImpl<S, {}, {}> {
  return new StoreImpl(initialState, options);
}
