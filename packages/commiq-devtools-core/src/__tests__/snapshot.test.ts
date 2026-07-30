import { describe, it, expect, vi } from "vitest";
import { createSnapshot, safeClone } from "../snapshot";
import { sanitizeMessage, sendSafely, toSerializable } from "../serialize";
import type { DevtoolsMessage, TimelineEntry } from "../types";

class Widget {
  constructor(readonly label: string) {}
  render(): string {
    return this.label;
  }
}

function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) {
    throw new Error(`missing field ${key}`);
  }
  return Reflect.get(value, key);
}

describe("safeClone", () => {
  it("deep copies nested plain structures", () => {
    const source = { a: { b: [1, 2, { c: 3 }] } };
    const copy = safeClone(source);

    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    source.a.b.push(4);
    expect(copy).toEqual({ a: { b: [1, 2, { c: 3 }] } });
  });

  it("copies Date, Map and Set values", () => {
    const source = {
      when: new Date(1000),
      map: new Map([["k", { v: 1 }]]),
      set: new Set([{ v: 2 }]),
    };
    const copy = safeClone(source);

    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(fieldOf(copy, "map")).not.toBe(source.map);
    expect(fieldOf(copy, "set")).not.toBe(source.set);
  });

  it("preserves shared references and survives cycles", () => {
    const shared = { n: 1 };
    const source: Record<string, unknown> = { left: shared, right: shared };
    source.self = source;

    const copy = safeClone(source);

    expect(fieldOf(copy, "left")).toBe(fieldOf(copy, "right"));
    expect(fieldOf(copy, "left")).not.toBe(shared);
    expect(fieldOf(copy, "self")).toBe(copy);
  });

  it("passes functions and class instances through without throwing", () => {
    const fn = function named() {};
    const widget = new Widget("hello");
    const copy = safeClone({ fn, widget });

    expect(fieldOf(copy, "fn")).toBe(fn);
    expect(fieldOf(copy, "widget")).toBe(widget);
  });

  it("tolerates throwing getters", () => {
    const source = {
      get boom(): number {
        throw new Error("nope");
      },
    };
    expect(() => safeClone({ nested: source })).not.toThrow();
  });
});

describe("createSnapshot", () => {
  it("returns the same reference in none mode", () => {
    const source = { a: 1 };
    expect(createSnapshot(source, "none")).toBe(source);
  });

  it("clones in safe mode", () => {
    const source = { a: 1 };
    expect(createSnapshot(source, "safe")).not.toBe(source);
    expect(createSnapshot(source, "safe")).toEqual(source);
  });

  it("falls back instead of throwing in structured mode", () => {
    const source = { fn: function payloadFn() {} };
    expect(() => createSnapshot(source, "structured")).not.toThrow();
    expect(fieldOf(createSnapshot(source, "structured"), "fn")).toBe(source.fn);
  });

  it("deep clones in structured mode when the value is cloneable", () => {
    const source = { nested: { n: 1 } };
    const copy = createSnapshot(source, "structured");
    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
  });
});

describe("toSerializable", () => {
  it("replaces functions, symbols and bigints", () => {
    const result = toSerializable({
      fn: function handler() {},
      sym: Symbol("tag"),
      big: BigInt(10),
    });

    expect(result).toEqual({
      fn: "[Function handler]",
      sym: "[Symbol tag]",
      big: "10n",
    });
  });

  it("marks circular references", () => {
    const source: Record<string, unknown> = { a: 1 };
    source.self = source;

    expect(toSerializable(source)).toEqual({ a: 1, self: "[Circular]" });
  });

  it("flattens class instances and errors", () => {
    expect(toSerializable(new Widget("w"))).toEqual({ label: "w" });
    expect(toSerializable(new Error("bad"))).toEqual({ name: "Error", message: "bad" });
  });

  it("produces structured-cloneable output", () => {
    const source = {
      fn: function payloadFn() {},
      widget: new Widget("w"),
      when: new Date(0),
      list: [Symbol("s")],
    };
    expect(() => structuredClone(toSerializable(source))).not.toThrow();
  });
});

describe("sanitizeMessage", () => {
  it("sanitizes event entry payload and state", () => {
    const entry: TimelineEntry = {
      seq: 1,
      storeName: "s",
      type: "event",
      name: "stateChanged",
      eventId: "stateChanged",
      data: { fn: function payloadFn() {} },
      correlationId: "c",
      causedBy: null,
      timestamp: 0,
      stateBefore: { fn: function payloadFn() {} },
      stateAfter: { fn: function payloadFn() {} },
    };

    const sanitized = sanitizeMessage({ type: "EVENT", entry });
    expect(() => structuredClone(sanitized)).not.toThrow();
  });

  it("sanitizes connected initial state and passes other messages through", () => {
    const connected: DevtoolsMessage = {
      type: "STORE_CONNECTED",
      storeName: "s",
      initialState: { fn: function payloadFn() {} },
    };
    expect(() => structuredClone(sanitizeMessage(connected))).not.toThrow();

    const cleared: DevtoolsMessage = { type: "CLEARED" };
    expect(sanitizeMessage(cleared)).toBe(cleared);
  });
});

describe("sendSafely", () => {
  it("sends the original message when the transport accepts it", () => {
    const send = vi.fn();
    const onError = vi.fn();
    const message: DevtoolsMessage = { type: "CLEARED" };

    sendSafely(send, message, onError);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(message);
    expect(onError).not.toHaveBeenCalled();
  });

  it("retries with a sanitized message and reports the failure", () => {
    const received: DevtoolsMessage[] = [];
    const onError = vi.fn();
    const send = (message: DevtoolsMessage) => {
      received.push(structuredClone(message));
    };

    sendSafely(
      send,
      {
        type: "STORE_CONNECTED",
        storeName: "s",
        initialState: { fn: function payloadFn() {} },
      },
      onError,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      type: "STORE_CONNECTED",
      storeName: "s",
      initialState: { fn: "[Function payloadFn]" },
    });
  });

  it("never throws when both attempts fail", () => {
    const onError = vi.fn();
    const send = () => {
      throw new Error("transport dead");
    };

    expect(() => sendSafely(send, { type: "CLEARED" }, onError)).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
