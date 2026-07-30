import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React, { StrictMode } from "react";
import { createStore, createCommandDef, sealStore } from "@naikidev/commiq";
import { useCommandStatus } from "../index";
import { spyOnSubscriptions } from "./helpers";

const saveDef = createCommandDef("save");
const otherDef = createCommandDef("other");

type Gate = {
  release: () => void;
  wait: Promise<void>;
}

function createGate(): Gate {
  let release = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, wait };
}

function strictWrapper({ children }: { children?: React.ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

describe("useCommandStatus", () => {
  it("tracks pending across a successful async command", async () => {
    const gate = createGate();
    const store = createStore<{ saved: boolean }>({ saved: false });
    store.addCommandHandler(saveDef, async (ctx) => {
      await gate.wait;
      ctx.setState({ saved: true });
    });
    const sealed = sealStore(store);

    const { result } = renderHook(() => useCommandStatus(sealed, saveDef));

    expect(result.current).toEqual({
      pending: false,
      error: null,
      lastCompletedAt: null,
    });

    await act(async () => {
      store.queue(saveDef);
      await Promise.resolve();
    });

    expect(result.current.pending).toBe(true);

    await act(async () => {
      gate.release();
      await store.flush();
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastCompletedAt).toBeTypeOf("number");
  });

  it("surfaces the error of a failing command and clears it on retry", async () => {
    let shouldFail = true;
    const store = createStore<{ saved: boolean }>(
      { saved: false },
      { onError: () => {} },
    );
    store.addCommandHandler(saveDef, (ctx) => {
      if (shouldFail) throw new Error("save failed");
      ctx.setState({ saved: true });
    });
    const sealed = sealStore(store);

    const { result } = renderHook(() => useCommandStatus(sealed, "save"));

    await act(async () => {
      store.queue(saveDef);
      await store.flush();
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);

    shouldFail = false;
    await act(async () => {
      store.queue(saveDef);
      await store.flush();
    });

    expect(result.current.error).toBeNull();
    expect(store.state.saved).toBe(true);
  });

  it("ignores lifecycle events of other commands", async () => {
    const store = createStore<{ n: number }>({ n: 0 });
    store.addCommandHandler(otherDef, (ctx) => {
      ctx.setState({ n: ctx.state.n + 1 });
    });
    const sealed = sealStore(store);

    const { result } = renderHook(() => useCommandStatus(sealed, saveDef));

    await act(async () => {
      store.queue(otherDef);
      await store.flush();
    });

    expect(result.current.lastCompletedAt).toBeNull();
  });

  it("reports an unregistered command as completed", async () => {
    const store = createStore<{ n: number }>({ n: 0 }, { onError: () => {} });
    const sealed = sealStore(store);

    const { result } = renderHook(() => useCommandStatus(sealed, saveDef));

    await act(async () => {
      store.queue(saveDef);
      await store.flush();
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.lastCompletedAt).toBeTypeOf("number");
  });

  it("stays pending until every concurrent run settles", async () => {
    const first = createGate();
    const second = createGate();
    const gates = [first, second];
    let index = 0;
    const store = createStore<{ n: number }>({ n: 0 });
    store.addCommandHandler(saveDef, async (ctx) => {
      const gate = gates[index++];
      await gate.wait;
      ctx.setState({ n: ctx.state.n + 1 });
    });
    const sealed = sealStore(store);

    const { result } = renderHook(() => useCommandStatus(sealed, saveDef));

    await act(async () => {
      store.queue(saveDef);
      store.queue(saveDef);
      await Promise.resolve();
    });

    expect(result.current.pending).toBe(true);

    await act(async () => {
      first.release();
      await Promise.resolve();
    });

    expect(result.current.pending).toBe(true);

    await act(async () => {
      second.release();
      await store.flush();
    });

    expect(result.current.pending).toBe(false);
    expect(store.state.n).toBe(2);
  });

  it("keeps one live subscription under StrictMode", () => {
    const store = createStore<{ n: number }>({ n: 0 });
    const spy = spyOnSubscriptions(sealStore(store));

    const { unmount } = renderHook(
      () => useCommandStatus(spy.store, saveDef),
      { wrapper: strictWrapper },
    );

    expect(spy.activeCount()).toBe(1);
    unmount();
    expect(spy.activeCount()).toBe(0);
  });

  it("resets when the tracked command name changes", async () => {
    const store = createStore<{ n: number }>({ n: 0 });
    store.addCommandHandler(saveDef, (ctx) => {
      ctx.setState({ n: ctx.state.n + 1 });
    });
    const sealed = sealStore(store);

    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useCommandStatus(sealed, name),
      { initialProps: { name: "save" } },
    );

    await act(async () => {
      store.queue(saveDef);
      await store.flush();
    });

    expect(result.current.lastCompletedAt).toBeTypeOf("number");

    await act(async () => {
      rerender({ name: "other" });
    });

    expect(result.current.lastCompletedAt).toBeNull();
  });
});

describe("useCommandStatus wiring", () => {
  it("does not require store fields to render a spinner", async () => {
    const gate = createGate();
    const store = createStore<{ users: string[] }>({ users: [] });
    store.addCommandHandler(saveDef, async (ctx) => {
      await gate.wait;
      ctx.setState({ users: ["a"] });
    });
    const sealed = sealStore(store);
    const seen: boolean[] = [];

    renderHook(() => {
      const status = useCommandStatus(sealed, saveDef);
      seen.push(status.pending);
    });

    await act(async () => {
      store.queue(saveDef);
      await Promise.resolve();
    });

    await act(async () => {
      gate.release();
      await store.flush();
    });

    expect(seen).toContain(true);
    expect(seen.at(-1)).toBe(false);
    expect(store.state.users).toEqual(["a"]);
  });
});
