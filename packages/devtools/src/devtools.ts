import type { StoreEvent, StreamListener } from "@naikidev/commiq";
import { BuiltinEventName } from "@naikidev/commiq";
import type { DevtoolsOptions, TimelineEntry, StateSnapshot, Transport } from "./types";
import { EventCollector } from "./collector";
import { windowMessageTransport } from "./transport";

type Streamable = {
  readonly state: unknown;
  openStream: (listener: StreamListener) => void;
  closeStream: (listener: StreamListener) => void;
}

type StoreConnection = {
  store: Streamable;
  listener: StreamListener;
}

export function createDevtools(options: DevtoolsOptions = {}) {
  const transport: Transport = options.transport ?? windowMessageTransport();
  const maxEvents = options.maxEvents ?? 1000;
  const logToConsole = options.logToConsole ?? false;

  const collector = new EventCollector({ maxEvents });
  const connections = new Map<string, StoreConnection>();

  function connect(store: Streamable, storeName: string): void {
    if (connections.has(storeName)) {
      disconnect(storeName);
    }

    collector.connect(store, storeName);

    const listener: StreamListener = (event: StoreEvent) => {
      const entry: TimelineEntry = {
        storeName,
        type: isCommandEvent(event.name) ? "command" : "event",
        name: event.name,
        data: event.data,
        correlationId: event.correlationId,
        causedBy: event.causedBy,
        timestamp: event.timestamp,
      };

      if (event.name === BuiltinEventName.StateChanged) {
        const stateData = event.data as { prev: unknown; next: unknown };
        entry.stateBefore = stateData.prev;
        entry.stateAfter = stateData.next;
      }

      transport.send({ type: "EVENT", entry });

      if (logToConsole) {
        const time = new Date(event.timestamp).toISOString().slice(11, 23);
        const cause = event.causedBy ? ` (caused by ${event.causedBy.slice(0, 8)})` : "";
        console.log(
          `[${time}] ${storeName} | ${event.name} ${event.correlationId.slice(0, 8)}${cause}`
        );
      }
    };

    store.openStream(listener);
    connections.set(storeName, { store, listener });

    transport.send({
      type: "STORE_CONNECTED",
      storeName,
      initialState: store.state,
    });
  }

  function disconnect(storeName: string): void {
    const connection = connections.get(storeName);
    if (connection) {
      connection.store.closeStream(connection.listener);
      connections.delete(storeName);
    }
    collector.disconnect(storeName);
    transport.send({ type: "STORE_DISCONNECTED", storeName });
  }

  function destroy(): void {
    for (const storeName of [...connections.keys()]) {
      disconnect(storeName);
    }
    collector.destroy();
    transport.destroy();
  }

  function isCommandEvent(name: string): boolean {
    return (
      name === BuiltinEventName.CommandStarted ||
      name === BuiltinEventName.CommandHandled ||
      name === BuiltinEventName.InvalidCommand ||
      name === BuiltinEventName.CommandHandlingError
    );
  }

  return {
    connect,
    disconnect,
    destroy,
    getTimeline(storeName?: string): TimelineEntry[] {
      return collector.getTimeline(storeName);
    },
    getChain(correlationId: string): TimelineEntry[] {
      return collector.getChain(correlationId);
    },
    getStateHistory(storeName: string): StateSnapshot[] {
      return collector.getStateHistory(storeName);
    },
  };
}
