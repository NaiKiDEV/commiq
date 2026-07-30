import { BuiltinEventName } from "@naikidev/commiq";
import type { StoreEvent, StreamListener } from "@naikidev/commiq";
import {
  onCommandHandled,
  onCommandHandlingError,
  onCommandInterrupted,
  onCommandStarted,
  onInvalidCommand,
} from "./command-events";
import {
  ignoreEvent,
  onDomainEvent,
  onEventHandlingError,
  onUnhandledError,
} from "./domain-events";
import type { EventHandler, HandlerDeps } from "./deps";

const HANDLERS = new Map<string, EventHandler>([
  [BuiltinEventName.CommandStarted, onCommandStarted],
  [BuiltinEventName.CommandHandled, onCommandHandled],
  [BuiltinEventName.CommandHandlingError, onCommandHandlingError],
  [BuiltinEventName.CommandInterrupted, onCommandInterrupted],
  [BuiltinEventName.InvalidCommand, onInvalidCommand],
  [BuiltinEventName.EventHandlingError, onEventHandlingError],
  [BuiltinEventName.UnhandledError, onUnhandledError],
  [BuiltinEventName.StateReset, ignoreEvent],
]);

export function createStoreListener(deps: HandlerDeps): StreamListener {
  return (event: StoreEvent): void => {
    deps.tracker.sweep();
    const handler = HANDLERS.get(event.name) ?? onDomainEvent;
    handler(deps, event);
  };
}
