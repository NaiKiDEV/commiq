import { describe, it, expect, vi } from "vitest";
import { renderHook, render, act } from "@testing-library/react";
import React from "react";
import {
  createStore,
  createCommand,
  createCommandDef,
  sealStore,
} from "@naikidev/commiq";
import {
  useSelector,
  useStore,
  useQueue,
  useFlush,
  shallowEqual,
} from "../index";
import { spyOnSubscriptions } from "./helpers";

type CounterState = {
  count: number;
  name: string;
}

const incDef = createCommandDef("inc");
const loadDef = createCommandDef("load");
const failDef = createCommandDef("fail");

function createCounter() {
  const store = createStore<CounterState>({ count: 0, name: "Alice" });
  store.addCommandHandler(incDef, (ctx) => {
    ctx.setState({ ...ctx.state, count: ctx.state.count + 1 });
  });
  store.addCommandHandler<string>("setName", (ctx, cmd) => {
    ctx.setState({ ...ctx.state, name: cmd.data });
  });
  return { store, sealed: sealStore(store) };
}

describe("useSelector", () => {
  it("returns the selected slice of state", () => {
    const { sealed } = createCounter();

    const { result } = renderHook(() => useSelector(sealed, (s) => s.count));

    expect(result.current).toBe(0);
  });

  it("re-renders when selected state changes", async () => {
    const { store, sealed } = createCounter();

    const { result } = renderHook(() => useSelector(sealed, (s) => s.count));

    await act(async () => {
      store.queue(incDef);
      await store.flush();
    });

    expect(result.current).toBe(1);
  });

  it("does not re-render when unrelated state changes", async () => {
    const { store, sealed } = createCounter();
    const renderCount = vi.fn();

    renderHook(() => {
      renderCount();
      return useSelector(sealed, (s) => s.count);
    });

    const before = renderCount.mock.calls.length;

    await act(async () => {
      store.queue(createCommand("setName", "Bob"));
      await store.flush();
    });

    expect(renderCount.mock.calls.length).toBe(before);
  });

  it("observes intermediate state written inside an async handler", async () => {
    const store = createStore<{ status: string }>({ status: "idle" });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    store.addCommandHandler(loadDef, async (ctx) => {
      ctx.setState({ status: "loading" });
      await gate;
      ctx.setState({ status: "done" });
    });
    const sealed = sealStore(store);
    const seen: string[] = [];

    renderHook(() => {
      seen.push(useSelector(sealed, (s) => s.status));
    });

    await act(async () => {
      store.queue(loadDef);
      await Promise.resolve();
    });

    expect(seen).toContain("loading");
    expect(seen).not.toContain("done");

    await act(async () => {
      release();
      await store.flush();
    });

    expect(seen).toContain("done");
  });

  it("caches an object-returning selector instead of looping", async () => {
    const { store, sealed } = createCounter();
    const renderCount = vi.fn();

    const { result } = renderHook(() => {
      renderCount();
      return useSelector(sealed, (s) => ({ count: s.count, name: s.name }));
    });

    expect(result.current).toEqual({ count: 0, name: "Alice" });
    const rendersAfterMount = renderCount.mock.calls.length;
    expect(rendersAfterMount).toBeLessThan(5);

    await act(async () => {
      store.queue(incDef);
      await store.flush();
    });

    expect(result.current).toEqual({ count: 1, name: "Alice" });
    expect(renderCount.mock.calls.length).toBeLessThan(rendersAfterMount + 5);
  });

  it("keeps an object selection stable across renders with shallowEqual", async () => {
    const { store, sealed } = createCounter();

    const { result, rerender } = renderHook(() =>
      useSelector(sealed, (s) => ({ name: s.name }), shallowEqual),
    );

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    await act(async () => {
      store.queue(incDef);
      await store.flush();
    });

    expect(result.current).toBe(first);
  });

  it("re-runs a derived selector when the source state changes", async () => {
    const store = createStore<{ items: { done: boolean }[] }>({ items: [] });
    store.addCommandHandler(incDef, (ctx) => {
      ctx.setState({ items: [...ctx.state.items, { done: true }] });
    });
    const sealed = sealStore(store);

    const { result } = renderHook(() =>
      useSelector(sealed, (s) => s.items.filter((i) => i.done).length),
    );

    expect(result.current).toBe(0);

    await act(async () => {
      store.queue(incDef);
      await store.flush();
    });

    expect(result.current).toBe(1);
  });

  it("shares one store between two components", async () => {
    const { store, sealed } = createCounter();
    const counts: number[] = [];
    const doubles: number[] = [];

    function Count() {
      counts.push(useSelector(sealed, (s) => s.count));
      return null;
    }

    function Doubled() {
      doubles.push(useSelector(sealed, (s) => s.count * 2));
      return null;
    }

    render(
      <>
        <Count />
        <Doubled />
      </>,
    );

    await act(async () => {
      store.queue(incDef);
      await store.flush();
    });

    expect(counts.at(-1)).toBe(1);
    expect(doubles.at(-1)).toBe(2);
  });

  it("opens exactly one subscription and releases it on unmount", () => {
    const { sealed } = createCounter();
    const spy = spyOnSubscriptions(sealed);

    const { unmount } = renderHook(() =>
      useSelector(spy.store, (s) => s.count),
    );

    expect(spy.activeCount()).toBe(1);
    unmount();
    expect(spy.activeCount()).toBe(0);
    expect(spy.unsubscribeCount()).toBe(spy.openCount());
  });
});

