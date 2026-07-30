import type {
  Command,
  CommandContext,
  CommandDef,
  CommandHandler,
  CommandHandlerOptions,
  ContextExtensionDef,
  EventContext,
  EventDef,
  EventHandler,
  StoreEvent,
  StoreImpl,
} from "@naikidev/commiq";
import type {
  ContextExtension,
  ContextExtensionFactory,
  ExtendedStore,
} from "./types";

type AnyExtension<S> = ContextExtension<
  S,
  Record<string, unknown>,
  Record<string, unknown>
>;

type AnyFactory<S> = ContextExtensionFactory<
  S,
  Record<string, unknown>,
  Record<string, unknown>
>;

type AfterHookName = "afterCommand" | "afterEvent";

type HostScope<S, Ctx extends Record<string, unknown>> = {
  store: StoreImpl<S, Ctx>;
  attach: (factory: AnyFactory<S>) => void;
  destroy: () => void;
};

function mergeProps(
  parts: Array<Record<string, unknown> | undefined>,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const part of parts) {
    if (!part) continue;
    for (const key of Object.keys(part)) {
      if (key in props) {
        throw new Error(
          `Context extension key "${key}" conflicts with another extension`,
        );
      }
      props[key] = part[key];
    }
  }
  return props;
}

async function runHooks<S>(
  instances: AnyExtension<S>[],
  name: AfterHookName,
): Promise<void> {
  const errors: unknown[] = [];
  for (const instance of instances) {
    const hook = instance[name];
    if (!hook) continue;
    try {
      await hook();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw errors[0];
}

function createScope<S, Ctx extends Record<string, unknown>>(
  store: StoreImpl<S, Ctx>,
): HostScope<S, Ctx> {
  const instances: AnyExtension<S>[] = [];
  let isRegistered = false;
  let isDestroyed = false;

  const aggregate: ContextExtensionDef<S> = {
    command: (ctx: CommandContext<S>, command: Command) =>
      mergeProps(instances.map((instance) => instance.command?.(ctx, command))),
    event: (ctx: EventContext<S>, event: StoreEvent) =>
      mergeProps(instances.map((instance) => instance.event?.(ctx, event))),
    afterCommand: () => runHooks(instances, "afterCommand"),
    afterEvent: () => runHooks(instances, "afterEvent"),
  };

  return {
    store,
    attach: (factory) => {
      if (isDestroyed) {
        throw new Error(
          "Cannot add extensions to a destroyed extension host",
        );
      }
      if (!isRegistered) {
        store.useExtension(aggregate);
        isRegistered = true;
      }
      instances.push(factory(store));
    },
    destroy: () => {
      if (isDestroyed) return;
      isDestroyed = true;
      const errors: unknown[] = [];
      for (const instance of instances) {
        try {
          instance.destroy?.();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) throw errors[0];
    },
  };
}

function createHost<
  S,
  Ctx extends Record<string, unknown>,
  TCommand extends Ctx & Record<string, unknown>,
  TEvent extends Ctx & Record<string, unknown>,
>(scope: HostScope<S, Ctx>): ExtendedStore<S, TCommand, TEvent> {
  return {
    use: <TC extends Record<string, unknown>, TE extends Record<string, unknown>>(
      factory: ContextExtensionFactory<S, TC, TE>,
    ) => {
      scope.attach(factory);
      return createHost<S, Ctx, TCommand & TC, TEvent & TE>(scope);
    },
    addCommandHandler: (
      nameOrDef: string | CommandDef<string, never>,
      handler: CommandHandler<S, never, TCommand>,
      options?: CommandHandlerOptions,
    ) => {
      const wrapped = handler as CommandHandler<S>;
      if (typeof nameOrDef === "string") {
        scope.store.addCommandHandler<never>(nameOrDef, wrapped, options);
      } else {
        scope.store.addCommandHandler(nameOrDef, wrapped, options);
      }
      return createHost<S, Ctx, TCommand, TEvent>(scope);
    },
    addEventHandler: <D>(
      eventDef: EventDef<D>,
      handler: EventHandler<S, D, TEvent>,
    ) => scope.store.addEventHandler(eventDef, handler as EventHandler<S>),
    destroy: () => scope.destroy(),
  };
}

export function extendStore<S, Ctx extends Record<string, unknown> = {}>(
  store: StoreImpl<S, Ctx>,
): ExtendedStore<S, Ctx, Ctx> {
  return createHost<S, Ctx, Ctx, Ctx>(createScope(store));
}
