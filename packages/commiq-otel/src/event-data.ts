export type CommandInfo = {
  name: string;
  correlationId: string;
  causedBy: string | null;
}

export type InterruptedInfo = {
  command: CommandInfo;
  phase: string;
}

export type FailedEventInfo = {
  name: string;
  correlationId: string;
}

export function readCommand(data: unknown): CommandInfo | null {
  const command = readProperty(data, "command");
  const name = readString(command, "name");
  const correlationId = readString(command, "correlationId");
  if (name === null || correlationId === null) return null;
  return { name, correlationId, causedBy: readString(command, "causedBy") };
}

export function readInterrupted(data: unknown): InterruptedInfo | null {
  const command = readCommand(data);
  if (command === null) return null;
  return { command, phase: readString(data, "phase") ?? "unknown" };
}

export function readError(data: unknown): unknown {
  return readProperty(data, "error");
}

export function readFailedEvent(data: unknown): FailedEventInfo | null {
  const event = readProperty(data, "event");
  const name = readString(event, "name");
  const correlationId = readString(event, "correlationId");
  if (name === null || correlationId === null) return null;
  return { name, correlationId };
}

export function readErrorSource(data: unknown): string {
  return readString(data, "source") ?? "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined;
  return value[key];
}

function readString(value: unknown, key: string): string | null {
  const property = readProperty(value, key);
  return typeof property === "string" && property.length > 0 ? property : null;
}
