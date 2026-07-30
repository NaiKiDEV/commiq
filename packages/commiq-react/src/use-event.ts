import { useEffect } from "react";
import type { EventDef, StoreEvent } from "@naikidev/commiq";
import { matchEvent } from "@naikidev/commiq";
import { isolate } from "./internal/rethrow-async";
import { useLatestRef } from "./internal/use-latest-ref";
import { useResolvedStore } from "./internal/use-resolved-store";
import type { StoreSource } from "./types";

export function useEvent<S, D>(
  source: StoreSource<S>,
  eventDef: EventDef<D>,
  handler: (event: StoreEvent<D>) => void,
): void {
  const store = useResolvedStore<S>(source);
  const handlerRef = useLatestRef(handler);
  const defRef = useLatestRef(eventDef);
  const eventId = eventDef.id;

  useEffect(() => {
    return store.openStream(
      isolate((event) => {
        if (!matchEvent(event, defRef.current)) return;
        handlerRef.current(event);
      }),
    );
  }, [store, eventId, defRef, handlerRef]);
}
