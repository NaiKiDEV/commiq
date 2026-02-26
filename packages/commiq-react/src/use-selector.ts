import { useCallback, useRef, useSyncExternalStore } from "react";
import type { SealedStore, StoreEvent } from "@naikidev/commiq";
import { BuiltinEvent } from "@naikidev/commiq";

export function useSelector<S, T>(
  store: SealedStore<S>,
  selector: (state: S) => T,
): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const listener = (event: StoreEvent) => {
        if (event.id === BuiltinEvent.StateChanged.id) {
          onStoreChange();
        }
      };
      store.openStream(listener);
      return () => store.closeStream(listener);
    },
    [store],
  );

  const getSnapshot = useCallback(() => {
    return selectorRef.current(store.state);
  }, [store]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
