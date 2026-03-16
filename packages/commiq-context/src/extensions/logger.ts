import type { ContextExtensionDef } from "@naikidev/commiq";
import type { LogLevel, LogEntry, LoggerOptions } from "../types";

type LoggerExtProps = {
  log: (level: LogLevel, message: string) => void;
};

export function withLogger<S>(
  options?: LoggerOptions,
): ContextExtensionDef<S, LoggerExtProps> {
  const handler = options?.onLog;

  const createLog = (): LoggerExtProps => ({
    log: (level: LogLevel, message: string) => {
      const entry: LogEntry = {
        level,
        message,
        timestamp: Date.now(),
      };
      if (handler) {
        handler(entry);
      }
    },
  });

  return {
    command: () => createLog(),
    event: () => createLog(),
  };
}
