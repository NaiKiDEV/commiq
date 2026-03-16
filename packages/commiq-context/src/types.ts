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
