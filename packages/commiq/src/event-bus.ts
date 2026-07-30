import { reportToConsole } from "./run-safe";
import type { EventDef, StoreEvent, StreamListener, Unsubscribe } from "./types";

export type EventBusHandler<D = unknown> = (event: StoreEvent<D>) => void;

export type Streamable = {
  openStream: (listener: StreamListener) => Unsubscribe | void;
  closeStream: (listener: StreamListener) => void;
}

export type EventBus = {
  connect: (store: Streamable) => Unsubscribe;
  disconnect: (store: Streamable) => void;
  on: <D>(eventDef: EventDef<D>, handler: EventBusHandler<D>) => Unsubscribe;
  off: <D>(eventDef: EventDef<D>, handler: EventBusHandler<D>) => boolean;
  destroy: () => void;
}

type Connection = {
  unsubscribe: Unsubscribe;
  refCount: number;
}

export function createEventBus(): EventBus {
  const connections = new Map<Streamable, Connection>();
  const handlers = new Map<symbol, EventBusHandler[]>();

  const dispatch: StreamListener = (event) => {
    const eventHandlers = handlers.get(event.id);
    if (!eventHandlers) return;

    for (const handler of [...eventHandlers]) {
      try {
        handler(event);
      } catch (error) {
        reportToConsole(
          `[commiq] event bus handler for "${event.name}" failed`,
          error,
        );
      }
    }
  };

  const disconnect = (store: Streamable): void => {
    const connection = connections.get(store);
    if (!connection) return;

    connection.refCount -= 1;
    if (connection.refCount > 0) return;

    connection.unsubscribe();
    connections.delete(store);
  };

  const connect = (store: Streamable): Unsubscribe => {
    const existing = connections.get(store);
    if (existing) {
      existing.refCount += 1;
      return () => disconnect(store);
    }

    const listener: StreamListener = (event) => dispatch(event);
    const result = store.openStream(listener);
    const unsubscribe =
      typeof result === "function"
        ? result
        : () => store.closeStream(listener);

    connections.set(store, { unsubscribe, refCount: 1 });
    return () => disconnect(store);
  };

  const off = <D>(
    eventDef: EventDef<D>,
    handler: EventBusHandler<D>,
  ): boolean => {
    const list = handlers.get(eventDef.id);
    if (!list) return false;

    const index = list.indexOf(handler as EventBusHandler);
    if (index === -1) return false;

    list.splice(index, 1);
    if (list.length === 0) handlers.delete(eventDef.id);
    return true;
  };

  const on = <D>(
    eventDef: EventDef<D>,
    handler: EventBusHandler<D>,
  ): Unsubscribe => {
    const list = handlers.get(eventDef.id) ?? [];
    list.push(handler as EventBusHandler);
    handlers.set(eventDef.id, list);
    return () => {
      off(eventDef, handler);
    };
  };

  const destroy = (): void => {
    for (const connection of connections.values()) {
      connection.unsubscribe();
    }
    connections.clear();
    handlers.clear();
  };

  return { connect, disconnect, on, off, destroy };
}
