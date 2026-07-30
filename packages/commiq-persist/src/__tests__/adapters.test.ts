import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  indexedDbAdapter,
  localStorageAdapter,
  memoryStorageAdapter,
  noopStorageAdapter,
  sessionStorageAdapter,
  webStorageAdapter,
} from "../index";
import { createFakeIndexedDb } from "./fake-indexed-db";

describe("web storage adapters", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips values through localStorage", () => {
    const adapter = localStorageAdapter();
    adapter.setItem("k", "v");

    expect(adapter.getItem("k")).toBe("v");
    adapter.removeItem?.("k");
    expect(adapter.getItem("k")).toBeNull();
  });

  it("round-trips values through sessionStorage", () => {
    const adapter = sessionStorageAdapter();
    adapter.setItem("k", "v");

    expect(sessionStorage.getItem("k")).toBe("v");
    expect(adapter.getItem("k")).toBe("v");
  });

  it("falls back to a no-op adapter when the area is missing", () => {
    vi.stubGlobal("localStorage", undefined);
    const adapter = localStorageAdapter();

    adapter.setItem("k", "v");
    expect(adapter.getItem("k")).toBeNull();
  });

  it("no-op adapter never stores anything", () => {
    const adapter = noopStorageAdapter();
    adapter.setItem("k", "v");

    expect(adapter.getItem("k")).toBeNull();
  });

  it("memory adapter stores values in process", () => {
    const adapter = memoryStorageAdapter();
    adapter.setItem("k", "v");
    expect(adapter.getItem("k")).toBe("v");

    adapter.removeItem?.("k");
    expect(adapter.getItem("k")).toBeNull();
  });

  it("notifies subscribers of storage events for the watched key", () => {
    const adapter = webStorageAdapter(localStorage);
    const changes: (string | null)[] = [];
    const unsubscribe = adapter.subscribe?.("watched", (value) =>
      changes.push(value),
    );

    globalThis.dispatchEvent(
      new StorageEvent("storage", {
        key: "watched",
        newValue: "next",
        storageArea: localStorage,
      }),
    );
    globalThis.dispatchEvent(
      new StorageEvent("storage", {
        key: "other",
        newValue: "ignored",
        storageArea: localStorage,
      }),
    );
    globalThis.dispatchEvent(
      new StorageEvent("storage", { key: null, newValue: null }),
    );

    expect(changes).toEqual(["next", null]);

    unsubscribe?.();
    globalThis.dispatchEvent(
      new StorageEvent("storage", { key: "watched", newValue: "after" }),
    );
    expect(changes).toEqual(["next", null]);
  });

  it("ignores storage events from a different area", () => {
    const adapter = webStorageAdapter(localStorage);
    const changes: (string | null)[] = [];
    const unsubscribe = adapter.subscribe?.("watched", (value) =>
      changes.push(value),
    );

    globalThis.dispatchEvent(
      new StorageEvent("storage", {
        key: "watched",
        newValue: "next",
        storageArea: sessionStorage,
      }),
    );

    expect(changes).toEqual([]);
    unsubscribe?.();
  });
});

describe("indexedDbAdapter", () => {
  it("round-trips values through IndexedDB", async () => {
    const factory = createFakeIndexedDb();
    const adapter = indexedDbAdapter({ factory });

    await adapter.setItem("k", "v");
    expect(await adapter.getItem("k")).toBe("v");

    await adapter.removeItem?.("k");
    expect(await adapter.getItem("k")).toBeNull();
  });

  it("returns null for missing keys", async () => {
    const adapter = indexedDbAdapter({ factory: createFakeIndexedDb() });

    expect(await adapter.getItem("missing")).toBeNull();
  });

  it("reuses one connection across operations", async () => {
    const factory = createFakeIndexedDb();
    const open = vi.spyOn(factory, "open");
    const adapter = indexedDbAdapter({ factory });

    await adapter.setItem("a", "1");
    await adapter.setItem("b", "2");
    await adapter.getItem("a");

    expect(open).toHaveBeenCalledTimes(1);
  });

  it("rejects when opening the database fails", async () => {
    const adapter = indexedDbAdapter({
      factory: createFakeIndexedDb({ failOn: "open" }),
    });

    await expect(adapter.getItem("k")).rejects.toThrow(/open failed/);
  });

  it("rejects when a write fails", async () => {
    const adapter = indexedDbAdapter({
      factory: createFakeIndexedDb({ failOn: "put" }),
    });

    await expect(adapter.setItem("k", "v")).rejects.toThrow(/put failed/);
  });

  it("throws when no IndexedDB implementation exists", () => {
    vi.stubGlobal("indexedDB", undefined);

    expect(() => indexedDbAdapter()).toThrow(/IndexedDB/);
    vi.unstubAllGlobals();
  });
});
