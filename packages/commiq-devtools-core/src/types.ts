import type { StreamListener } from "@naikidev/commiq";

export type SnapshotMode = "safe" | "structured" | "none";

export type TimelineEntry = {
  seq: number;
  storeName: string;
  type: "command" | "event";
  name: string;
  eventId: string;
  data: unknown;
  correlationId: string;
  causedBy: string | null;
  timestamp: number;
  stateBefore?: unknown;
  stateAfter?: unknown;
}

export type StateSnapshot = {
  storeName: string;
  state: unknown;
  timestamp: number;
  correlationId: string;
}

export type DevtoolsMessage =
  | { type: "STORE_CONNECTED"; storeName: string; initialState: unknown }
  | { type: "EVENT"; entry: TimelineEntry }
  | { type: "STATE_SNAPSHOT"; storeName: string; state: unknown }
  | { type: "STORE_DISCONNECTED"; storeName: string }
  | { type: "CLEARED" }
  | { type: "REQUEST_STATE"; storeName: string }
  | { type: "TIME_TRAVEL"; storeName: string; stateIndex: number };

export type Transport = {
  send(message: DevtoolsMessage): void;
  onMessage(handler: (message: DevtoolsMessage) => void): () => void;
  destroy(): void;
}

export type DevtoolsStore = {
  readonly state: unknown;
  openStream: (listener: StreamListener) => void;
  closeStream: (listener: StreamListener) => void;
}

export type DevtoolsErrorHandler = (error: unknown) => void;

export type DevtoolsOptions = {
  transport?: Transport;
  maxEvents?: number;
  maxSnapshots?: number;
  snapshotMode?: SnapshotMode;
  detectAliasedState?: boolean;
  logToConsole?: boolean;
  onError?: DevtoolsErrorHandler;
}

export type Devtools = {
  connect(store: DevtoolsStore, storeName: string): void;
  disconnect(storeName: string): void;
  clear(): void;
  destroy(): void;
  getVersion(): number;
  getTimeline(storeName?: string): readonly TimelineEntry[];
  getChain(correlationId: string): readonly TimelineEntry[];
  getStateHistory(storeName: string): readonly StateSnapshot[];
  getConnectedStores(): readonly string[];
}
