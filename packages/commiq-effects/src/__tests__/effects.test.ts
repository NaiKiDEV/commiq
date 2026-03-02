import { describe, it, expect, vi } from "vitest";
import { createStore, createCommand, createEvent, sealStore } from "@naikidev/commiq";
import { createEffects } from "../effects";

function makeStore() {
  const store = createStore({ value: "" });
  store.addCommandHandler<string>("set", (ctx, cmd) => {
    ctx.setState({ value: cmd.data });
  });
  return store;
}

describe("createEffects", () => {
  it("triggers effect on matching event", async () => {
    const store = makeStore();
    const sealed = sealStore(store);
    const myEvent = createEvent<string>("myEvent");
    const effects = createEffects(sealed);
    const handler = vi.fn();

    effects.on(myEvent, handler);

    store.addCommandHandler("emitter", (ctx) => {
      ctx.emit(myEvent, "hello");
    });
    store.queue(createCommand("emitter", undefined));
    await store.flush();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("hello", expect.objectContaining({ signal: expect.any(AbortSignal) }));

    effects.destroy();
  });

  it("effect receives queue function that works", async () => {
    const store = makeStore();
    const sealed = sealStore(store);
    const trigger = createEvent<string>("trigger");
    const effects = createEffects(sealed);

    effects.on(trigger, (data, ctx) => {
      ctx.queue(createCommand("set", data));
    });

    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(trigger, "from-effect");
    });
    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(store.state.value).toBe("from-effect");

    effects.destroy();
  });

  it("restartOnNew cancels previous effect run", async () => {
    const store = makeStore();
    const sealed = sealStore(store);
    const trigger = createEvent<number>("trigger");
    const effects = createEffects(sealed);
    const runs: number[] = [];
    const aborted: number[] = [];

    effects.on(trigger, async (data, ctx) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (ctx.signal.aborted) {
        aborted.push(data);
        return;
      }
      runs.push(data);
    }, { restartOnNew: true });

    store.addCommandHandler<number>("emit", (ctx, cmd) => {
      ctx.emit(trigger, cmd.data);
    });

    store.queue(createCommand("emit", 1));
    await store.flush();

    // Queue another before the first completes
    await new Promise((r) => setTimeout(r, 10));
    store.queue(createCommand("emit", 2));
    await store.flush();

    // Wait for async effects to complete
    await new Promise((r) => setTimeout(r, 100));

    // First effect should have been aborted, only second runs
    expect(runs).toEqual([2]);

    effects.destroy();
  });

  it("cancelOn aborts running effect", async () => {
    const store = makeStore();
    const sealed = sealStore(store);
    const trigger = createEvent("start");
    const cancel = createEvent("cancel");
    const effects = createEffects(sealed);
    let wasAborted = false;

    effects.on(trigger, async (_data, ctx) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      wasAborted = ctx.signal.aborted;
    }, { cancelOn: cancel });

    store.addCommandHandler("startCmd", (ctx) => {
      ctx.emit(trigger, undefined);
    });
    store.addCommandHandler("cancelCmd", (ctx) => {
      ctx.emit(cancel, undefined);
    });

    store.queue(createCommand("startCmd", undefined));
    await store.flush();

    await new Promise((r) => setTimeout(r, 10));

    store.queue(createCommand("cancelCmd", undefined));
    await store.flush();

    await new Promise((r) => setTimeout(r, 150));

    expect(wasAborted).toBe(true);

    effects.destroy();
  });

  it("debounce delays execution, last-wins", async () => {
    const store = makeStore();
    const sealed = sealStore(store);
    const trigger = createEvent<number>("trigger");
    const effects = createEffects(sealed);
    const handled: number[] = [];

    effects.on(trigger, (data) => {
      handled.push(data);
    }, { debounce: 50 });

    store.addCommandHandler<number>("emit", (ctx, cmd) => {
      ctx.emit(trigger, cmd.data);
    });

    store.queue(createCommand("emit", 1));
    await store.flush();
    await new Promise((r) => setTimeout(r, 10));

    store.queue(createCommand("emit", 2));
    await store.flush();
    await new Promise((r) => setTimeout(r, 10));

    store.queue(createCommand("emit", 3));
    await store.flush();

    // Before debounce fires
    expect(handled).toEqual([]);

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 80));

    expect(handled).toEqual([3]);

    effects.destroy();
  });

  it("destroy cleans up everything", async () => {
    const store = makeStore();
    const sealed = sealStore(store);
    const trigger = createEvent("trigger");
    const effects = createEffects(sealed);
    const handler = vi.fn();

    effects.on(trigger, handler, { debounce: 50 });

    store.addCommandHandler("emit", (ctx) => {
      ctx.emit(trigger, undefined);
    });

    store.queue(createCommand("emit", undefined));
    await store.flush();

    effects.destroy();

    // Wait past debounce — handler should not fire
    await new Promise((r) => setTimeout(r, 80));
    expect(handler).not.toHaveBeenCalled();

    // New events should not trigger
    store.queue(createCommand("emit", undefined));
    await store.flush();
    await new Promise((r) => setTimeout(r, 80));
    expect(handler).not.toHaveBeenCalled();
  });

  it("AbortError in handler is silently swallowed", async () => {
    const store = makeStore();
    const sealed = sealStore(store);
    const trigger = createEvent("trigger");
    const effects = createEffects(sealed);

    effects.on(trigger, async (_data, ctx) => {
      await new Promise((_resolve, reject) => {
        ctx.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 10);
      });
    }, { restartOnNew: true });

    store.addCommandHandler("emit", (ctx) => {
      ctx.emit(trigger, undefined);
    });

    // This should not throw unhandled rejection
    store.queue(createCommand("emit", undefined));
    await store.flush();

    await new Promise((r) => setTimeout(r, 50));

    effects.destroy();
  });
});
