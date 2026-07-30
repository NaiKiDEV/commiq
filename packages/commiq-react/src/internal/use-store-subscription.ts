import { useCallback } from "react";
import type { SealedStore, Unsubscribe } from "@naikidev/commiq";
import { rethrowAsync } from "./rethrow-async";

export function useStoreSubscription<S>(
  store: SealedStore<S>,
): (onStoreChange: () => void) => Unsubscribe {
  return useCallback(
    (onStoreChange: () => void) =>
      store.openStream(() => {
        try {
          onStoreChange();
        } catch (error) {
          rethrowAsync(error);
        }
      }),
    [store],
  );
}
