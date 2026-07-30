import { vi } from "vitest";
import type { StreamListener } from "@naikidev/commiq";
import { createSerializer } from "../index";
import type { PersistableStore, StorageAdapter } from "../index";

export type TestState = { count: number };

export function stored(state: unknown, version = 0): string {
  return createSerializer()({ version, state });
}

export function readStored(raw: string | null): unknown {
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  return typeof parsed === "object" && parsed !== null
    ? Reflect.get(parsed, "state")
    : null;
}

export function readNumber(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const found: unknown = Reflect.get(value, key);
  return typeof found === "number" ? found : undefined;
}

export type SpyStorage = StorageAdapter & {
  setItem: ReturnType<typeof vi.fn>;
  entries: Map<string, string>;
  emit: (value: string | null) => void;
  subscriberCount: () => number;
};

export function createSpyStorage(
  options: { async?: boolean; withSubscribe?: boolean } = {},
): SpyStorage {
  const entries = new Map<string, string>();
  const subscribers = new Set<(value: string | null) => void>();

  const setItem = vi.fn((key: string, value: string) => {
    entries.set(key, value);
    return options.async === true ? Promise.resolve() : undefined;
  });

  const adapter: SpyStorage = {
    getItem: (key) => {
      const value = entries.get(key) ?? null;
      return options.async === true ? Promise.resolve(value) : value;
    },
    setItem,
    removeItem: (key) => {
      entries.delete(key);
    },
    entries,
    emit: (value) => {
      for (const subscriber of subscribers) subscriber(value);
    },
    subscriberCount: () => subscribers.size,
  };

  if (options.withSubscribe === true) {
    adapter.subscribe = (_key, onChange) => {
      subscribers.add(onChange);
      return () => subscribers.delete(onChange);
    };
  }

  return adapter;
}

export type FakeStore = PersistableStore<TestState> & {
  listenerCount: () => number;
  readonly isSuspended: boolean;
};

export function createFakeStore(initial: TestState): FakeStore {
  const listeners = new Set<StreamListener>();
  let current = initial;
  let held = 0;

  return {
    get state() {
      return current;
    },
    get isSuspended() {
      return held > 0;
    },
    replaceState: (next) => {
      current = next;
    },
    suspend: () => {
      held += 1;
      let isReleased = false;
      return () => {
        if (isReleased) return;
        isReleased = true;
        held -= 1;
      };
    },
    openStream: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    closeStream: (listener) => {
      listeners.delete(listener);
    },
    listenerCount: () => listeners.size,
  };
}
