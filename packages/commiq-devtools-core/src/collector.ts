import type { StoreEvent, StreamListener } from "@naikidev/commiq";
import { BuiltinEvent, BuiltinEventName, matchEvent } from "@naikidev/commiq";
import type {
  DevtoolsErrorHandler,
  DevtoolsStore,
  SnapshotMode,
  StateSnapshot,
  TimelineEntry,
} from "./types";
import { RingBuffer } from "./ring-buffer";
import { createSnapshot } from "./snapshot";
import { eventIdFor } from "./event-id";
import { buildChainIndex, collectChain, type ChainIndex } from "./chain";

export const DEFAULT_MAX_EVENTS = 1000;
export const DEFAULT_MAX_SNAPSHOTS = 100;

export type EventCollectorOptions = {
  maxEvents?: number;
  maxSnapshots?: number;
  snapshotMode?: SnapshotMode;
  onEntry?: (entry: TimelineEntry) => void;
  onError?: DevtoolsErrorHandler;
}

type StoreConnection = {
  store: DevtoolsStore;
  listener: StreamListener;
}

type TimelineCacheEntry = {
  version: number;
  entries: readonly TimelineEntry[];
}

type StateHistoryCacheEntry = {
  version: number;
  entries: readonly StateSnapshot[];
}

const commandEventNames: ReadonlySet<string> = new Set([
  BuiltinEventName.CommandStarted,
  BuiltinEventName.CommandHandled,
  BuiltinEventName.InvalidCommand,
  BuiltinEventName.CommandHandlingError,
  BuiltinEventName.CommandInterrupted,
]);

const noop: DevtoolsErrorHandler = () => {};

export function clampCount(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

export class EventCollector {
  private readonly _maxEvents: number;
  private readonly _maxSnapshots: number;
  private readonly _snapshotMode: SnapshotMode;
  private readonly _onError: DevtoolsErrorHandler;
  private _onEntry: ((entry: TimelineEntry) => void) | undefined;

  private _timeline: RingBuffer<TimelineEntry>;
  private _stateHistory = new Map<string, RingBuffer<StateSnapshot>>();
  private _connections = new Map<string, StoreConnection>();
  private _timelineCache = new Map<string, TimelineCacheEntry>();
  private _stateHistoryCache = new Map<string, StateHistoryCacheEntry>();
  private _chainIndex: { version: number; index: ChainIndex } | undefined;
  private _version = 0;
  private _seq = 0;

  constructor(options: EventCollectorOptions = {}) {
    this._maxEvents = clampCount(options.maxEvents, DEFAULT_MAX_EVENTS);
    this._maxSnapshots = clampCount(options.maxSnapshots, DEFAULT_MAX_SNAPSHOTS);
    this._snapshotMode = options.snapshotMode ?? "safe";
    this._onEntry = options.onEntry;
    this._onError = options.onError ?? noop;
    this._timeline = new RingBuffer<TimelineEntry>(this._maxEvents);
  }

  connect(store: DevtoolsStore, storeName: string): void {
    if (this._connections.has(storeName)) {
      this.disconnect(storeName);
    }

    const listener: StreamListener = (event: StoreEvent) => {
      this._onEvent(storeName, event);
    };

    store.openStream(listener);
    this._connections.set(storeName, { store, listener });
  }

  disconnect(storeName: string): void {
    const connection = this._connections.get(storeName);
    if (!connection) {
      return;
    }
    connection.store.closeStream(connection.listener);
    this._connections.delete(storeName);
  }

  isConnected(storeName: string): boolean {
    return this._connections.has(storeName);
  }

  getConnectedStores(): string[] {
    return [...this._connections.keys()];
  }

  getVersion(): number {
    return this._version;
  }

  getTimeline(storeName?: string): readonly TimelineEntry[] {
    const key = storeName ?? "";
    const cached = this._timelineCache.get(key);
    if (cached && cached.version === this._version) {
      return cached.entries;
    }
    const all = this._timeline.toArray();
    const entries = storeName ? all.filter((e) => e.storeName === storeName) : all;
    this._timelineCache.set(key, { version: this._version, entries });
    return entries;
  }

  getChain(correlationId: string): readonly TimelineEntry[] {
    if (!this._chainIndex || this._chainIndex.version !== this._version) {
      this._chainIndex = {
        version: this._version,
        index: buildChainIndex(this.getTimeline()),
      };
    }
    return collectChain(this._chainIndex.index, correlationId);
  }

  getStateHistory(storeName: string): readonly StateSnapshot[] {
    const cached = this._stateHistoryCache.get(storeName);
    if (cached && cached.version === this._version) {
      return cached.entries;
    }
    const entries = this._stateHistory.get(storeName)?.toArray() ?? [];
    this._stateHistoryCache.set(storeName, { version: this._version, entries });
    return entries;
  }

  clear(): void {
    this._timeline.clear();
    this._stateHistory.clear();
    this._timelineCache.clear();
    this._stateHistoryCache.clear();
    this._chainIndex = undefined;
    this._version += 1;
  }

  destroy(): void {
    for (const storeName of [...this._connections.keys()]) {
      this.disconnect(storeName);
    }
    this._onEntry = undefined;
    this.clear();
  }

  private _onEvent(storeName: string, event: StoreEvent): void {
    this._seq += 1;
    const entry = this._buildEntry(storeName, event);

    if (matchEvent(event, BuiltinEvent.StateChanged)) {
      this._recordSnapshot(storeName, entry.stateAfter, event);
    }

    this._timeline.push(entry);
    this._version += 1;

    const onEntry = this._onEntry;
    if (!onEntry) {
      return;
    }
    try {
      onEntry(entry);
    } catch (error) {
      this._onError(error);
    }
  }

  private _buildEntry(storeName: string, event: StoreEvent): TimelineEntry {
    const base = {
      seq: this._seq,
      storeName,
      type: commandEventNames.has(event.name) ? ("command" as const) : ("event" as const),
      name: event.name,
      eventId: eventIdFor(event.id, event.name),
      correlationId: event.correlationId,
      causedBy: event.causedBy,
      timestamp: event.timestamp,
    };

    if (matchEvent(event, BuiltinEvent.StateChanged)) {
      const stateBefore = this._snapshot(event.data.prev);
      const stateAfter = this._snapshot(event.data.next);
      return { ...base, data: { prev: stateBefore, next: stateAfter }, stateBefore, stateAfter };
    }

    return { ...base, data: this._snapshot(event.data) };
  }

  private _recordSnapshot(storeName: string, state: unknown, event: StoreEvent): void {
    const history =
      this._stateHistory.get(storeName) ?? new RingBuffer<StateSnapshot>(this._maxSnapshots);
    history.push({
      storeName,
      state,
      timestamp: event.timestamp,
      correlationId: event.correlationId,
    });
    this._stateHistory.set(storeName, history);
  }

  private _snapshot(value: unknown): unknown {
    return createSnapshot(value, this._snapshotMode);
  }
}
