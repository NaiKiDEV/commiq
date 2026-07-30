import type { DeepReadonly, SealedStore, StreamListener } from "./types";
import type { StoreImpl } from "./store";

export function sealStore<S>(store: StoreImpl<S>): SealedStore<S> {
  return Object.freeze({
    get state(): DeepReadonly<S> {
      return store.state;
    },
    queue: store.queue,
    flush: () => store.flush(),
    openStream: (listener: StreamListener) => store.openStream(listener),
    closeStream: (listener: StreamListener) => store.closeStream(listener),
  });
}
