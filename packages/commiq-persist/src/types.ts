export type StorageAdapter = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
};

export type PersistOptions<S> = {
  key: string;
  storage?: StorageAdapter;
  debounce?: number;
  serialize?: (state: S) => string;
  deserialize?: (raw: string) => S;
};

export type PersistResult = {
  destroy: () => void;
  hydrated: Promise<void>;
};
