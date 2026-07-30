import { describe, it, expect } from "vitest";
import { safeStringify, safeStringifyPretty, toSafeJson } from "../safe-stringify";
import { matchesSearch } from "../theme";

describe("safeStringify", () => {
  it("serialises a circular object instead of throwing", () => {
    const node: Record<string, unknown> = { name: "root" };
    node.self = node;

    expect(() => safeStringify(node)).not.toThrow();
    expect(safeStringify(node)).toContain("[Circular]");
    expect(safeStringify(node)).toContain("root");
  });

  it("survives mutual recursion between two objects", () => {
    const a: Record<string, unknown> = { id: "a" };
    const b: Record<string, unknown> = { id: "b", a };
    a.b = b;

    const text = safeStringify(a);
    expect(text).toContain("[Circular]");
    expect(text).toContain("\"id\":\"b\"");
  });

  it("truncates beyond the depth cap without recursing forever", () => {
    let node: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 40; i += 1) {
      node = { child: node };
    }

    const text = safeStringify(node, 4);
    expect(text).toContain("[MaxDepth]");
    expect(text).not.toContain("leaf");
  });

  it("keeps deep values when the cap allows it", () => {
    const value = { a: { b: { c: { d: 1 } } } };
    expect(safeStringify(value, 8)).toBe(JSON.stringify(value));
  });

  it("encodes values JSON.stringify cannot represent", () => {
    const result = toSafeJson({
      big: 10n,
      fn: function named() {},
      sym: Symbol("tag"),
      when: new Date(0),
      map: new Map([["k", 1]]),
      set: new Set([1, 2]),
      nan: Number.NaN,
      err: new Error("boom"),
    }) as Record<string, unknown>;

    expect(result.big).toBe("10n");
    expect(result.fn).toBe("[Function named]");
    expect(result.sym).toBe("Symbol(tag)");
    expect(result.when).toBe("1970-01-01T00:00:00.000Z");
    expect(result.map).toEqual({ k: 1 });
    expect(result.set).toEqual([1, 2]);
    expect(result.nan).toBe("NaN");
    expect(result.err).toEqual({ name: "Error", message: "boom" });
  });

  it("repeats a shared but non-circular reference rather than reporting a cycle", () => {
    const shared = { v: 1 };
    expect(safeStringify({ a: shared, b: shared })).toBe(
      JSON.stringify({ a: { v: 1 }, b: { v: 1 } }),
    );
  });

  it("pretty prints with indentation", () => {
    expect(safeStringifyPretty({ a: 1 })).toBe("{\n  \"a\": 1\n}");
  });

  it("handles primitives and undefined", () => {
    expect(safeStringify(1)).toBe("1");
    expect(safeStringify("x")).toBe("\"x\"");
    expect(safeStringify(null)).toBe("null");
    expect(safeStringify(undefined)).toBe("undefined");
  });
});

describe("matchesSearch", () => {
  const base = { name: "itemAdded", storeName: "cart", correlationId: "abc123" };

  it("does not throw when entry data holds a cycle", () => {
    const data: Record<string, unknown> = { label: "needle" };
    data.self = data;

    expect(() => matchesSearch({ ...base, data }, "n")).not.toThrow();
    expect(matchesSearch({ ...base, data }, "needle")).toBe(true);
  });

  it("matches on name, store, correlation id and causedBy", () => {
    expect(matchesSearch(base, "itemadded")).toBe(true);
    expect(matchesSearch(base, "CART")).toBe(true);
    expect(matchesSearch(base, "abc")).toBe(true);
    expect(matchesSearch({ ...base, causedBy: "zzz9" }, "zzz")).toBe(true);
    expect(matchesSearch(base, "nope")).toBe(false);
  });

  it("returns true for an empty query", () => {
    expect(matchesSearch(base, "")).toBe(true);
  });
});
