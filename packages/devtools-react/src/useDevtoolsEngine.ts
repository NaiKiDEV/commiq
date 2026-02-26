import { useState, useEffect, useRef, useCallback } from "react";
import type { SealedStore } from "@naikidev/commiq";
import {
  createDevtools,
  memoryTransport,
  type TimelineEntry,
  type StateSnapshot,
  type Transport,
  type DevtoolsMessage,
} from "@naikidev/commiq-devtools";

export type DevtoolsEngine = {
  timeline: TimelineEntry[];
  getChain: (correlationId: string) => TimelineEntry[];
  getStateHistory: (storeName: string) => StateSnapshot[];
  storeStates: Record<string, unknown>;
  storeNames: string[];
  eventCount: number;
  clear: () => void;
}

export function useDevtoolsEngine(
  stores: Record<string, SealedStore<any>>,
  maxEvents: number = 500,
): DevtoolsEngine {
  const [version, setVersion] = useState(0);

  const internalsRef = useRef<{
    devtools: ReturnType<typeof createDevtools>;
    transport: Transport & { messages: DevtoolsMessage[] };
    eventCount: number;
  } | null>(null);

  if (!internalsRef.current) {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport, maxEvents });
    internalsRef.current = { devtools, transport, eventCount: 0 };
  }

  const internals = internalsRef.current;

  useEffect(() => {
    const dt = internals.devtools;
    const names = Object.keys(stores);

    for (const name of names) {
      dt.connect(stores[name], name);
    }

    return () => {
      for (const name of names) {
        dt.disconnect(name);
      }
    };
  }, [stores, internals.devtools]);

  useEffect(() => {
    const unsub = internals.transport.onMessage(() => {
      internals.eventCount++;
      setVersion((v) => v + 1);
    });
    return unsub;
  }, [internals]);

  const getChain = useCallback(
    (correlationId: string) => internals.devtools.getChain(correlationId),
    [internals.devtools],
  );

  const getStateHistory = useCallback(
    (storeName: string) => internals.devtools.getStateHistory(storeName),
    [internals.devtools],
  );

  const clear = useCallback(() => {
    internals.devtools.destroy();
    const transport = memoryTransport();
    const devtools = createDevtools({ transport, maxEvents });
    internals.devtools = devtools;
    internals.transport = transport;
    internals.eventCount = 0;

    for (const [name, store] of Object.entries(stores)) {
      devtools.connect(store, name);
    }

    transport.onMessage(() => {
      internals.eventCount++;
      setVersion((v) => v + 1);
    });

    setVersion((v) => v + 1);
  }, [internals, stores, maxEvents]);

  void version;

  return {
    timeline: internals.devtools.getTimeline(),
    getChain,
    getStateHistory,
    storeStates: Object.fromEntries(
      Object.entries(stores).map(([name, store]) => [name, store.state]),
    ),
    storeNames: Object.keys(stores),
    eventCount: internals.eventCount,
    clear,
  };
}
