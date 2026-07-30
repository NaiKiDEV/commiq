import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createCommand, createStore, sealStore } from "@naikidev/commiq";
import { MAX_TRACKED_ERRORS, useDevtoolsEngine } from "../hooks/useDevtoolsEngine";
import type { DevtoolsStoreLike, DevtoolsStoreRegistry } from "../types";

type Counter = { renders: number };

function counterStore() {
  const store = createStore<{ count: number }>({ count: 0 });
  store.addCommandHandler("inc", (ctx) => {
    ctx.setState({ count: ctx.state.count + 1 });
  });
  store.addCommandHandler("boom", () => {
    throw new Error("boom");
  });
  return store;
}

function sealedCounter(): {
  store: ReturnType<typeof counterStore>;
  stores: DevtoolsStoreRegistry;
} {
  const store = counterStore();
  const sealed: DevtoolsStoreLike = sealStore(store);
  return { store, stores: { counter: sealed } };
}

function trackedEngine(stores: DevtoolsStoreRegistry, counter: Counter) {
  counter.renders += 1;
  return useDevtoolsEngine(stores, 500);
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useDevtoolsEngine identity stability (DT-1)", () => {
  it("returns the identical timeline array across re-renders with no new events", async () => {
    const { stores } = sealedCounter();
    const counter: Counter = { renders: 0 };
    const { result, rerender } = renderHook(() => trackedEngine(stores, counter));

    const first = result.current.timeline;
    rerender();
    rerender();
    rerender();

    expect(result.current.timeline).toBe(first);
    await settle();
  });

  it("returns the identical engine object when nothing changed", () => {
    const { stores } = sealedCounter();
    const counter: Counter = { renders: 0 };
    const { result, rerender } = renderHook(() => trackedEngine(stores, counter));

    const engine = result.current;
    rerender();

    expect(result.current).toBe(engine);
  });

  it("returns a new timeline identity once events arrive and holds it steady after", async () => {
    const { store, stores } = sealedCounter();
    const counter: Counter = { renders: 0 };
    const { result, rerender } = renderHook(() => trackedEngine(stores, counter));

    const before = result.current.timeline;

    await act(async () => {
      store.queue(createCommand("inc", undefined));
      await store.flush();
    });
    await settle();

    const after = result.current.timeline;
    expect(after).not.toBe(before);
    expect(after.length).toBeGreaterThan(0);

    rerender();
    expect(result.current.timeline).toBe(after);
  });

  it("coalesces a burst of events into far fewer renders than events", async () => {
    const { store, stores } = sealedCounter();
    const counter: Counter = { renders: 0 };
    renderHook(() => trackedEngine(stores, counter));

    const baseline = counter.renders;

    await act(async () => {
      for (let i = 0; i < 25; i += 1) {
        store.queue(createCommand("inc", undefined));
      }
      await store.flush();
    });
    await settle();

    const rendersFromBurst = counter.renders - baseline;
    expect(rendersFromBurst).toBeGreaterThan(0);
    expect(rendersFromBurst).toBeLessThan(6);
  });

  it("memoizes storeStates identity while no event has been recorded", () => {
    const { stores } = sealedCounter();
    const counter: Counter = { renders: 0 };
    const { result, rerender } = renderHook(() => trackedEngine(stores, counter));

    const states = result.current.storeStates;
    rerender();
    expect(result.current.storeStates).toBe(states);
  });
});

describe("useDevtoolsEngine clear and errors", () => {
  it("clears the timeline, counters and errors on clear()", async () => {
    const { store, stores } = sealedCounter();
    const counter: Counter = { renders: 0 };
    const { result } = renderHook(() => trackedEngine(stores, counter));

    await act(async () => {
      store.queue(createCommand("inc", undefined));
      store.queue(createCommand("boom", undefined));
      await store.flush();
    });
    await settle();

    expect(result.current.timeline.length).toBeGreaterThan(0);
    expect(result.current.errorCount).toBeGreaterThan(0);

    await act(async () => {
      result.current.clear();
    });
    await settle();

    expect(result.current.timeline).toHaveLength(0);
    expect(result.current.eventCount).toBe(0);
    expect(result.current.errorCount).toBe(0);
    expect(result.current.errors).toHaveLength(0);
    expect(result.current.clearCount).toBe(1);
  });

  it("records command errors and exposes only toast-sized data", async () => {
    const { store, stores } = sealedCounter();
    const counter: Counter = { renders: 0 };
    const { result } = renderHook(() => trackedEngine(stores, counter));

    await act(async () => {
      store.queue(createCommand("boom", undefined));
      await store.flush();
    });
    await settle();

    expect(result.current.errors).toHaveLength(1);
    expect(Object.keys(result.current.errors[0]).sort()).toEqual([
      "correlationId",
      "id",
      "name",
      "storeName",
    ]);
    expect(result.current.errors[0].storeName).toBe("counter");
  });

  it("caps retained errors while still counting all of them (DT-8)", async () => {
    const { store, stores } = sealedCounter();
    const counter: Counter = { renders: 0 };
    const { result } = renderHook(() => trackedEngine(stores, counter));

    const total = MAX_TRACKED_ERRORS + 12;

    await act(async () => {
      for (let i = 0; i < total; i += 1) {
        store.queue(createCommand("boom", undefined));
      }
      await store.flush();
    });
    await settle();

    expect(result.current.errorCount).toBe(total);
    expect(result.current.errors).toHaveLength(MAX_TRACKED_ERRORS);
    expect(result.current.errors[result.current.errors.length - 1].id).toBe(total - 1);
  });

  it("clearErrors empties errors without clearing the timeline (DT-13)", async () => {
    const { store, stores } = sealedCounter();
    const counter: Counter = { renders: 0 };
    const { result } = renderHook(() => trackedEngine(stores, counter));

    await act(async () => {
      store.queue(createCommand("boom", undefined));
      await store.flush();
    });
    await settle();

    const timelineLength = result.current.timeline.length;

    await act(async () => {
      result.current.clearErrors();
    });

    expect(result.current.errors).toHaveLength(0);
    expect(result.current.errorCount).toBe(0);
    expect(result.current.timeline).toHaveLength(timelineLength);
  });

  it("exposes a working chain lookup", async () => {
    const { store, stores } = sealedCounter();
    const counter: Counter = { renders: 0 };
    const { result } = renderHook(() => trackedEngine(stores, counter));

    await act(async () => {
      store.queue(createCommand("inc", undefined));
      await store.flush();
    });
    await settle();

    const first = result.current.timeline[0];
    expect(result.current.getChain(first.correlationId).length).toBeGreaterThan(0);
  });
});
