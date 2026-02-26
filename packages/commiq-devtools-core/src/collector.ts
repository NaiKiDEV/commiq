import type { StoreEvent, StreamListener } from "@naikidev/commiq";
import { BuiltinEventName } from "@naikidev/commiq";
import type { TimelineEntry, StateSnapshot } from "./types";

type Streamable = {
  readonly state: unknown;
  openStream: (listener: StreamListener) => void;
  closeStream: (listener: StreamListener) => void;
}

type StoreConnection = {
  store: Streamable;
  listener: StreamListener;
}

export class EventCollector {
  private _timeline: TimelineEntry[] = [];
  private _stateHistory = new Map<string, StateSnapshot[]>();
  private _connections = new Map<string, StoreConnection>();
  private _maxEvents: number;

  constructor(options: { maxEvents: number }) {
    this._maxEvents = options.maxEvents;
  }

  connect(store: Streamable, storeName: string): void {
    if (this._connections.has(storeName)) {
      this.disconnect(storeName);
    }

    const listener: StreamListener = (event: StoreEvent) => {
      this._onEvent(store, storeName, event);
    };

    store.openStream(listener);
    this._connections.set(storeName, { store, listener });
  }

  disconnect(storeName: string): void {
    const connection = this._connections.get(storeName);
    if (connection) {
      connection.store.closeStream(connection.listener);
      this._connections.delete(storeName);
    }
  }

  getTimeline(storeName?: string): TimelineEntry[] {
    if (storeName) {
      return this._timeline.filter((e) => e.storeName === storeName);
    }
    return [...this._timeline];
  }

  getChain(correlationId: string): TimelineEntry[] {
    const result: TimelineEntry[] = [];
    for (const entry of this._timeline) {
      if (entry.correlationId === correlationId || entry.causedBy === correlationId) {
        result.push(entry);
      }
    }
    return result;
  }

  getStateHistory(storeName: string): StateSnapshot[] {
    return this._stateHistory.get(storeName) ?? [];
  }

  clear(): void {
    this._timeline = [];
    this._stateHistory.clear();
  }

  destroy(): void {
    for (const storeName of this._connections.keys()) {
      this.disconnect(storeName);
    }
    this.clear();
  }

  private _onEvent(_store: Streamable, storeName: string, event: StoreEvent): void {
    const entry: TimelineEntry = {
      storeName,
      type: this._isCommandEvent(event.name) ? "command" : "event",
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

      const history = this._stateHistory.get(storeName) ?? [];
      history.push({
        storeName,
        state: stateData.next,
        timestamp: event.timestamp,
        correlationId: event.correlationId,
      });
      this._stateHistory.set(storeName, history);
    }

    this._timeline.push(entry);

    while (this._timeline.length > this._maxEvents) {
      this._timeline.shift();
    }
  }

  private _isCommandEvent(name: string): boolean {
    return (
      name === BuiltinEventName.CommandStarted ||
      name === BuiltinEventName.CommandHandled ||
      name === BuiltinEventName.InvalidCommand ||
      name === BuiltinEventName.CommandHandlingError
    );
  }
}
