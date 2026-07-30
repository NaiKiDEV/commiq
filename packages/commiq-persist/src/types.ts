import type { DeepReadonly, Streamable, Unsubscribe } from "@naikidev/commiq";

export type StorageAdapter = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem?(key: string): void | Promise<void>;
  subscribe?(key: string, onChange: (value: string | null) => void): Unsubscribe;
};

export type PersistableStore<S> = Streamable & {
  readonly state: DeepReadonly<S>;
  replaceState(next: S): void;
};

export type PersistedSnapshot = {
  version: number;
  state: unknown;
};

export type PersistErrorSource =
  | "read"
  | "write"
  | "remove"
  | "serialize"
  | "deserialize"
  | "migrate"
  | "validate"
  | "merge"
  | "apply"
  | "hydrationRace"
  | "unsupported";

export type PersistErrorReport = {
  error: unknown;
  source: PersistErrorSource;
  key: string;
  raw?: string;
};

export type PersistErrorReporter = (report: PersistErrorReport) => void;

export type JsonReplacer = (key: string, value: unknown) => unknown;

export type JsonReviver = (key: string, value: unknown) => unknown;

export type MigrateFn<S> = (persisted: unknown, from: number) => S;

export type ValidateFn<S> = (raw: unknown) => S | null;

export type MergeFn<S> = (
  persisted: unknown,
  initial: DeepReadonly<S>,
) => S | null;

export type PersistOptions<S> = {
  key: string;
  storage?: StorageAdapter;
  debounce?: number;
  version?: number;
  migrate?: MigrateFn<S>;
  validate?: ValidateFn<S>;
  merge?: MergeFn<S>;
  replacer?: JsonReplacer;
  reviver?: JsonReviver;
  serialize?: (snapshot: PersistedSnapshot) => string;
  deserialize?: (raw: string) => unknown;
  clearOnCorrupt?: boolean;
  flushOnHide?: boolean;
  syncTabs?: boolean;
  onError?: PersistErrorReporter;
};

export type PersistResult = {
  destroy: () => void;
  flush: () => Promise<void>;
  clear: () => Promise<void>;
  hydrated: Promise<void>;
};
