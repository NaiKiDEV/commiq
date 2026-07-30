import {
  BuiltinEventName,
  type Command,
  type QueueFn,
  type StreamListener,
  type Unsubscribe,
} from "@naikidev/commiq";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";

export type DevtoolsStoreLike = {
  readonly state: unknown;
  queue: QueueFn;
  flush: () => Promise<void>;
  openStream: (listener: StreamListener) => Unsubscribe;
  closeStream: (listener: StreamListener) => void;
}

export type DevtoolsStoreRegistry = Record<string, DevtoolsStoreLike>;

export type PinActions = {
  pinnedKeys: Set<string>;
  onTogglePin: (key: string) => void;
}

export function entryKey(entry: TimelineEntry): string {
  return `${entry.seq}-${entry.correlationId}`;
}

export type CommandStartedData = {
  command: Command;
}

export function getCommandFromEntry(entry: TimelineEntry): Command | undefined {
  if (entry.name !== BuiltinEventName.CommandStarted) return undefined;
  const data = entry.data as CommandStartedData | undefined;
  return data?.command;
}
