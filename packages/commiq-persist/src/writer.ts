import { isPromiseLike } from "./internal";
import type { Report } from "./internal";
import type { DeepReadonly } from "@naikidev/commiq";
import type { PersistedSnapshot, StorageAdapter } from "./types";

export type WriterConfig<S> = {
  key: string;
  storage: StorageAdapter;
  debounce: number;
  version: number;
  serialize: (snapshot: PersistedSnapshot) => string;
  readState: () => DeepReadonly<S>;
  onWrite: (raw: string) => void;
  report: Report;
};

export type Writer = {
  schedule: () => void;
  flush: () => Promise<void>;
  clear: () => Promise<void>;
  cancel: () => void;
};

export function createWriter<S>(config: WriterConfig<S>): Writer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Promise<void> = Promise.resolve();

  const cancel = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const write = (): Promise<void> => {
    const snapshot: PersistedSnapshot = {
      version: config.version,
      state: config.readState(),
    };

    let raw: string;
    try {
      raw = config.serialize(snapshot);
    } catch (error) {
      config.report("serialize", error);
      return Promise.resolve();
    }

    config.onWrite(raw);

    try {
      const result = config.storage.setItem(config.key, raw);
      if (!isPromiseLike(result)) return Promise.resolve();
      return result.then(
        () => undefined,
        (error: unknown) => config.report("write", error, raw),
      );
    } catch (error) {
      config.report("write", error, raw);
      return Promise.resolve();
    }
  };

  const schedule = () => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      pending = write();
    }, config.debounce);
  };

  const flush = async (): Promise<void> => {
    if (timer !== null) {
      cancel();
      pending = write();
    }
    await pending;
  };

  const clear = async (): Promise<void> => {
    cancel();
    const { removeItem } = config.storage;
    if (removeItem === undefined) {
      config.report(
        "unsupported",
        new Error("Storage adapter does not implement removeItem()"),
      );
      return;
    }
    try {
      await removeItem.call(config.storage, config.key);
    } catch (error) {
      config.report("remove", error);
    }
  };

  return { schedule, flush, clear, cancel };
}
