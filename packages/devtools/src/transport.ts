import type { DevtoolsMessage, Transport } from "./types";

const MESSAGE_SOURCE = "commiq-devtools";

export function windowMessageTransport(): Transport {
  const handlers = new Set<(message: DevtoolsMessage) => void>();

  const listener = (event: MessageEvent) => {
    if (event.data?.source === MESSAGE_SOURCE && event.data?.payload) {
      for (const handler of handlers) {
        handler(event.data.payload as DevtoolsMessage);
      }
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("message", listener);
  }

  return {
    send(message: DevtoolsMessage): void {
      if (typeof window !== "undefined") {
        window.postMessage({ source: MESSAGE_SOURCE, payload: message }, "*");
      }
    },
    onMessage(handler: (message: DevtoolsMessage) => void): () => void {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    destroy(): void {
      handlers.clear();
      if (typeof window !== "undefined") {
        window.removeEventListener("message", listener);
      }
    },
  };
}

export function memoryTransport(): Transport & { messages: DevtoolsMessage[] } {
  const handlers = new Set<(message: DevtoolsMessage) => void>();
  const messages: DevtoolsMessage[] = [];

  return {
    messages,
    send(message: DevtoolsMessage): void {
      messages.push(message);
      for (const handler of handlers) {
        handler(message);
      }
    },
    onMessage(handler: (message: DevtoolsMessage) => void): () => void {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    destroy(): void {
      handlers.clear();
    },
  };
}
