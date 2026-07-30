import { useCallback } from "react";
import type { DeepReadonly } from "@naikidev/commiq";
import { useResolvedStore } from "./internal/use-resolved-store";
import { useStoreSubscription } from "./internal/use-store-subscription";
import { useSyncExternalStoreWithSelector } from "./internal/with-selector";
import type { IsEqual, StoreSource } from "./types";

export function useSelector<S, T>(
  source: StoreSource<S>,
  selector: (state: DeepReadonly<S>) => T,
  isEqual: IsEqual<T> = Object.is,
): T {
  const store = useResolvedStore<S>(source);
  const subscribe = useStoreSubscription(store);
  const getSnapshot = useCallback(() => store.state, [store]);

  return useSyncExternalStoreWithSelector(
    subscribe,
    getSnapshot,
    getSnapshot,
    selector,
    isEqual,
  );
}
