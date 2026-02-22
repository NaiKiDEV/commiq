export interface TimelineEntry {
  storeName: string;
  type: "command" | "event";
  name: string;
  data: unknown;
  correlationId: string;
  causedBy: string | null;
  timestamp: number;
  stateBefore?: unknown;
  stateAfter?: unknown;
}

export interface StateSnapshot {
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
  | { type: "REQUEST_STATE"; storeName: string }
  | { type: "TIME_TRAVEL"; storeName: string; stateIndex: number };

export interface Transport {
  send(message: DevtoolsMessage): void;
  onMessage(handler: (message: DevtoolsMessage) => void): () => void;
  destroy(): void;
}

export interface DevtoolsOptions {
  transport?: Transport;
  maxEvents?: number;
  logToConsole?: boolean;
}
