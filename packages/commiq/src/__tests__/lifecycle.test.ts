import { describe, it, expect, vi } from "vitest";
import {
  BuiltinEvent,
  createCommand,
  createCommandDef,
  createEvent,
  createEventBus,
  createStore,
  handledEvent,
  type Disposable,
  type StoreErrorReport,
} from "../index";
import { createGate } from "./gate";

type State = { count: number };

const bump = createCommandDef("bump");

describe("addEventHandler unsubscription", () => {
  it("returns an unsubscribe that stops a single registration", async () => {
    const store = createStore<State>({ count: 0 });
    const fired = createEvent<void>("fired");
    const first = vi.fn();
    const second = vi.fn();

    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(fired, undefined);
    });

    const unsubscribeFirst = store.addEventHandler(fired, first);
    store.addEventHandler(fired, second);
    unsubscribeFirst();

    await store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("does not accumulate duplicate invocations across subscribe cycles", async () => {
    const store = createStore<State>({ count: 0 });
    const fired = createEvent<void>("fired");
    const handler = vi.fn();

    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(fired, undefined);
    });

    for (let mount = 0; mount < 5; mount += 1) {
      const unsubscribe = store.addEventHandler(fired, handler);
      unsubscribe();
    }
    store.addEventHandler(fired, handler);

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(handler).toHaveBeenCalledOnce();
  });

  it("removeEventHandler reports whether the handler was registered", () => {
    const store = createStore<State>({ count: 0 });
    const fired = createEvent<void>("fired");
    const handler = vi.fn();

    store.addEventHandler(fired, handler);

    expect(store.removeEventHandler(fired, handler)).toBe(true);
    expect(store.removeEventHandler(fired, handler)).toBe(false);
  });
});

describe("openStream unsubscription", () => {
  it("returns an unsubscribe alongside the existing closeStream", async () => {
    const store = createStore<State>({ count: 0 });
    const viaUnsubscribe = vi.fn();
    const viaCloseStream = vi.fn();

    store.addCommandHandler(bump, (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    const unsubscribe = store.openStream(viaUnsubscribe);
    store.openStream(viaCloseStream);
    unsubscribe();
    store.closeStream(viaCloseStream);

    await store.queue(bump);

    expect(viaUnsubscribe).not.toHaveBeenCalled();
    expect(viaCloseStream).not.toHaveBeenCalled();
  });
});

describe("command handler registration", () => {
  it("reports a duplicate registration instead of replacing it silently", () => {
    const reports: StoreErrorReport[] = [];
    const store = createStore<State>(
      { count: 0 },
      { onError: (report) => reports.push(report) },
    );

    store.addCommandHandler(bump, () => {});
    store.addCommandHandler(bump, () => {});

    expect(reports.map((report) => report.source)).toEqual([
      "duplicateHandler",
    ]);
    expect((reports[0].error as Error).message).toContain('"bump"');
  });

  it("removeCommandHandler makes later commands invalid", async () => {
    const store = createStore<State>({ count: 0 });
    store.addCommandHandler(bump, (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    await store.queue(bump);
    expect(store.removeCommandHandler(bump)).toBe(true);
    const result = await store.queue(bump);

    expect(result.status).toBe("invalid");
    expect(store.state.count).toBe(1);
  });
});

describe("destroy", () => {
  it("conforms to the Disposable contract", () => {
    const store = createStore<State>({ count: 0 });
    const bus = createEventBus();
    const disposables: Disposable[] = [store, bus];

    for (const disposable of disposables) {
      disposable.destroy();
    }

    expect(disposables).toHaveLength(2);
  });

  it("discards queued commands and settles their handles", async () => {
    const gate = createGate();
    const store = createStore<State>({ count: 0 });

    store.addCommandHandler("slow", async () => {
      await gate.wait();
    });
    store.addCommandHandler(bump, (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    store.queue(createCommand("slow", undefined));
    const discarded = store.queue(bump);
    await gate.parked();

    store.destroy();

    expect((await discarded).status).toBe("discarded");
    expect(store.state.count).toBe(0);
    gate.release();
  });

  it("aborts in-flight interruptable commands", async () => {
    const gate = createGate();
    const store = createStore<State>({ count: 0 });
    const signals: (AbortSignal | undefined)[] = [];

    store.addCommandHandler(
      "slow",
      async (ctx) => {
        signals.push(ctx.signal);
        await gate.wait();
      },
      { interruptable: true },
    );

    store.queue(createCommand("slow", undefined));
    await gate.parked();
    store.destroy();

    expect(signals[0]?.aborted).toBe(true);
    gate.release();
    await store.flush();
  });

  it("settles pending flush callers", async () => {
    const gate = createGate();
    const store = createStore<State>({ count: 0 });
    store.addCommandHandler("slow", async () => {
      await gate.wait();
    });

    store.queue(createCommand("slow", undefined));
    const flushed = store.flush();
    await gate.parked();

    store.destroy();
    await flushed;
    gate.release();

    expect(true).toBe(true);
  });

  it("turns queue into a reported no-op", async () => {
    const reports: StoreErrorReport[] = [];
    const store = createStore<State>(
      { count: 0 },
      { onError: (report) => reports.push(report) },
    );
    const handler = vi.fn();
    store.addCommandHandler(bump, handler);

    store.destroy();
    const result = await store.queue(bump);

    expect(result.status).toBe("discarded");
    expect(handler).not.toHaveBeenCalled();
    expect(reports.map((report) => report.source)).toEqual(["destroyedStore"]);
  });

  it("stops notifying stream listeners and event handlers", async () => {
    const store = createStore<State>({ count: 0 }, { onError: () => {} });
    const listener = vi.fn();
    const eventHandler = vi.fn();

    store.addCommandHandler(bump, (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    store.openStream(listener);
    store.addEventHandler(BuiltinEvent.StateChanged, eventHandler);

    store.queue(bump);
    await store.flush();
    const callsBeforeDestroy = listener.mock.calls.length;
    store.destroy();

    store.queue(bump);
    await store.flush();

    expect(callsBeforeDestroy).toBeGreaterThan(0);
    expect(listener.mock.calls.length).toBe(callsBeforeDestroy);
    expect(eventHandler).toHaveBeenCalledOnce();
  });

  it("is idempotent", () => {
    const store = createStore<State>({ count: 0 });
    store.destroy();

    expect(() => store.destroy()).not.toThrow();
  });
});

describe("handledEvent interning", () => {
  it("fires registered handlers for a notify command", async () => {
    const store = createStore<State>({ count: 0 });
    const handled = vi.fn();

    store.addCommandHandler(
      bump,
      (ctx) => {
        ctx.setState({ count: ctx.state.count + 1 });
      },
      { notify: true },
    );
    store.addEventHandler(handledEvent("bump"), handled);

    store.queue(bump);
    await store.flush();

    expect(handled).toHaveBeenCalledOnce();
  });

  it("keeps the notify event identity stable across executions", async () => {
    const store = createStore<State>({ count: 0 });
    const ids: symbol[] = [];

    store.addCommandHandler(bump, () => {}, { notify: true });
    store.openStream((event) => {
      if (event.name === "bump:handled") ids.push(event.id);
    });

    await store.queue(bump);
    await store.queue(bump);

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toBe(handledEvent("bump").id);
  });
});
