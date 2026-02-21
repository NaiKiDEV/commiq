import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useSyncExternalStore,
  useEffect,
  createElement,
} from "react";
import type { ReactNode } from "react";
import type {
  SealedStore,
  Command,
  EventDef,
  StoreEvent,
} from "@naikidev/commiq";
import { builtinEvents } from "@naikidev/commiq";

// --- Context / Provider ---

interface CommiqContextValue {
  stores: Record<string, SealedStore<any>>;
}

const CommiqContext = createContext<CommiqContextValue | null>(null);

export interface CommiqProviderProps {
  stores: Record<string, SealedStore<any>>;
  children: ReactNode;
}

export function CommiqProvider({ stores, children }: CommiqProviderProps) {
  return createElement(
    CommiqContext.Provider,
    { value: { stores } },
    children
  );
}

// --- useSelector ---

export function useSelector<S, T>(
  store: SealedStore<S>,
  selector: (state: S) => T
): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const listener = (event: StoreEvent) => {
        if (event.id === builtinEvents.stateChanged.id) {
          onStoreChange();
        }
      };
      store.openStream(listener);
      return () => store.closeStream(listener);
    },
    [store]
  );

  const getSnapshot = useCallback(() => {
    return selectorRef.current(store.state);
  }, [store]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// --- useQueue ---

export function useQueue<S>(
  store: SealedStore<S>
): (command: Command) => void {
  return useCallback(
    (command: Command) => {
      store.queue(command);
    },
    [store]
  );
}

// --- useEvent ---

export function useEvent<D>(
  store: SealedStore<any>,
  eventDef: EventDef<D>,
  handler: (event: StoreEvent<D>) => void
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
