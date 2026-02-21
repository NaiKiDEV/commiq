import type { SealedStore, Command, StreamListener } from "./types";
import type { StoreImpl } from "./store";

export function sealStore<S>(store: StoreImpl<S>): SealedStore<S> {
  return {
    get state() {
      return store.state;
    },
    queue: (command: Command) => store.queue(command),
    openStream: (listener: StreamListener) => store.openStream(listener),
    closeStream: (listener: StreamListener) => store.closeStream(listener),
  };
}
