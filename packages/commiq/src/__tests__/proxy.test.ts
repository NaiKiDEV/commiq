import { describe, it, expect, vi } from "vitest";
import {
  BuiltinEvent,
  createCommand,
  createCommandDef,
  createStore,
  handledEvent,
  matchEvent,
  sealStore,
} from "../index";

const inc = createCommandDef("inc");

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

  it("exposes flush", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    const sealed = sealStore(store);
    sealed.queue(createCommand("inc", undefined));
    await sealed.flush();
    expect(sealed.state).toEqual({ count: 1 });
  });

  it("delivers events to a listener opened through the sealed store", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler(inc, (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const sealed = sealStore(store);
    const names: string[] = [];
    sealed.openStream((event) => names.push(event.name));

    await sealed.queue(inc);

    expect(names).toContain("commandStarted");
    expect(names).toContain("stateChanged");
    expect(names).toContain("commandHandled");
  });

  it("stops delivery through closeStream and through the returned unsubscribe", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler(inc, (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const sealed = sealStore(store);
    const viaClose = vi.fn();
    const viaUnsubscribe = vi.fn();

    sealed.openStream(viaClose);
    const unsubscribe = sealed.openStream(viaUnsubscribe);
    sealed.closeStream(viaClose);
    unsubscribe();

    await sealed.queue(inc);

    expect(viaClose).not.toHaveBeenCalled();
    expect(viaUnsubscribe).not.toHaveBeenCalled();
  });

  it("does not expose addCommandHandler", () => {
    const store = createStore({});
    const sealed = sealStore(store);
    expect(Object.hasOwn(sealed, "addCommandHandler")).toBe(false);
  });

  it("does not expose addEventHandler", () => {
    const store = createStore({});
    const sealed = sealStore(store);
    expect(Object.hasOwn(sealed, "addEventHandler")).toBe(false);
  });
});

describe("sealed state immutability", () => {
  it("throws on a top-level write and leaves the store untouched", () => {
    const store = createStore({ n: 1 });
    const sealed = sealStore(store);

    expect(() => {
      // @ts-expect-error sealed state is deeply readonly
      sealed.state.n = 999;
    }).toThrow(TypeError);
    expect(store.state.n).toBe(1);
  });

  it("throws on a nested write", () => {
    const store = createStore({ nested: { deep: [1, 2] } });
    const sealed = sealStore(store);

    expect(() => {
      // @ts-expect-error sealed state is deeply readonly
      sealed.state.nested.deep = [3];
    }).toThrow(TypeError);
    expect(() => {
      (sealed.state.nested.deep as number[]).push(3);
    }).toThrow(TypeError);
    expect(store.state.nested.deep).toEqual([1, 2]);
  });

  it("freezes state produced by a command", async () => {
    const store = createStore({ items: [{ id: 1 }] });
    store.addCommandHandler(inc, (ctx) => {
      ctx.setState({ items: [...ctx.state.items, { id: 2 }] });
    });

    await store.queue(inc);

    expect(() => {
      // @ts-expect-error state is deeply readonly
      store.state.items[0].id = 9;
    }).toThrow(TypeError);
    expect(store.state.items.map((item) => item.id)).toEqual([1, 2]);
  });

  it("stays clonable and serializable", () => {
    const store = createStore({ nested: { list: [1, 2], when: "now" } });

    expect(JSON.parse(JSON.stringify(store.state))).toEqual({
      nested: { list: [1, 2], when: "now" },
    });
    const clone = structuredClone(store.state);
    expect(clone).toEqual(store.state);
    expect(Object.isFrozen(clone)).toBe(false);
  });

  it("keeps the previous and next stateChanged payloads frozen", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler(inc, (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const seen: { prev: unknown; next: unknown }[] = [];
    store.openStream((event) => {
      if (matchEvent(event, BuiltinEvent.StateChanged)) seen.push(event.data);
    });

    await store.queue(inc);

    expect(seen).toHaveLength(1);
    expect(Object.isFrozen(seen[0].prev)).toBe(true);
    expect(Object.isFrozen(seen[0].next)).toBe(true);
  });
});

describe("handledEvent", () => {
  it("creates an event def matching auto-notify naming", () => {
    const evt = handledEvent("initUser");
    expect(evt.name).toBe("initUser:handled");
    expect(typeof evt.id).toBe("symbol");
  });

  it("returns the same identity for the same command name", () => {
    expect(handledEvent("initUser").id).toBe(handledEvent("initUser").id);
    expect(handledEvent("initUser").id).not.toBe(handledEvent("other").id);
  });

  it("fires an event handler registered for a notify command", async () => {
    const store = createStore({ count: 0 });
    const received: string[] = [];

    store.addCommandHandler(
      "go",
      (ctx) => {
        ctx.setState({ count: ctx.state.count + 1 });
      },
      { notify: true },
    );
    store.addEventHandler(handledEvent("go"), (_ctx, event) => {
      received.push(event.data.command.name);
    });

    store.queue(createCommand("go", undefined));
    await store.flush();

    expect(received).toEqual(["go"]);
  });
});
