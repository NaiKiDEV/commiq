import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Unsubscribe } from "@naikidev/commiq";
import type { IsEqual } from "../types";

type Instance<T> = {
  hasValue: boolean;
  value: T | undefined;
}

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => Unsubscribe,
  getSnapshot: () => Snapshot,
  getServerSnapshot: () => Snapshot,
  selector: (snapshot: Snapshot) => Selection,
  isEqual: IsEqual<Selection>,
): Selection {
  const instanceRef = useRef<Instance<Selection> | null>(null);
  if (instanceRef.current === null) {
    instanceRef.current = { hasValue: false, value: undefined };
  }
  const instance = instanceRef.current;

  const [getSelection, getServerSelection] = useMemo(() => {
    let hasMemo = false;
    let memoizedSnapshot: Snapshot;
    let memoizedSelection: Selection;

    const memoizedSelector = (nextSnapshot: Snapshot): Selection => {
      if (!hasMemo) {
        hasMemo = true;
        memoizedSnapshot = nextSnapshot;
        const firstSelection = selector(nextSnapshot);
        if (instance.hasValue) {
          const currentSelection = instance.value as Selection;
          if (isEqual(currentSelection, firstSelection)) {
            memoizedSelection = currentSelection;
            return currentSelection;
          }
        }
        memoizedSelection = firstSelection;
        return firstSelection;
      }

      if (Object.is(memoizedSnapshot, nextSnapshot)) return memoizedSelection;

      const nextSelection = selector(nextSnapshot);
      memoizedSnapshot = nextSnapshot;
      if (isEqual(memoizedSelection, nextSelection)) return memoizedSelection;

      memoizedSelection = nextSelection;
      return nextSelection;
    };

    return [
      () => memoizedSelector(getSnapshot()),
      () => memoizedSelector(getServerSnapshot()),
    ] as const;
  }, [getSnapshot, getServerSnapshot, selector, isEqual, instance]);

  const value = useSyncExternalStore(subscribe, getSelection, getServerSelection);

  useEffect(() => {
    instance.hasValue = true;
    instance.value = value;
  }, [instance, value]);

  return value;
}
