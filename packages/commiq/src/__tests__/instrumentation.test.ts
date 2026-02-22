import { describe, it, expect, vi } from "vitest";
import { createStore, createCommand, createEvent } from "../index";

describe("instrumentation", () => {
  it("emits events with timestamp, correlationId, and causedBy", async () => {
    const listener = vi.fn();
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    store.openStream(listener);
    store.queue(createCommand("inc", undefined));
    await store.flush();

    for (const [event] of listener.mock.calls) {
      expect(event).toHaveProperty("timestamp");
      expect(event).toHaveProperty("correlationId");
      expect(event).toHaveProperty("causedBy");
      expect(typeof event.timestamp).toBe("number");
      expect(typeof event.correlationId).toBe("string");
    }
  });
});
