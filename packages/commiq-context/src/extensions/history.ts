import { BuiltinEventName } from "@naikidev/commiq";
import type { DeepReadonly } from "@naikidev/commiq";
import type {
  ContextExtensionFactory,
  HistoryOptions,
  StateHistory,
} from "../types";

const DEFAULT_MAX_ENTRIES = 10;

type HistoryExtProps<S> = {
  history: StateHistory<S>;
};

export function withHistory<S>(
  options?: HistoryOptions,
): ContextExtensionFactory<S, HistoryExtProps<S>, HistoryExtProps<S>> {
  const maxEntries = Math.max(
    1,
    Math.floor(options?.maxEntries ?? DEFAULT_MAX_ENTRIES),
  );

  return (target) => {
    let buffer: DeepReadonly<S>[] = [target.state];

    const record = (next: DeepReadonly<S>): void => {
      if (buffer[buffer.length - 1] === next) return;
      buffer.push(next);
      if (buffer.length > maxEntries) buffer.shift();
    };

    const unsubscribe = target.openStream((event) => {
      if (event.name !== BuiltinEventName.StateChanged) return;
      record(target.state);
    });

    const history: StateHistory<S> = {
      get entries() {
        return [...buffer];
      },
      get previous() {
        return buffer.length > 1 ? buffer[buffer.length - 2] : undefined;
      },
      clear: () => {
        buffer = buffer.length > 0 ? buffer.slice(-1) : [];
      },
    };

    const props: HistoryExtProps<S> = { history };

    return {
      command: () => props,
      event: () => props,
      destroy: () => {
        unsubscribe();
        buffer = [];
      },
    };
  };
}
