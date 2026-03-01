import { BuiltinEvent, StoreImpl } from "@naikidev/commiq";
import type { StoreEvent } from "@naikidev/commiq";
import type { PersistOptions, PersistResult } from "./types";

export function persistStore<S>(
  store: StoreImpl<S>,
  options: PersistOptions<S>,
): PersistResult {
  const {
    key,
    storage = localStorage,
    debounce = 300,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
  } = options;

  let hydrating = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const listener = (event: StoreEvent) => {
    if (destroyed || hydrating) return;
    if (event.id !== BuiltinEvent.StateChanged.id) return;

    const { next } = event.data as { prev: unknown; next: unknown };

    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      storage.setItem(key, serialize(next as S));
    }, debounce);
  };

  store.openStream(listener);

  const hydrated = Promise.resolve(storage.getItem(key)).then((raw) => {
    if (raw !== null && !destroyed) {
      store.replaceState(deserialize(raw));
    }
    hydrating = false;
  });

  const destroy = () => {
    destroyed = true;
    store.closeStream(listener);
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { destroy, hydrated };
}
