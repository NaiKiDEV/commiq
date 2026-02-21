import { describe, it, expect } from "vitest";
import { createStore, createCommand, sealStore, handledEvent } from "../index";

describe("sealStore", () => {
  it("exposes state as readonly", () => {
    const store = createStore({ count: 0 });
    const sealed = sealStore(store);
    expect(sealed.state).toEqual({ count: 0 });
  });

  it("exposes queue", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    const sealed = sealStore(store);
    sealed.queue(createCommand("inc", undefined));
    await store.flush();
    expect(sealed.state).toEqual({ count: 1 });
  });

  it("exposes openStream and closeStream", () => {
    const store = createStore({});
    const sealed = sealStore(store);
    expect(typeof sealed.openStream).toBe("function");
    expect(typeof sealed.closeStream).toBe("function");
  });

  it("does not expose addCommandHandler", () => {
    const store = createStore({});
    const sealed = sealStore(store);
    expect((sealed as any).addCommandHandler).toBeUndefined();
  });

  it("does not expose addEventHandler", () => {
    const store = createStore({});
    const sealed = sealStore(store);
    expect((sealed as any).addEventHandler).toBeUndefined();
  });
});

describe("handledEvent", () => {
  it("creates an event def matching auto-notify naming", () => {
    const evt = handledEvent("initUser");
    expect(evt.name).toBe("initUser:handled");
    expect(typeof evt.id).toBe("symbol");
  });
});
