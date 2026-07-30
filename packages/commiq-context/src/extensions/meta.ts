import type { CommandMeta, ContextExtensionFactory } from "../types";

type MetaExtProps = {
  meta: CommandMeta;
};

export function withMeta<S>(): ContextExtensionFactory<
  S,
  MetaExtProps,
  MetaExtProps
> {
  return () => ({
    command: (_ctx, command) => ({
      meta: {
        commandName: command.name,
        correlationId: command.correlationId,
        causedBy: command.causedBy,
        timestamp: Date.now(),
      },
    }),
    event: (_ctx, event) => ({
      meta: {
        commandName: event.name,
        correlationId: event.correlationId,
        causedBy: event.causedBy,
        timestamp: event.timestamp,
      },
    }),
  });
}
