import { useEffect, useState } from "react";
import type { Command, StoreEvent } from "@naikidev/commiq";
import { BuiltinEventName } from "@naikidev/commiq";
import { isolate } from "./internal/rethrow-async";
import { useResolvedStore } from "./internal/use-resolved-store";
import type { CommandSource, CommandStatusSnapshot, StoreSource } from "./types";

const IDLE: CommandStatusSnapshot = {
  pending: false,
  error: null,
  lastCompletedAt: null,
};

const TERMINAL_EVENT_NAMES: ReadonlySet<string> = new Set<string>([
  BuiltinEventName.CommandHandled,
  BuiltinEventName.CommandHandlingError,
  BuiltinEventName.CommandInterrupted,
  BuiltinEventName.InvalidCommand,
]);

function carriesCommand(
  event: StoreEvent,
): event is StoreEvent<{ command: Command }> {
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null || !("command" in data)) {
    return false;
  }
  const command: unknown = data.command;
  return typeof command === "object" && command !== null && "name" in command;
}

function errorOf(event: StoreEvent): unknown {
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null || !("error" in data)) {
    return null;
  }
  return data.error;
}

export function useCommandStatus<S>(
  source: StoreSource<S>,
  command: CommandSource,
): CommandStatusSnapshot {
  const store = useResolvedStore<S>(source);
  const commandName = typeof command === "string" ? command : command.name;
  const [snapshot, setSnapshot] = useState<CommandStatusSnapshot>(IDLE);

  useEffect(() => {
    const inFlight = new Set<string>();
    setSnapshot(IDLE);

    return store.openStream(
      isolate((event) => {
        if (!carriesCommand(event)) return;
        if (event.data.command.name !== commandName) return;

        const { correlationId } = event.data.command;

        if (event.name === BuiltinEventName.CommandStarted) {
          inFlight.add(correlationId);
          setSnapshot((prev) => ({ ...prev, pending: true, error: null }));
          return;
        }

        if (!TERMINAL_EVENT_NAMES.has(event.name)) return;

        inFlight.delete(correlationId);
        setSnapshot({
          pending: inFlight.size > 0,
          error: errorOf(event),
          lastCompletedAt: event.timestamp,
        });
      }),
    );
  }, [store, commandName]);

  return snapshot;
}
