import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDevtools,
  type Devtools,
  type DevtoolsMessage,
  type StateSnapshot,
  type TimelineEntry,
  type Transport,
} from "@naikidev/commiq-devtools-core";
import { isErrorEventName } from "../event-names";
import type { DevtoolsStoreRegistry } from "../types";

export const MAX_TRACKED_ERRORS = 50;

export type ErrorEntry = {
  id: number;
  name: string;
  storeName: string;
  correlationId: string;
}

export type DevtoolsEngine = {
  version: number;
  timeline: readonly TimelineEntry[];
  getChain: (correlationId: string) => readonly TimelineEntry[];
  getStateHistory: (storeName: string) => readonly StateSnapshot[];
  storeStates: Record<string, unknown>;
  storeNames: string[];
  eventCount: number;
  errorCount: number;
  errors: readonly ErrorEntry[];
  clearCount: number;
  clearErrors: () => void;
  clear: () => void;
}

function createPanelTransport(): Transport {
  const handlers = new Set<(message: DevtoolsMessage) => void>();
  return {
    send(message: DevtoolsMessage): void {
      for (const handler of [...handlers]) {
        handler(message);
      }
    },
    onMessage(handler: (message: DevtoolsMessage) => void): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    destroy(): void {
      handlers.clear();
    },
  };
}

type Internals = {
  devtools: Devtools;
  transport: Transport;
  eventCount: number;
  errorCount: number;
  errors: ErrorEntry[];
  nextErrorId: number;
  clearCount: number;
}

function createInternals(maxEvents: number): Internals {
  const transport = createPanelTransport();
  return {
    devtools: createDevtools({ transport, maxEvents }),
    transport,
    eventCount: 0,
    errorCount: 0,
    errors: [],
    nextErrorId: 0,
    clearCount: 0,
  };
}

function resetErrors(internals: Internals): void {
  internals.errorCount = 0;
  internals.errors = [];
}

function recordError(internals: Internals, entry: TimelineEntry): void {
  internals.errorCount += 1;
  const next: ErrorEntry = {
    id: internals.nextErrorId,
    name: entry.name,
    storeName: entry.storeName,
    correlationId: entry.correlationId,
  };
  internals.nextErrorId += 1;
  internals.errors =
    internals.errors.length < MAX_TRACKED_ERRORS
      ? [...internals.errors, next]
      : [...internals.errors.slice(internals.errors.length - MAX_TRACKED_ERRORS + 1), next];
}

export function useDevtoolsEngine(
  stores: DevtoolsStoreRegistry,
  maxEvents: number = 500,
): DevtoolsEngine {
  const [version, setVersion] = useState(0);
  const internalsRef = useRef<Internals | null>(null);
  const frameRef = useRef<number | null>(null);

  if (!internalsRef.current) {
    internalsRef.current = createInternals(maxEvents);
  }
  const internals = internalsRef.current;

  const scheduleRender = useCallback(() => {
    if (frameRef.current !== null) return;
    if (typeof requestAnimationFrame !== "function") {
      setVersion((v) => v + 1);
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setVersion((v) => v + 1);
    });
  }, []);

  const flushRender = useCallback(() => {
    if (frameRef.current !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = null;
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const devtools = internals.devtools;
    const names = Object.keys(stores);
    for (const name of names) {
      devtools.connect(stores[name], name);
    }
    return () => {
      for (const name of names) {
        devtools.disconnect(name);
      }
    };
  }, [stores, internals]);

  useEffect(() => {
    return internals.transport.onMessage((message) => {
      if (message.type === "CLEARED") {
        internals.eventCount = 0;
        resetErrors(internals);
        flushRender();
        return;
      }
      if (message.type !== "EVENT") return;
      internals.eventCount += 1;
      if (isErrorEventName(message.entry.name)) {
        recordError(internals, message.entry);
      }
      scheduleRender();
    });
  }, [internals, scheduleRender, flushRender]);

  const getChain = useCallback(
    (correlationId: string) => internals.devtools.getChain(correlationId),
    [internals],
  );

  const getStateHistory = useCallback(
    (storeName: string) => internals.devtools.getStateHistory(storeName),
    [internals],
  );

  const clearErrors = useCallback(() => {
    resetErrors(internals);
    flushRender();
  }, [internals, flushRender]);

  const clear = useCallback(() => {
    internals.clearCount += 1;
    internals.devtools.clear();
  }, [internals]);

  const dataVersion = internals.devtools.getVersion();

  const storeStates = useMemo(
    () => Object.fromEntries(Object.entries(stores).map(([name, store]) => [name, store.state])),
    [stores, dataVersion],
  );

  const storeNames = useMemo(() => Object.keys(stores), [stores]);

  return useMemo(
    () => ({
      version,
      timeline: internals.devtools.getTimeline(),
      getChain,
      getStateHistory,
      storeStates,
      storeNames,
      eventCount: internals.eventCount,
      errorCount: internals.errorCount,
      errors: internals.errors,
      clearCount: internals.clearCount,
      clearErrors,
      clear,
    }),
    [
      version,
      dataVersion,
      internals,
      getChain,
      getStateHistory,
      storeStates,
      storeNames,
      clearErrors,
      clear,
    ],
  );
}
