import type { ContextExtensionDef } from "@naikidev/commiq";

type HistoryOptions = {
  maxEntries?: number;
};

type HistoryExtProps<S> = {
  history: {
    entries: ReadonlyArray<S>;
    previous: S | undefined;
  };
};

export function withHistory<S>(
  options?: HistoryOptions,
): ContextExtensionDef<S, HistoryExtProps<S>> {
  const maxEntries = options?.maxEntries ?? 10;
  const buffer: S[] = [];

  const snapshot = (state: S): HistoryExtProps<S> => {
    buffer.push(state);
    if (buffer.length > maxEntries) {
      buffer.shift();
    }
    return {
      history: {
        entries: [...buffer],
        previous: buffer.length > 1 ? buffer[buffer.length - 2] : undefined,
      },
    };
  };

  return {
    command: (ctx) => snapshot(ctx.state),
    event: (ctx) => snapshot(ctx.state),
  };
}
