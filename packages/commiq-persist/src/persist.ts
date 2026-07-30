import { BuiltinEvent, matchEvent } from "@naikidev/commiq";
import type { StreamListener, Unsubscribe } from "@naikidev/commiq";
import { defaultStorageAdapter } from "./adapters/web-storage";
import { mergeOverInitial, resolveHydration } from "./hydrate";
import type { HydrateConfig } from "./hydrate";
import { createReporter, isPromiseLike } from "./internal";
import type { Report } from "./internal";
import {
  LEGACY_VERSION,
  createDeserializer,
  createSerializer,
} from "./serialize";
import type {
  PersistOptions,
  PersistResult,
  PersistableStore,
  PersistedSnapshot,
  StorageAdapter,
} from "./types";
import { createWriter } from "./writer";
import type { Writer } from "./writer";

const defaultDebounce = 300;
const hideEvents = ["pagehide", "beforeunload"] as const;

type Resolved<S> = {
  key: string;
  storage: StorageAdapter;
  debounce: number;
  clearOnCorrupt: boolean;
  flushOnHide: boolean;
  syncTabs: boolean;
  report: Report;
  serialize: (snapshot: PersistedSnapshot) => string;
  hydrate: HydrateConfig<S>;
};

type Written = {
  last: string | null;
};

type Flags = {
  applying: boolean;
  awaitingRead: boolean;
  changed: boolean;
  destroyed: boolean;
};

function resolveOptions<S>(options: PersistOptions<S>): Resolved<S> {
  const report = createReporter(options.key, options.onError);
  return {
    key: options.key,
    storage: options.storage ?? defaultStorageAdapter(),
    debounce: options.debounce ?? defaultDebounce,
    clearOnCorrupt: options.clearOnCorrupt ?? true,
    flushOnHide: options.flushOnHide ?? true,
    syncTabs: options.syncTabs ?? false,
    report,
    serialize: options.serialize ?? createSerializer(options.replacer),
    hydrate: {
      version: options.version ?? LEGACY_VERSION,
      deserialize: options.deserialize ?? createDeserializer(options.reviver),
      migrate: options.migrate,
      validate: options.validate,
      merge: options.merge ?? mergeOverInitial,
      report,
    },
  };
}

function subscribeStream<S>(
  store: PersistableStore<S>,
  listener: StreamListener,
): Unsubscribe {
  const result = store.openStream(listener);
  return typeof result === "function"
    ? result
    : () => store.closeStream(listener);
}

function subscribeExternal(
  storage: StorageAdapter,
  key: string,
  onChange: (raw: string | null) => void,
  report: Report,
): Unsubscribe {
  const { subscribe } = storage;
  if (subscribe === undefined) {
    report(
      "unsupported",
      new Error(
        "syncTabs requires a storage adapter that implements subscribe()",
      ),
    );
    return () => {};
  }
  return subscribe.call(storage, key, onChange);
}

function registerHideFlush(flush: () => void): Unsubscribe {
  if (typeof globalThis.addEventListener !== "function") return () => {};
  for (const name of hideEvents) globalThis.addEventListener(name, flush);
  return () => {
    for (const name of hideEvents) globalThis.removeEventListener(name, flush);
  };
}

function createApply<S>(
  store: PersistableStore<S>,
  config: Resolved<S>,
  flags: Flags,
  onCorrupt: () => void,
): (raw: string) => void {
  return (raw) => {
    flags.applying = true;
    try {
      const outcome = resolveHydration(raw, store.state, config.hydrate);
      if (outcome.status === "hydrate") store.replaceState(outcome.state);
      else if (outcome.status === "corrupt") onCorrupt();
    } catch (error) {
      config.report("apply", error);
    } finally {
      flags.applying = false;
    }
  };
}

function createReader<S>(
  config: Resolved<S>,
  flags: Flags,
  apply: (raw: string) => void,
): () => Promise<void> {
  const finish = (raw: string | null): void => {
    if (flags.changed) {
      config.report(
        "hydrationRace",
        new Error(
          "State changed before asynchronous hydration completed; await `hydrated` before dispatching commands",
        ),
      );
    }
    if (raw !== null && !flags.destroyed) apply(raw);
    flags.awaitingRead = false;
  };

  const fail = (error: unknown): void => {
    config.report("read", error);
    flags.awaitingRead = false;
  };

  return () => {
    let raw: string | null | Promise<string | null>;
    try {
      raw = config.storage.getItem(config.key);
    } catch (error) {
      fail(error);
      return Promise.resolve();
    }
    if (!isPromiseLike(raw)) {
      finish(raw);
      return Promise.resolve();
    }
    return raw.then(finish, fail);
  };
}

function createStateWriter<S>(
  store: PersistableStore<S>,
  config: Resolved<S>,
  written: Written,
): Writer {
  return createWriter<S>({
    key: config.key,
    storage: config.storage,
    debounce: config.debounce,
    version: config.hydrate.version,
    serialize: config.serialize,
    readState: () => store.state,
    onWrite: (raw) => {
      written.last = raw;
    },
    report: config.report,
  });
}

function createChangeListener(flags: Flags, writer: Writer): StreamListener {
  return (event) => {
    if (flags.destroyed || flags.applying) return;
    if (!matchEvent(event, BuiltinEvent.StateChanged)) return;
    if (flags.awaitingRead) {
      flags.changed = true;
      return;
    }
    writer.schedule();
  };
}

export function persistStore<S>(
  store: PersistableStore<S>,
  options: PersistOptions<S>,
): PersistResult {
  const config = resolveOptions(options);
  const flags: Flags = {
    applying: false,
    awaitingRead: true,
    changed: false,
    destroyed: false,
  };
  const written: Written = { last: null };

  const writer = createStateWriter(store, config, written);
  const unsubscribe = subscribeStream(
    store,
    createChangeListener(flags, writer),
  );
  const apply = createApply(store, config, flags, () => {
    if (config.clearOnCorrupt) void writer.clear();
  });
  const hydrated = createReader(config, flags, apply)();

  const unsubscribeSync = config.syncTabs
    ? subscribeExternal(
        config.storage,
        config.key,
        (raw) => {
          if (flags.destroyed || raw === null || raw === written.last) return;
          apply(raw);
        },
        config.report,
      )
    : () => {};

  const unregisterHide = config.flushOnHide
    ? registerHideFlush(() => void writer.flush())
    : () => {};

  const destroy = () => {
    if (flags.destroyed) return;
    flags.destroyed = true;
    unsubscribe();
    unsubscribeSync();
    unregisterHide();
    void writer.flush();
  };

  return { destroy, flush: writer.flush, clear: writer.clear, hydrated };
}
