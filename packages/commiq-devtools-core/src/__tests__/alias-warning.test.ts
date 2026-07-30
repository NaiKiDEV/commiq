import { describe, it, expect, vi } from "vitest";
import {
  BuiltinEvent,
  BuiltinEventName,
  type StoreEvent,
  type StreamListener,
} from "@naikidev/commiq";
import { EventCollector } from "../collector";
import { MAX_ALIAS_WARNINGS } from "../alias-watcher";
import { safeClone } from "../snapshot";
import type { DevtoolsStore, SnapshotMode } from "../types";

class Widget {
  constructor(readonly label: string) {}
  render(): string {
    return this.label;
  }
}

type StreamStub = DevtoolsStore & {
  emitStateChanged: (prev: unknown, next: unknown) => void;
  emitEvent: (name: string, data: unknown) => void;
};

function streamStub(): StreamStub {
  const listeners = new Set<StreamListener>();
  let current: unknown = undefined;
  let seq = 0;

  const dispatch = (event: StoreEvent): void => {
    for (const listener of [...listeners]) {
      listener(event);
    }
  };

  return {
    get state(): unknown {
      return current;
    },
    openStream(listener: StreamListener): void {
      listeners.add(listener);
    },
    closeStream(listener: StreamListener): void {
      listeners.delete(listener);
    },
    emitStateChanged(prev: unknown, next: unknown): void {
      current = next;
      seq += 1;
      dispatch({
        id: BuiltinEvent.StateChanged.id,
        name: BuiltinEventName.StateChanged,
        data: { prev, next },
        timestamp: seq,
        correlationId: `corr-${seq}`,
        causedBy: null,
      });
    },
    emitEvent(name: string, data: unknown): void {
      seq += 1;
      dispatch({
        id: Symbol(name),
        name,
        data,
        timestamp: seq,
        correlationId: `corr-${seq}`,
        causedBy: null,
      });
    },
  };
}

type Harness = {
  store: StreamStub;
  onError: ReturnType<typeof vi.fn>;
  collector: EventCollector;
};

function harness(snapshotMode: SnapshotMode = "safe", detectAliasedState = true): Harness {
  const store = streamStub();
  const onError = vi.fn();
  const collector = new EventCollector({ snapshotMode, detectAliasedState, onError });
  collector.connect(store, "cart");
  return { store, onError, collector };
}

function messages(onError: ReturnType<typeof vi.fn>): string[] {
  return onError.mock.calls.map(([error]) => (error instanceof Error ? error.message : String(error)));
}

describe("aliased state detection", () => {
  it("warns for a class instance captured by reference", () => {
    const { store, onError } = harness();

    store.emitStateChanged({}, { items: [{ widget: new Widget("a") }] });

    expect(onError).toHaveBeenCalledTimes(1);
    const [message] = messages(onError);
    expect(message).toContain('store "cart"');
    expect(message).toContain("state.items.0.widget");
    expect(message).toContain("Widget");
    expect(message).toContain('snapshotMode: "structured"');
  });

  it("warns for Map and Set values", () => {
    const { store, onError } = harness();

    store.emitStateChanged({}, { lookup: new Map([["k", 1]]), tags: new Set(["t"]) });

    const found = messages(onError);
    expect(found).toHaveLength(2);
    expect(found.some((m) => m.includes("state.lookup") && m.includes("a Map"))).toBe(true);
    expect(found.some((m) => m.includes("state.tags") && m.includes("a Set"))).toBe(true);
  });

  it("warns for typed arrays", () => {
    const { store, onError } = harness();

    store.emitStateChanged({}, { buffer: new Uint8Array([1, 2]) });

    expect(messages(onError)[0]).toContain("Uint8Array");
  });

  it("warns once for the same path across many snapshots", () => {
    const { store, onError } = harness();
    const lookup = new Map<string, number>();

    for (let i = 0; i < 200; i += 1) {
      lookup.set(`k${i}`, i);
      store.emitStateChanged({ lookup }, { lookup });
    }

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("reports event payload aliasing under a data root", () => {
    const { store, onError } = harness();

    store.emitEvent("itemAdded", { widget: new Widget("a") });

    expect(messages(onError)[0]).toContain("data.widget");
  });

  it("does not warn for plain objects, arrays and dates", () => {
    const { store, onError } = harness();

    store.emitStateChanged({}, { a: { b: [1, 2, { c: 3 }] }, when: new Date(0) });

    expect(onError).not.toHaveBeenCalled();
  });

  it("does not warn in structured snapshot mode", () => {
    const { store, onError } = harness("structured");

    store.emitStateChanged({}, { widget: new Widget("a"), lookup: new Map() });

    expect(onError).not.toHaveBeenCalled();
  });

  it("does not warn in none snapshot mode", () => {
    const { store, onError } = harness("none");

    store.emitStateChanged({}, { widget: new Widget("a"), lookup: new Map() });

    expect(onError).not.toHaveBeenCalled();
  });

  it("is silenced by detectAliasedState: false", () => {
    const { store, onError } = harness("safe", false);

    store.emitStateChanged({}, { widget: new Widget("a"), lookup: new Map() });

    expect(onError).not.toHaveBeenCalled();
  });

  it("bounds the number of warnings", () => {
    const { store, onError } = harness();
    const state: Record<string, unknown> = {};
    for (let i = 0; i < MAX_ALIAS_WARNINGS * 3; i += 1) {
      state[`w${i}`] = new Widget(`w${i}`);
    }

    store.emitStateChanged({}, state);
    store.emitStateChanged({}, state);

    expect(onError).toHaveBeenCalledTimes(MAX_ALIAS_WARNINGS);
  });

  it("keeps capturing when a getter throws", () => {
    const { store, onError, collector } = harness();
    const state = {
      get boom(): number {
        throw new Error("nope");
      },
    };

    expect(() => store.emitStateChanged({}, state)).not.toThrow();
    expect(collector.getTimeline()).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("survives a reporter that throws and keeps cloning", () => {
    const reporter = () => {
      throw new Error("reporter dead");
    };
    const source = { widget: new Widget("a"), nested: { n: 1 } };

    const copy = safeClone(source, reporter);

    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
  });

  it("reports the root path when the state itself is aliased", () => {
    const { store, onError } = harness();

    store.emitStateChanged({}, new Map([["k", 1]]));

    expect(messages(onError)[0]).toContain("state holds a Map");
  });
});
