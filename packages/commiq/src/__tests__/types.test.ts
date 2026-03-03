import { describe, it, expect } from "vitest";
import { createCommand, createEvent, matchEvent, type StoreEvent } from "../index";

describe("createCommand", () => {
  it("creates a command with name and data", () => {
    const cmd = createCommand("initUser", { name: "Alice" });
    expect(cmd.name).toBe("initUser");
    expect(cmd.data).toEqual({ name: "Alice" });
  });
});

describe("createEvent", () => {
  it("creates an event definition with symbol id and string name", () => {
    const evt = createEvent("sessionExpired");
    expect(typeof evt.id).toBe("symbol");
    expect(evt.name).toBe("sessionExpired");
  });

  it("creates unique symbols for different events with same name", () => {
    const a = createEvent("test");
    const b = createEvent("test");
    expect(a.id).not.toBe(b.id);
  });
});

describe("matchEvent", () => {
  const TestEvent = createEvent<{ count: number }>("test:event");
  const OtherEvent = createEvent<string>("other:event");

  const event: StoreEvent = {
    id: TestEvent.id,
    name: TestEvent.name,
    data: { count: 42 },
    timestamp: Date.now(),
    correlationId: "abc",
    causedBy: null,
  };

  it("returns true when event matches the event definition", () => {
    expect(matchEvent(event, TestEvent)).toBe(true);
  });

  it("returns false when event does not match", () => {
    expect(matchEvent(event, OtherEvent)).toBe(false);
  });

  it("narrows the event data type", () => {
    if (matchEvent(event, TestEvent)) {
      // TypeScript infers event.data as { count: number }
      expect(event.data.count).toBe(42);
    }
  });
});
