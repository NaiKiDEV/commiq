import { describe, it, expect, vi, afterEach } from "vitest";
import { memoryTransport, windowMessageTransport } from "../transport";
import type { DevtoolsMessage } from "../types";

type MessageLike = {
  data: unknown;
  origin: string;
  source: unknown;
};

type FakeWindow = {
  listeners: Set<(event: MessageLike) => void>;
  posted: { data: unknown; targetOrigin: string }[];
  self: object;
};

function stubWindow(origin: string): FakeWindow {
  const listeners = new Set<(event: MessageLike) => void>();
  const posted: { data: unknown; targetOrigin: string }[] = [];

  const fake = {
    location: { origin },
    addEventListener(type: string, listener: (event: MessageLike) => void): void {
      if (type === "message") {
        listeners.add(listener);
      }
    },
    removeEventListener(_type: string, listener: (event: MessageLike) => void): void {
      listeners.delete(listener);
    },
    postMessage(data: unknown, targetOrigin: string): void {
      posted.push({ data, targetOrigin });
    },
  };

  vi.stubGlobal("window", fake);
  return { listeners, posted, self: fake };
}

function deliver(fake: FakeWindow, event: MessageLike): void {
  for (const listener of [...fake.listeners]) {
    listener(event);
  }
}

function envelope(payload: DevtoolsMessage): unknown {
  return { source: "commiq-devtools", payload };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("windowMessageTransport", () => {
  it("posts to the page origin rather than a wildcard", () => {
    const fake = stubWindow("https://app.example.com");
    const transport = windowMessageTransport();

    transport.send({ type: "CLEARED" });

    expect(fake.posted).toHaveLength(1);
    expect(fake.posted[0].targetOrigin).toBe("https://app.example.com");
    expect(fake.posted[0].data).toEqual(envelope({ type: "CLEARED" }));

    transport.destroy();
  });

  it("honours an explicit targetOrigin", () => {
    const fake = stubWindow("https://app.example.com");
    const transport = windowMessageTransport({ targetOrigin: "https://panel.example.com" });

    transport.send({ type: "CLEARED" });

    expect(fake.posted[0].targetOrigin).toBe("https://panel.example.com");
    transport.destroy();
  });

  it("delivers same-origin messages from the same window", () => {
    const fake = stubWindow("https://app.example.com");
    const transport = windowMessageTransport();
    const handler = vi.fn();
    transport.onMessage(handler);

    deliver(fake, {
      data: envelope({ type: "REQUEST_STATE", storeName: "s" }),
      origin: "https://app.example.com",
      source: fake.self,
    });

    expect(handler).toHaveBeenCalledWith({ type: "REQUEST_STATE", storeName: "s" });
    transport.destroy();
  });

  it("rejects messages from a cross-origin sender", () => {
    const fake = stubWindow("https://app.example.com");
    const transport = windowMessageTransport();
    const handler = vi.fn();
    transport.onMessage(handler);

    deliver(fake, {
      data: envelope({ type: "TIME_TRAVEL", storeName: "s", stateIndex: 0 }),
      origin: "https://evil.example.com",
      source: fake.self,
    });

    expect(handler).not.toHaveBeenCalled();
    transport.destroy();
  });

  it("rejects messages that did not originate from this window", () => {
    const fake = stubWindow("https://app.example.com");
    const transport = windowMessageTransport();
    const handler = vi.fn();
    transport.onMessage(handler);

    deliver(fake, {
      data: envelope({ type: "TIME_TRAVEL", storeName: "s", stateIndex: 0 }),
      origin: "https://app.example.com",
      source: { notTheWindow: true },
    });

    expect(handler).not.toHaveBeenCalled();
    transport.destroy();
  });

  it("ignores foreign or malformed envelopes", () => {
    const fake = stubWindow("https://app.example.com");
    const transport = windowMessageTransport();
    const handler = vi.fn();
    transport.onMessage(handler);

    const base = { origin: "https://app.example.com", source: fake.self };
    deliver(fake, { ...base, data: { source: "other-tool", payload: { type: "CLEARED" } } });
    deliver(fake, { ...base, data: { source: "commiq-devtools" } });
    deliver(fake, { ...base, data: { source: "commiq-devtools", payload: 42 } });
    deliver(fake, { ...base, data: null });

    expect(handler).not.toHaveBeenCalled();
    transport.destroy();
  });

  it("unsubscribes handlers and removes the window listener on destroy", () => {
    const fake = stubWindow("https://app.example.com");
    const transport = windowMessageTransport();
    const handler = vi.fn();
    const unsubscribe = transport.onMessage(handler);

    unsubscribe();
    deliver(fake, {
      data: envelope({ type: "CLEARED" }),
      origin: "https://app.example.com",
      source: fake.self,
    });
    expect(handler).not.toHaveBeenCalled();

    expect(fake.listeners.size).toBe(1);
    transport.destroy();
    expect(fake.listeners.size).toBe(0);
  });

  it("is inert without a window", () => {
    const transport = windowMessageTransport();
    expect(() => transport.send({ type: "CLEARED" })).not.toThrow();
    expect(() => transport.destroy()).not.toThrow();
  });
});

describe("memoryTransport", () => {
  it("records messages and notifies handlers", () => {
    const transport = memoryTransport();
    const handler = vi.fn();
    transport.onMessage(handler);

    transport.send({ type: "CLEARED" });

    expect(transport.messages).toEqual([{ type: "CLEARED" }]);
    expect(handler).toHaveBeenCalledWith({ type: "CLEARED" });
  });

  it("stops notifying after unsubscribe and destroy", () => {
    const transport = memoryTransport();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = transport.onMessage(first);
    transport.onMessage(second);

    unsubscribe();
    transport.send({ type: "CLEARED" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    transport.destroy();
    transport.send({ type: "CLEARED" });
    expect(second).toHaveBeenCalledTimes(1);
    expect(transport.messages).toHaveLength(2);
  });
});
