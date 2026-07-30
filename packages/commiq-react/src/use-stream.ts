import { useEffect } from "react";
import type { StreamListener } from "@naikidev/commiq";
import { isolate } from "./internal/rethrow-async";
import { useLatestRef } from "./internal/use-latest-ref";
import { useResolvedStore } from "./internal/use-resolved-store";
import type { StoreSource } from "./types";

export function useStream<S>(
  source: StoreSource<S>,
  listener: StreamListener,
): void {
  const store = useResolvedStore<S>(source);
  const listenerRef = useLatestRef(listener);

  useEffect(() => {
    return store.openStream(
      isolate((event) => listenerRef.current(event)),
    );
  }, [store, listenerRef]);
}
