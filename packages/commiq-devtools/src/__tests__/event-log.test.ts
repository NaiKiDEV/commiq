import { describe, it, expect, beforeEach } from "vitest";
import { filterTimeline } from "../tabs/EventLog";
import { entryKey } from "../types";
import { entry, resetSeq } from "./fixtures";

beforeEach(resetSeq);

const defaults = {
  showBuiltins: true,
  storeFilter: null,
  searchQuery: "",
  pinnedOnly: false,
  errorFilter: false,
  pinnedKeys: undefined,
};

describe("filterTimeline", () => {
  const timeline = [
    entry({ correlationId: "a", name: "itemAdded", storeName: "cart" }),
    entry({ correlationId: "b", name: "stateChanged", storeName: "cart" }),
    entry({ correlationId: "c", name: "commandHandlingError", storeName: "auth" }),
    entry({ correlationId: "d", name: "eventHandlingError", storeName: "auth" }),
    entry({ correlationId: "e", name: "unhandledError", storeName: "auth" }),
  ];

  it("passes everything through by default", () => {
    expect(filterTimeline(timeline, defaults)).toHaveLength(5);
  });

  it("hides builtin events when asked", () => {
    const result = filterTimeline(timeline, { ...defaults, showBuiltins: false });
    expect(result.map((e) => e.name)).toEqual(["itemAdded"]);
  });

  it("keeps all four error builtins under the error filter", () => {
    const result = filterTimeline(timeline, { ...defaults, errorFilter: true });
    expect(result.map((e) => e.name)).toEqual([
      "commandHandlingError",
      "eventHandlingError",
      "unhandledError",
    ]);
  });

  it("filters by store", () => {
    expect(filterTimeline(timeline, { ...defaults, storeFilter: "auth" })).toHaveLength(3);
  });

  it("filters by search across name and store", () => {
    expect(filterTimeline(timeline, { ...defaults, searchQuery: "itemadd" })).toHaveLength(1);
    expect(filterTimeline(timeline, { ...defaults, searchQuery: "cart" })).toHaveLength(2);
  });

  it("filters to pinned rows only", () => {
    const pinnedKeys = new Set([entryKey(timeline[0])]);
    const result = filterTimeline(timeline, { ...defaults, pinnedOnly: true, pinnedKeys });
    expect(result.map((e) => e.correlationId)).toEqual(["a"]);
  });

  it("does not throw when search hits a cyclic payload", () => {
    const data: Record<string, unknown> = { label: "x" };
    data.self = data;
    const cyclic = [entry({ correlationId: "z", data })];
    expect(() => filterTimeline(cyclic, { ...defaults, searchQuery: "l" })).not.toThrow();
  });
});

describe("entryKey stability (DT-3)", () => {
  it("does not change when earlier entries are evicted from the buffer", () => {
    const timeline = [
      entry({ correlationId: "a" }),
      entry({ correlationId: "b" }),
      entry({ correlationId: "c" }),
    ];

    const keysBefore = timeline.map(entryKey);
    const evicted = timeline.slice(1);

    expect(evicted.map(entryKey)).toEqual(keysBefore.slice(1));
  });

  it("distinguishes two entries that share a correlation id", () => {
    const a = entry({ correlationId: "same", timestamp: 100 });
    const b = entry({ correlationId: "same", timestamp: 100 });
    expect(entryKey(a)).not.toBe(entryKey(b));
  });
});
