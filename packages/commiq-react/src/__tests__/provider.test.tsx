import { describe, it, expect, vi } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import React from "react";
import { createStore, createCommandDef, sealStore } from "@naikidev/commiq";
import type { QueueFn, SealedStore } from "@naikidev/commiq";
import {
  CommiqContext,
  CommiqProvider,
  useNamedStore,
  useStoreRegistry,
  useSelector,
  useQueue,
} from "../index";

type CartState = {
  items: string[];
}

const addDef = createCommandDef<string>("cart:add");

function createCart(items: string[] = []): SealedStore<CartState> {
  const store = createStore<CartState>({ items });
  store.addCommandHandler(addDef, (ctx, cmd) => {
    ctx.setState({ items: [...ctx.state.items, cmd.data] });
  });
  return sealStore(store);
}

function useNamedCartItems(): readonly string[] {
  return useSelector<CartState, readonly string[]>("cart", (s) => s.items);
}

describe("CommiqProvider", () => {
  it("exports the context and exposes the registry", () => {
    expect(CommiqContext).toBeDefined();

    const cart = createCart(["a"]);
    const { result } = renderHook(() => useStoreRegistry(), {
      wrapper: ({ children }) => (
        <CommiqProvider stores={{ cart }}>{children}</CommiqProvider>
      ),
    });

    expect(result.current.cart).toBe(cart);
  });

  it("resolves a store by name for useNamedStore", () => {
    const cart = createCart();
    const { result } = renderHook(() => useNamedStore<CartState>("cart"), {
      wrapper: ({ children }) => (
        <CommiqProvider stores={{ cart }}>{children}</CommiqProvider>
      ),
    });

    expect(result.current).toBe(cart);
  });

  it("drives useSelector and useQueue through a named store", async () => {
    const cart = createCart();
    const seen: string[][] = [];
    let queue: QueueFn | undefined;

    function Cart() {
      const items = useNamedCartItems();
      queue = useQueue<CartState>("cart");
      seen.push([...items]);
      return null;
    }

    render(
      <CommiqProvider stores={{ cart }}>
        <Cart />
      </CommiqProvider>,
    );

    expect(seen.at(-1)).toEqual([]);

    await act(async () => {
      queue?.(addDef, "espresso");
      await cart.flush();
    });

    expect(seen.at(-1)).toEqual(["espresso"]);
  });

  it("isolates two provider trees holding different stores", () => {
    const requestA = createCart(["a-item"]);
    const requestB = createCart(["b-item"]);
    const seen: Record<string, readonly string[]> = {};

    function Probe({ label }: { label: string }) {
      seen[label] = [...useNamedCartItems()];
      return null;
    }

    render(
      <>
        <CommiqProvider stores={{ cart: requestA }}>
          <Probe label="a" />
        </CommiqProvider>
        <CommiqProvider stores={{ cart: requestB }}>
          <Probe label="b" />
        </CommiqProvider>
      </>,
    );

    expect(seen.a).toEqual(["a-item"]);
    expect(seen.b).toEqual(["b-item"]);
  });

  it("renders per-request state on the server via getServerSnapshot", () => {
    const requestA = createCart(["user-a"]);
    const requestB = createCart(["user-b"]);

    function Cart() {
      return <span>{useNamedCartItems().join(",")}</span>;
    }

    const htmlA = renderToString(
      <CommiqProvider stores={{ cart: requestA }}>
        <Cart />
      </CommiqProvider>,
    );
    const htmlB = renderToString(
      <CommiqProvider stores={{ cart: requestB }}>
        <Cart />
      </CommiqProvider>,
    );

    expect(htmlA).toContain("user-a");
    expect(htmlA).not.toContain("user-b");
    expect(htmlB).toContain("user-b");
    expect(htmlB).not.toContain("user-a");
  });

  it("fails loudly for an unknown store name", () => {
    const cart = createCart();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      renderHook(() => useNamedStore("missing"), {
        wrapper: ({ children }) => (
          <CommiqProvider stores={{ cart }}>{children}</CommiqProvider>
        ),
      }),
    ).toThrow(/no store named "missing"/);

    spy.mockRestore();
  });

  it("fails loudly when a name is used without a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useNamedCartItems())).toThrow(
      /CommiqProvider/,
    );

    spy.mockRestore();
  });
});
