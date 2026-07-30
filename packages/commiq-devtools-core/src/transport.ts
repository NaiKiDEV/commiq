import type { DevtoolsMessage, Transport } from "./types";

const MESSAGE_SOURCE = "commiq-devtools";

export type WindowMessageTransportOptions = {
  targetOrigin?: string;
}

type MessageEnvelope = {
  source: string;
  payload: DevtoolsMessage;
}

export function windowMessageTransport(
  options: WindowMessageTransportOptions = {},
): Transport {
  const handlers = new Set<(message: DevtoolsMessage) => void>();
  const hasWindow = typeof window !== "undefined";
  const targetOrigin = options.targetOrigin ?? (hasWindow ? window.location.origin : "");

  const listener = (event: MessageEvent) => {
    if (event.source !== window) {
      return;
    }
    if (targetOrigin !== "*" && event.origin !== targetOrigin) {
      return;
    }
    if (!isMessageEnvelope(event.data)) {
      return;
    }
    const payload = event.data.payload;
    for (const handler of [...handlers]) {
      handler(payload);
    }
  };

  if (hasWindow) {
    window.addEventListener("message", listener);
  }

  return {
    send(message: DevtoolsMessage): void {
      if (!hasWindow || targetOrigin === "") {
        return;
      }
      window.postMessage({ source: MESSAGE_SOURCE, payload: message }, targetOrigin);
    },
    onMessage(handler: (message: DevtoolsMessage) => void): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    destroy(): void {
      handlers.clear();
      if (hasWindow) {
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

function isMessageEnvelope(value: unknown): value is MessageEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("source" in value) || value.source !== MESSAGE_SOURCE) {
    return false;
  }
  if (!("payload" in value)) {
    return false;
  }
  const payload = value.payload;
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  return "type" in payload && typeof payload.type === "string";
}
