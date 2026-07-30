import type {
  DeepReadonly,
  StreamListener,
  Unsubscribe,
} from "@naikidev/commiq";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: number;
};

export type LoggerOptions = {
  onLog?: (entry: LogEntry) => void;
};

export type CommandMeta = {
  commandName: string;
  correlationId: string;
  causedBy: string | null;
  timestamp: number;
};

export type CheckOptions = {
  enabled?: boolean;
};

export type HistoryOptions = {
  maxEntries?: number;
};

export type StateHistory<S> = {
  readonly entries: ReadonlyArray<DeepReadonly<S>>;
  readonly previous: DeepReadonly<S> | undefined;
  clear: () => void;
};

export type ExtensionTarget<S> = {
  readonly state: DeepReadonly<S>;
  openStream: (listener: StreamListener) => Unsubscribe;
};
