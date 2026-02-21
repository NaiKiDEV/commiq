import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import {
  createStore,
  createCommand,
  createEvent,
  sealStore,
  type SealedStore,
} from "@naikidev/commiq";
import { CommiqProvider, useSelector, useQueue, useEvent } from "../index";

function createWrapper(stores: Record<string, SealedStore<any>>) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(CommiqProvider, { stores }, children);
}

describe("useSelector", () => {
  it("returns the selected slice of state", () => {
    const store = createStore({ count: 5 });
    const sealed = sealStore(store);

    const { result } = renderHook(() => useSelector(sealed, (s) => s.count), {
      wrapper: createWrapper({ counter: sealed }),
    });

    expect(result.current).toBe(5);
  });

  it("re-renders when selected state changes", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    const sealed = sealStore(store);

    const { result } = renderHook(() => useSelector(sealed, (s) => s.count), {
      wrapper: createWrapper({ counter: sealed }),
    });

    expect(result.current).toBe(0);

    await act(async () => {
      store.queue(createCommand("inc", undefined));
      await store.flush();
    });

    expect(result.current).toBe(1);
  });

  it("does not re-render when unrelated state changes", async () => {
    const store = createStore({ count: 0, name: "Alice" });
    store.addCommandHandler<string>("setName", (ctx, cmd) => {
      ctx.setState({ ...ctx.state, name: cmd.data });
    });
    const sealed = sealStore(store);
    const renderCount = vi.fn();

    renderHook(
      () => {
        renderCount();
        return useSelector(sealed, (s) => s.count);
      },
      { wrapper: createWrapper({ user: sealed }) },
    );

    const initialRenderCount = renderCount.mock.calls.length;

    await act(async () => {
      store.queue(createCommand("setName", "Bob"));
      await store.flush();
    });

    expect(renderCount.mock.calls.length).toBe(initialRenderCount);
  });
});

describe("useQueue", () => {
  it("returns a queue function bound to the store", async () => {
    const store = createStore({ count: 0 });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });
    const sealed = sealStore(store);

    const { result } = renderHook(() => useQueue(sealed), {
      wrapper: createWrapper({ counter: sealed }),
    });

    await act(async () => {
      result.current(createCommand("inc", undefined));
      await store.flush();
    });

    expect(store.state.count).toBe(1);
  });

  it("returns a stable reference across re-renders", () => {
    const store = createStore({ count: 0 });
    const sealed = sealStore(store);

    const { result, rerender } = renderHook(() => useQueue(sealed), {
      wrapper: createWrapper({ counter: sealed }),
    });

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe("useEvent", () => {
  it("calls handler when a matching event is emitted", async () => {
    const userCreated = createEvent<{ name: string }>("userCreated");
    const store = createStore({ user: "" });
    store.addCommandHandler<{ name: string }>("createUser", (ctx, cmd) => {
      ctx.setState({ user: cmd.data.name });
      ctx.emit(userCreated, { name: cmd.data.name });
    });
    const sealed = sealStore(store);
    const handler = vi.fn();

    renderHook(() => useEvent(sealed, userCreated, handler), {
      wrapper: createWrapper({ user: sealed }),
    });

    await act(async () => {
      store.queue(createCommand("createUser", { name: "Alice" }));
      await store.flush();
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Alice" } }),
    );
  });

  it("unsubscribes on unmount", async () => {
    const evt = createEvent("ping");
    const store = createStore({});
    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(evt, undefined);
    });
    const sealed = sealStore(store);
    const handler = vi.fn();

    const { unmount } = renderHook(() => useEvent(sealed, evt, handler), {
      wrapper: createWrapper({ s: sealed }),
    });

    unmount();

    await act(async () => {
      store.queue(createCommand("fire", undefined));
      await store.flush();
    });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("CommiqProvider", () => {
  it("provides stores via context", () => {
    const store = createStore({ value: 42 });
    const sealed = sealStore(store);

    const { result } = renderHook(() => useSelector(sealed, (s) => s.value), {
      wrapper: createWrapper({ myStore: sealed }),
    });

    expect(result.current).toBe(42);
  });
});
