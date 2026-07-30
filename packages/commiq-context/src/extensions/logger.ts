import type {
  ContextExtensionFactory,
  LogEntry,
  LoggerOptions,
  LogLevel,
} from "../types";

type LoggerExtProps = {
  log: (level: LogLevel, message: string) => void;
};

export function withLogger<S>(
  options?: LoggerOptions,
): ContextExtensionFactory<S, LoggerExtProps, LoggerExtProps> {
  const handler = options?.onLog;

  const props: LoggerExtProps = {
    log: (level: LogLevel, message: string) => {
      if (!handler) return;
      const entry: LogEntry = { level, message, timestamp: Date.now() };
      handler(entry);
    },
  };

  return () => ({
    command: () => props,
    event: () => props,
  });
}
