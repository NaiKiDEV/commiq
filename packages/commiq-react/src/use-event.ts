import { useRef, useEffect } from "react";
import type { SealedStore, EventDef, StoreEvent } from "@naikidev/commiq";

export function useEvent<D>(
  store: SealedStore<any>,
  eventDef: EventDef<D>,
  handler: (event: StoreEvent<D>) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event: StoreEvent) => {
      if (event.id === eventDef.id) {
        handlerRef.current(event as StoreEvent<D>);
      }
    };
    store.openStream(listener);
    return () => store.closeStream(listener);
  }, [store, eventDef.id]);
}
