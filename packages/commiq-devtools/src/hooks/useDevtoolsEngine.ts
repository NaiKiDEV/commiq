import { useState, useEffect, useRef, useCallback } from "react";
import type { SealedStore } from "@naikidev/commiq";
import {
  createDevtools,
  memoryTransport,
  type TimelineEntry,
  type StateSnapshot,
  type Transport,
  type DevtoolsMessage,
} from "@naikidev/commiq-devtools-core";

export type ErrorEntry = {
  entry: TimelineEntry;
  id: number;
}

export type DevtoolsEngine = {
  timeline: TimelineEntry[];
  getChain: (correlationId: string) => TimelineEntry[];
  getStateHistory: (storeName: string) => StateSnapshot[];
  storeStates: Record<string, unknown>;
  storeNames: string[];
  eventCount: number;
  errorCount: number;
  errors: ErrorEntry[];
  clearCount: number;
  clearErrors: () => void;
  clear: () => void;
}

const ERROR_EVENTS = new Set(["commandHandlingError", "invalidCommand"]);

type Internals = {
  devtools: ReturnType<typeof createDevtools>;
  transport: Transport & { messages: DevtoolsMessage[] };
  eventCount: number;
  errorCount: number;
  errors: ErrorEntry[];
  nextErrorId: number;
  clearCount: number;
  unsubscribe: (() => void) | null;
}

export function useDevtoolsEngine(
  stores: Record<string, SealedStore<unknown>>,
  maxEvents: number = 500,
): DevtoolsEngine {
  const [version, setVersion] = useState(0);

  const internalsRef = useRef<Internals | null>(null);

  if (!internalsRef.current) {
    const transport = memoryTransport();
    const devtools = createDevtools({ transport, maxEvents });
    internalsRef.current = {
      devtools,
      transport,
      eventCount: 0,
      errorCount: 0,
      errors: [],
      nextErrorId: 0,
      clearCount: 0,
      unsubscribe: null,
    };
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
    const unsub = internals.transport.onMessage((msg) => {
      if (msg.type !== "EVENT") return;
      internals.eventCount++;
      if (ERROR_EVENTS.has(msg.entry.name)) {
        internals.errorCount++;
        internals.errors = [
          ...internals.errors,
          { entry: msg.entry, id: internals.nextErrorId++ },
        ];
      }
      setVersion((v) => v + 1);
    });
    internals.unsubscribe = unsub;
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

  const clearErrors = useCallback(() => {
    internals.errorCount = 0;
    internals.errors = [];
    setVersion((v) => v + 1);
  }, [internals]);

  const clear = useCallback(() => {
    internals.unsubscribe?.();
    internals.devtools.destroy();

    const transport = memoryTransport();
    const devtools = createDevtools({ transport, maxEvents });
    internals.devtools = devtools;
    internals.transport = transport;
    internals.eventCount = 0;
    internals.errorCount = 0;
    internals.errors = [];
    internals.nextErrorId = 0;
    internals.clearCount++;

    const unsub = transport.onMessage((msg) => {
      if (msg.type !== "EVENT") return;
      internals.eventCount++;
      if (ERROR_EVENTS.has(msg.entry.name)) {
        internals.errorCount++;
        internals.errors = [
          ...internals.errors,
          { entry: msg.entry, id: internals.nextErrorId++ },
        ];
      }
      setVersion((v) => v + 1);
    });
    internals.unsubscribe = unsub;

    for (const [name, store] of Object.entries(stores)) {
      devtools.connect(store, name);
    }

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
    errorCount: internals.errorCount,
    errors: internals.errors,
    clearCount: internals.clearCount,
    clearErrors,
    clear,
  };
}
