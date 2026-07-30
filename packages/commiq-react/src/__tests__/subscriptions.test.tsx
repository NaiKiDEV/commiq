import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React, { StrictMode } from "react";
import {
  createStore,
  createCommandDef,
  createEvent,
  handledEvent,
  sealStore,
} from "@naikidev/commiq";
import type {
  SealedStore,
  StoreErrorReport,
  StoreEvent,
  StreamListener,
} from "@naikidev/commiq";
import { useEvent, useStream, useSelector } from "../index";
import { spyOnSubscriptions, captureUncaught, flushMicrotasks } from "./helpers";

const pingDef = createCommandDef("ping");
const notifyDef = createCommandDef("notified");
const pinged = createEvent<{ value: number }>("pinged");
const other = createEvent<{ value: number }>("other");

function strictWrapper({ children }: { children?: React.ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

function createPinger() {
  const store = createStore<{ value: number }>({ value: 0 });
  store.addCommandHandler(pingDef, (ctx) => {
    ctx.setState({ value: ctx.state.value + 1 });
    ctx.emit(pinged, { value: ctx.state.value });
  });
  store.addCommandHandler(
    notifyDef,
    (ctx) => {
      ctx.setState({ value: ctx.state.value + 10 });
    },
    { notify: true },
  );
  return { store, sealed: sealStore(store) };
}

type ManualStore = {
  store: SealedStore<{ count: number }>;
  setState: (next: { count: number }) => void;
  publish: (event: StoreEvent) => void;
}

function createManualStore(): ManualStore {
  const backing = sealStore(createStore<{ count: number }>({ count: 0 }));
  const listeners = new Set<StreamListener>();
  let current = { count: 0 };

  const store: SealedStore<{ count: number }> = {
    get state() {
      return current;
    },
    queue: backing.queue,
    flush: () => backing.flush(),
    suspend: () => backing.suspend(),
    openStream: (listener: StreamListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    closeStream: (listener: StreamListener) => {
      listeners.delete(listener);
    },
  };

  return {
    store,
    setState: (next) => {
      current = next;
    },
    publish: (event) => {
      for (const listener of [...listeners]) listener(event);
    },
  };
}

function customEvent(name: string): StoreEvent {
  return {
    id: Symbol(name),
    name,
    data: undefined,
    timestamp: Date.now(),
    correlationId: "manual",
    causedBy: null,
  };
}

describe("useEvent", () => {
  it("calls the handler for a matching event only", async () => {
    const { store, sealed } = createPinger();
    const handler = vi.fn();

    renderHook(() => useEvent(sealed, pinged, handler));

    await act(async () => {
      store.queue(pingDef);
      await store.flush();
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ data: { value: 1 } }),
    );
  });

  it("does not call the handler for another event definition", async () => {
    const { store, sealed } = createPinger();
    const handler = vi.fn();

    renderHook(() => useEvent(sealed, other, handler));

    await act(async () => {
      store.queue(pingDef);
      await store.flush();
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("releases its subscription on unmount", async () => {
    const { store, sealed } = createPinger();
    const spy = spyOnSubscriptions(sealed);
    const handler = vi.fn();

    const { unmount } = renderHook(() => useEvent(spy.store, pinged, handler));

    unmount();
    expect(spy.activeCount()).toBe(0);

    await act(async () => {
      store.queue(pingDef);
      await store.flush();
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps one live subscription and one handler call under StrictMode", async () => {
    const { store, sealed } = createPinger();
    const spy = spyOnSubscriptions(sealed);
    const handler = vi.fn();

    renderHook(() => useEvent(spy.store, pinged, handler), {
      wrapper: strictWrapper,
    });

    expect(spy.activeCount()).toBe(1);

    await act(async () => {
      store.queue(pingDef);
      await store.flush();
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("resubscribes when the event definition changes", async () => {
    const { store, sealed } = createPinger();
    const spy = spyOnSubscriptions(sealed);
    const handler = vi.fn();

    const { rerender } = renderHook(
      ({ def }: { def: typeof pinged }) =>
        useEvent(spy.store, def, handler),
      { initialProps: { def: other } },
    );

    expect(spy.openCount()).toBe(1);

    await act(async () => {
      store.queue(pingDef);
      await store.flush();
    });
    expect(handler).not.toHaveBeenCalled();

    rerender({ def: pinged });
    expect(spy.openCount()).toBe(2);
    expect(spy.activeCount()).toBe(1);

    await act(async () => {
      store.queue(pingDef);
      await store.flush();
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not resubscribe for an inline handledEvent definition", () => {
    const { sealed } = createPinger();
    const spy = spyOnSubscriptions(sealed);
    const handler = vi.fn();

    const { rerender } = renderHook(() =>
      useEvent(spy.store, handledEvent("notified"), handler),
    );

    rerender();
    rerender();

    expect(spy.openCount()).toBe(1);
  });

  it("observes the handled event of a notify command", async () => {
    const { store, sealed } = createPinger();
    const handler = vi.fn();

    renderHook(() => useEvent(sealed, handledEvent("notified"), handler));

    await act(async () => {
      store.queue(notifyDef);
      await store.flush();
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("isolates a throwing handler from the store dispatch", async () => {
    const reports: StoreErrorReport[] = [];
    const store = createStore<{ value: number }>(
      { value: 0 },
      { onError: (report) => reports.push(report) },
    );
    store.addCommandHandler(pingDef, (ctx) => {
      ctx.setState({ value: ctx.state.value + 1 });
      ctx.emit(pinged, { value: ctx.state.value });
    });
    const sealed = sealStore(store);
    const survivor = vi.fn();
    const capture = captureUncaught();

    renderHook(() => {
      useEvent(sealed, pinged, () => {
        throw new Error("render bug");
      });
      useEvent(sealed, pinged, survivor);
    });

    let status = "";
    await act(async () => {
      const outcome = await sealed.queue(pingDef);
      status = outcome.status;
      await store.flush();
    });

    await flushMicrotasks();
    capture.restore();

    expect(status).toBe("handled");
    expect(survivor).toHaveBeenCalledTimes(1);
    expect(reports).toHaveLength(0);
    expect(capture.errors).toHaveLength(1);
    expect(store.state.value).toBe(1);
  });
});

describe("useStream", () => {
  it("receives every event from the store", async () => {
    const { store, sealed } = createPinger();
    const names: string[] = [];

    renderHook(() =>
      useStream(sealed, (event) => {
        names.push(event.name);
      }),
    );

    await act(async () => {
      store.queue(pingDef);
      await store.flush();
    });

    expect(names).toContain("commandStarted");
    expect(names).toContain("stateChanged");
    expect(names).toContain("pinged");
    expect(names).toContain("commandHandled");
  });

  it("uses the latest listener without resubscribing", async () => {
    const { store, sealed } = createPinger();
    const spy = spyOnSubscriptions(sealed);
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ listener }: { listener: StreamListener }) =>
        useStream(spy.store, listener),
      { initialProps: { listener: first } },
    );

    rerender({ listener: second });
    expect(spy.openCount()).toBe(1);

    await act(async () => {
      store.queue(pingDef);
      await store.flush();
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it("keeps one live subscription under StrictMode", () => {
    const { sealed } = createPinger();
    const spy = spyOnSubscriptions(sealed);

    renderHook(() => useStream(spy.store, vi.fn()), {
      wrapper: strictWrapper,
    });

    expect(spy.activeCount()).toBe(1);
  });
});

describe("useSelector subscription", () => {
  it("keeps one live subscription under StrictMode", () => {
    const { sealed } = createPinger();
    const spy = spyOnSubscriptions(sealed);

    const { unmount } = renderHook(
      () => useSelector(spy.store, (s) => s.value),
      { wrapper: strictWrapper },
    );

    expect(spy.activeCount()).toBe(1);
    unmount();
    expect(spy.activeCount()).toBe(0);
  });

  it("re-reads the snapshot for events that are not stateChanged", async () => {
    const manual = createManualStore();

    const { result } = renderHook(() =>
      useSelector(manual.store, (s) => s.count),
    );

    expect(result.current).toBe(0);

    await act(async () => {
      manual.setState({ count: 7 });
      manual.publish(customEvent("somethingHappened"));
    });

    expect(result.current).toBe(7);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
