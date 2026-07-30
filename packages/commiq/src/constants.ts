import { createEvent } from "./types";
import type {
  Command,
  StateChangedData,
  StoreErrorReport,
  StoreEvent,
} from "./types";

export const BuiltinEventName = {
  StateChanged: "stateChanged",
  CommandHandled: "commandHandled",
  CommandStarted: "commandStarted",
  InvalidCommand: "invalidCommand",
  CommandHandlingError: "commandHandlingError",
  EventHandlingError: "eventHandlingError",
  UnhandledError: "unhandledError",
  StateReset: "stateReset",
  CommandInterrupted: "commandInterrupted",
} as const;

export const BuiltinEvent = {
  StateChanged: createEvent<StateChangedData<unknown>>(BuiltinEventName.StateChanged),
  CommandHandled: createEvent<{ command: Command }>(BuiltinEventName.CommandHandled),
  CommandStarted: createEvent<{ command: Command }>(BuiltinEventName.CommandStarted),
  InvalidCommand: createEvent<{ command: Command }>(BuiltinEventName.InvalidCommand),
  CommandHandlingError: createEvent<{ command: Command; error: unknown }>(
    BuiltinEventName.CommandHandlingError,
  ),
  EventHandlingError: createEvent<{ event: StoreEvent; error: unknown }>(
    BuiltinEventName.EventHandlingError,
  ),
  UnhandledError: createEvent<StoreErrorReport>(BuiltinEventName.UnhandledError),
  StateReset: createEvent(BuiltinEventName.StateReset),
  CommandInterrupted: createEvent<{ command: Command; phase: "queued" | "running" }>(
    BuiltinEventName.CommandInterrupted,
  ),
} as const;

export const RESERVED_COMMAND_CONTEXT_KEYS = new Set(["state", "setState", "emit", "signal"]);
export const RESERVED_EVENT_CONTEXT_KEYS = new Set(["state", "queue"]);
