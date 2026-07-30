import { BuiltinEventName } from "@naikidev/commiq";

export const BUILTIN_EVENT_NAMES: ReadonlySet<string> = new Set<string>(
  Object.values(BuiltinEventName),
);

export const ERROR_EVENT_NAMES: ReadonlySet<string> = new Set<string>([
  BuiltinEventName.InvalidCommand,
  BuiltinEventName.CommandHandlingError,
  BuiltinEventName.EventHandlingError,
  BuiltinEventName.UnhandledError,
]);

export const COMMAND_LIFECYCLE_EVENT_NAMES: ReadonlySet<string> = new Set<string>([
  BuiltinEventName.CommandStarted,
  BuiltinEventName.CommandHandled,
  BuiltinEventName.InvalidCommand,
  BuiltinEventName.CommandHandlingError,
  BuiltinEventName.CommandInterrupted,
]);

export function isBuiltinEventName(name: string): boolean {
  return BUILTIN_EVENT_NAMES.has(name);
}

export function isErrorEventName(name: string): boolean {
  return ERROR_EVENT_NAMES.has(name);
}