describe("useStore", () => {
  it("returns the whole state and updates on change", async () => {
    const { store, sealed } = createCounter();

    const { result } = renderHook(() => useStore(sealed));

    expect(result.current.count).toBe(0);

    await act(async () => {
      store.queue(incDef);
      await store.flush();
    });

    expect(result.current.count).toBe(1);
  });
});

describe("useQueue", () => {
  it("returns a handle that resolves with the command result", async () => {
    const { store, sealed } = createCounter();

    const { result } = renderHook(() => useQueue(sealed));

    await act(async () => {
      const outcome = await result.current(incDef);
      expect(outcome.status).toBe("handled");
    });

    expect(store.state.count).toBe(1);
  });

  it("reports a failing command through the handle", async () => {
    const store = createStore<{ count: number }>(
      { count: 0 },
      { onError: () => {} },
    );
    store.addCommandHandler(failDef, () => {
      throw new Error("nope");
    });
    const sealed = sealStore(store);

    const { result } = renderHook(() => useQueue(sealed));

    await act(async () => {
      const outcome = await result.current(failDef);
      expect(outcome.status).toBe("failed");
      expect(outcome.error).toBeInstanceOf(Error);
    });
  });

  it("returns a stable reference across re-renders", () => {
    const { sealed } = createCounter();

    const { result, rerender } = renderHook(() => useQueue(sealed));

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("survives unmount during an in-flight dispatch", async () => {
    const store = createStore<{ status: string }>({ status: "idle" });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    store.addCommandHandler(loadDef, async (ctx) => {
      ctx.setState({ status: "loading" });
      await gate;
      ctx.setState({ status: "done" });
    });
    const sealed = sealStore(store);
    const spy = spyOnSubscriptions(sealed);

    const { result, unmount } = renderHook(() => {
      useSelector(spy.store, (s) => s.status);
      return useQueue(spy.store);
    });

    const settled: string[] = [];
    await act(async () => {
      result.current(loadDef).then((outcome) => {
        settled.push(outcome.status);
      });
      await Promise.resolve();
    });

    unmount();
    expect(spy.activeCount()).toBe(0);

    await act(async () => {
      release();
      await store.flush();
    });

    expect(settled).toEqual(["handled"]);
    expect(store.state.status).toBe("done");
  });
});

describe("useFlush", () => {
  it("awaits full quiescence of the store", async () => {
    const { store, sealed } = createCounter();

    const { result } = renderHook(() => useFlush(sealed));

    await act(async () => {
      store.queue(incDef);
      store.queue(incDef);
      await result.current();
    });

    expect(store.state.count).toBe(2);
  });
});

describe("shallowEqual", () => {
  it("compares one level deep", () => {
    expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual([1, 2], [1, 2])).toBe(true);
    expect(shallowEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(shallowEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(false);
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual(null, {})).toBe(false);
  });
});
