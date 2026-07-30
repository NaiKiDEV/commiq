import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createStore, createCommand } from "@naikidev/commiq";
import {
  createDeserializer,
  createSerializer,
  persistStore,
  richReplacer,
  richReviver,
} from "../index";
import { readNumber, readStored } from "./helpers";

type RichState = {
  when: Date;
  tags: Set<string>;
  entries: Map<string, number>;
  missing: string | undefined;
  broken: number;
};

function richState(): RichState {
  return {
    when: new Date("2020-01-02T03:04:05.000Z"),
    tags: new Set(["a", "b"]),
    entries: new Map([["x", 1]]),
    missing: undefined,
    broken: Number.NaN,
  };
}

function readProp(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, key);
}

describe("serialization", () => {
  it("wraps state in a versioned envelope", () => {
    const raw = createSerializer()({ version: 2, state: { count: 1 } });
    const parsed: unknown = JSON.parse(raw);

    expect(readNumber(parsed, "version")).toBe(2);
    expect(readProp(parsed, "state")).toEqual({ count: 1 });
    expect(readProp(parsed, "$")).toBe("commiq/persist");
  });

  it("default JSON codec loses non-JSON values", () => {
    const raw = createSerializer()({ version: 0, state: richState() });
    const revived = readProp(createDeserializer()(raw), "state");

    expect(typeof readProp(revived, "when")).toBe("string");
    expect(readProp(revived, "tags")).toEqual({});
    expect(readProp(revived, "entries")).toEqual({});
    expect(readProp(revived, "broken")).toBeNull();
    expect(readProp(revived, "missing")).toBeUndefined();
  });

  it("rich codec round-trips Date, Set, Map, undefined and NaN", () => {
    const raw = createSerializer(richReplacer)({
      version: 0,
      state: richState(),
    });
    const revived = readProp(createDeserializer(richReviver)(raw), "state");

    expect(readProp(revived, "when")).toEqual(
      new Date("2020-01-02T03:04:05.000Z"),
    );
    expect(readProp(revived, "tags")).toEqual(new Set(["a", "b"]));
    expect(readProp(revived, "entries")).toEqual(new Map([["x", 1]]));
    expect(readProp(revived, "broken")).toBeNaN();
    expect(readProp(revived, "missing")).toBeUndefined();
  });

  it("does not restore undefined properties as present keys", () => {
    const raw = createSerializer(richReplacer)({
      version: 0,
      state: { missing: undefined },
    });
    const revived = readProp(createDeserializer(richReviver)(raw), "state");

    expect(raw).toContain("$commiqType");
    expect(revived).not.toHaveProperty("missing");
  });

  it("rich codec round-trips bigint and infinities", () => {
    const state = { big: 10n, up: Infinity, down: -Infinity };
    const raw = createSerializer(richReplacer)({ version: 0, state });
    const revived = readProp(createDeserializer(richReviver)(raw), "state");

    expect(readProp(revived, "big")).toBe(10n);
    expect(readProp(revived, "up")).toBe(Infinity);
    expect(readProp(revived, "down")).toBe(-Infinity);
  });

  it("rich codec preserves nested values", () => {
    const state = { nested: { when: new Date(0), list: [new Date(1000)] } };
    const raw = createSerializer(richReplacer)({ version: 0, state });
    const revived = readProp(createDeserializer(richReviver)(raw), "state");
    const nested = readProp(revived, "nested");

    expect(readProp(nested, "when")).toEqual(new Date(0));
    expect(readProp(nested, "list")).toEqual([new Date(1000)]);
  });
});

describe("persistStore with the rich codec", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a Date through storage", async () => {
    type State = { at: Date };
    const first = createStore<State>({ at: new Date(0) });
    first.addCommandHandler<number>("stamp", (ctx, cmd) => {
      ctx.setState({ at: new Date(cmd.data) });
    });
    const persistedFirst = persistStore(first, {
      key: "rich",
      debounce: 0,
      replacer: richReplacer,
      reviver: richReviver,
    });
    await persistedFirst.hydrated;

    first.queue(createCommand("stamp", 86_400_000));
    await first.flush();
    await persistedFirst.flush();
    persistedFirst.destroy();

    const second = createStore<State>({ at: new Date(0) });
    const persistedSecond = persistStore(second, {
      key: "rich",
      replacer: richReplacer,
      reviver: richReviver,
    });
    await persistedSecond.hydrated;

    expect(second.state.at).toBeInstanceOf(Date);
    expect(second.state.at.getTime()).toBe(86_400_000);
    persistedSecond.destroy();
  });

  it("keeps the plain JSON shape readable in storage", async () => {
    const store = createStore<{ count: number }>({ count: 0 });
    store.addCommandHandler<number>("set", (ctx, cmd) => {
      ctx.setState({ count: cmd.data });
    });
    const persisted = persistStore(store, { key: "plain", debounce: 0 });
    await persisted.hydrated;

    store.queue(createCommand("set", 4));
    await store.flush();
    await persisted.flush();

    expect(readStored(localStorage.getItem("plain"))).toEqual({ count: 4 });
    persisted.destroy();
  });
});
