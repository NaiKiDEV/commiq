import type { EventDef, StoreEvent, StreamListener } from "./types";

type EventBusHandler<D = unknown> = (event: StoreEvent<D>) => void;

type Streamable = {
  openStream: (listener: StreamListener) => void;
  closeStream: (listener: StreamListener) => void;
}

type Connection = {
  store: Streamable;
  listener: StreamListener;
}

export function createEventBus() {
  const connections: Connection[] = [];
  const handlers = new Map<symbol, EventBusHandler[]>();

  const busListener: StreamListener = (event) => {
    const eventHandlers = handlers.get(event.id);
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        handler(event);
      }
    }
  };

  return {
    connect(store: Streamable): void {
      store.openStream(busListener);
      connections.push({ store, listener: busListener });
    },

    disconnect(store: Streamable): void {
      const idx = connections.findIndex((c) => c.store === store);
      if (idx !== -1) {
        store.closeStream(connections[idx].listener);
        connections.splice(idx, 1);
      }
    },

    on<D>(eventDef: EventDef<D>, handler: EventBusHandler<D>): void {
      const list = handlers.get(eventDef.id) ?? [];
      list.push(handler as EventBusHandler);
      handlers.set(eventDef.id, list);
    },
  };
}
