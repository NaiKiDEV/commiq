import type {
  Devtools,
  DevtoolsErrorHandler,
  DevtoolsMessage,
  DevtoolsOptions,
  DevtoolsStore,
  StateSnapshot,
  TimelineEntry,
} from "./types";
import { EventCollector } from "./collector";
import { windowMessageTransport } from "./transport";
import { createSnapshot } from "./snapshot";
import { sendSafely } from "./serialize";

const defaultOnError: DevtoolsErrorHandler = (error) => {
  console.warn("[commiq-devtools]", error);
};

export function createDevtools(options: DevtoolsOptions = {}): Devtools {
  const transport = options.transport ?? windowMessageTransport();
  const snapshotMode = options.snapshotMode ?? "safe";
  const logToConsole = options.logToConsole ?? false;
  const onError = options.onError ?? defaultOnError;

  const send = (message: DevtoolsMessage): void => {
    sendSafely((payload) => transport.send(payload), message, onError);
  };

  const collector = new EventCollector({
    maxEvents: options.maxEvents,
    maxSnapshots: options.maxSnapshots,
    snapshotMode,
    detectAliasedState: options.detectAliasedState,
    onError,
    onEntry: (entry) => {
      send({ type: "EVENT", entry });
      if (logToConsole) {
        logEntry(entry);
      }
    },
  });

  function connect(store: DevtoolsStore, storeName: string): void {
    collector.connect(store, storeName);
    send({
      type: "STORE_CONNECTED",
      storeName,
      initialState: createSnapshot(store.state, snapshotMode),
    });
  }

  function disconnect(storeName: string): void {
    if (!collector.isConnected(storeName)) {
      return;
    }
    collector.disconnect(storeName);
    send({ type: "STORE_DISCONNECTED", storeName });
  }

  function clear(): void {
    collector.clear();
    send({ type: "CLEARED" });
  }

  function destroy(): void {
    for (const storeName of collector.getConnectedStores()) {
      collector.disconnect(storeName);
      send({ type: "STORE_DISCONNECTED", storeName });
    }
    collector.destroy();
    transport.destroy();
  }

  return {
    connect,
    disconnect,
    clear,
    destroy,
    getVersion(): number {
      return collector.getVersion();
    },
    getTimeline(storeName?: string): readonly TimelineEntry[] {
      return collector.getTimeline(storeName);
    },
    getChain(correlationId: string): readonly TimelineEntry[] {
      return collector.getChain(correlationId);
    },
    getStateHistory(storeName: string): readonly StateSnapshot[] {
      return collector.getStateHistory(storeName);
    },
    getConnectedStores(): readonly string[] {
      return collector.getConnectedStores();
    },
  };
}

function logEntry(entry: TimelineEntry): void {
  const time = new Date(entry.timestamp).toISOString().slice(11, 23);
  const cause = entry.causedBy ? ` (caused by ${entry.causedBy.slice(0, 8)})` : "";
  console.log(
    `[${time}] ${entry.storeName} | ${entry.name} ${entry.correlationId.slice(0, 8)}${cause}`,
  );
}
