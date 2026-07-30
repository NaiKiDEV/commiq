import { describe, it, expect, vi } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  matchEvent,
  BuiltinEvent,
} from "../index";
import type { StoreErrorReport, StoreEvent } from "../index";
import { createGate, drain } from "./gate";

type Counter = { count: number };

function collectStateChanges(
  store: { openStream: (listener: (event: StoreEvent) => void) => void },
  sink: unknown[],
): void {
  store.openStream((event) => {
    if (matchEvent(event, BuiltinEvent.StateChanged)) sink.push(event.data.next);
  });
}

describe("state observability", () => {
  it("emits stateChanged for every setState call", async () => {
    const store = createStore<Counter>({ count: 0 });
    const changes: unknown[] = [];
    collectStateChanges(store, changes);

    store.addCommandHandler("stepTwice", (ctx) => {
      ctx.setState({ count: 1 });
      ctx.setState({ count: 2 });
    });

    store.queue(createCommand("stepTwice", undefined));
    await store.flush();

    expect(changes).toEqual([{ count: 1 }, { count: 2 }]);
  });

  it("skips stateChanged when setState receives the current reference", async () => {
    const initial: Counter = { count: 0 };
    const store = createStore(initial);
    const changes: unknown[] = [];
    collectStateChanges(store, changes);

    store.addCommandHandler("noop", (ctx) => {
      ctx.setState(initial);
    });

    store.queue(createCommand("noop", undefined));
    await store.flush();

    expect(changes).toEqual([]);
  });

  it("keeps state changes observable when the handler throws afterwards", async () => {
    const store = createStore<Counter>({ count: 0 }, { onError: () => {} });
    const changes: unknown[] = [];
    collectStateChanges(store, changes);

    store.addCommandHandler("halfway", (ctx) => {
      ctx.setState({ count: 42 });
      throw new Error("boom");
    });

    store.queue(createCommand("halfway", undefined));
    await store.flush();

    expect(store.state).toEqual({ count: 42 });
    expect(changes).toEqual([{ count: 42 }]);
  });

  it("reaches event handlers for every setState", async () => {
    const store = createStore<Counter>({ count: 0 });
    const seen: unknown[] = [];

    store.addCommandHandler("stepTwice", (ctx) => {
      ctx.setState({ count: 1 });
      ctx.setState({ count: 2 });
    });
    store.addEventHandler(BuiltinEvent.StateChanged, (_ctx, event) => {
      seen.push(event.data.next);
    });

    store.queue(createCommand("stepTwice", undefined));
    await store.flush();

    expect(seen).toEqual([{ count: 1 }, { count: 2 }]);
  });

  it("reads live state through ctx.state after a concurrent replaceState", async () => {
    const store = createStore({ a: 0, b: 0 });
    const gate = createGate();

    store.addCommandHandler("setA", async (ctx) => {
      await gate.wait();
      ctx.setState({ ...ctx.state, a: 1 });
    });

    store.queue(createCommand("setA", undefined));
    await gate.parked();
    store.replaceState({ a: 0, b: 99 });
    await drain(store, gate);

    expect(store.state).toEqual({ a: 1, b: 99 });
  });

  it("supports an updater function that reads live state", async () => {
    const store = createStore<Counter>({ count: 0 });
    const gate = createGate();

    store.addCommandHandler("slowInc", async (ctx) => {
      await gate.wait();
      ctx.setState((prev) => ({ count: prev.count + 1 }));
    });

    store.queue(createCommand("slowInc", undefined));
    await gate.parked();
    store.replaceState({ count: 10 });
    await drain(store, gate);

    expect(store.state).toEqual({ count: 11 });
  });

  it("rejects and reports setState after the command finished", async () => {
    const reported: StoreErrorReport[] = [];
    const store = createStore<Counter>(
      { count: 0 },
      { onError: (report) => reported.push(report) },
    );
    const changes: unknown[] = [];
    collectStateChanges(store, changes);
    let lateSetState: (() => void) | undefined;

    store.addCommandHandler("leak", (ctx) => {
      ctx.setState({ count: 1 });
      lateSetState = () => ctx.setState({ count: 777 });
    });

    store.queue(createCommand("leak", undefined));
    await store.flush();

    lateSetState!();
    await store.flush();

    expect(store.state).toEqual({ count: 1 });
    expect(changes).toEqual([{ count: 1 }]);
    expect(reported).toHaveLength(1);
    expect(reported[0].source).toBe("disposedContext");
    expect(reported[0].command?.name).toBe("leak");
  });

  it("rejects and reports emit after the command finished", async () => {
    const late = createEvent<string>("late");
    const reported: StoreErrorReport[] = [];
    const store = createStore<Counter>(
      { count: 0 },
      { onError: (report) => reported.push(report) },
    );
    const listener = vi.fn();
    let lateEmit: (() => void) | undefined;

    store.addCommandHandler("leak", (ctx) => {
      lateEmit = () => ctx.emit(late, "too late");
    });

    store.queue(createCommand("leak", undefined));
    await store.flush();

    store.openStream(listener);
    lateEmit!();
    await store.flush();

    const names = listener.mock.calls.map((c) => c[0].name);
    expect(names).not.toContain("late");
    expect(names).toContain("unhandledError");
    expect(reported[0].source).toBe("disposedContext");
  });
});

describe("replaceState broadcasting", () => {
  it("invokes stateChanged and stateReset event handlers", async () => {
    const store = createStore<Counter>({ count: 0 });
    const changed: unknown[] = [];
    let resetCount = 0;

    store.addEventHandler(BuiltinEvent.StateChanged, (_ctx, event) => {
      changed.push(event.data.next);
    });
    store.addEventHandler(BuiltinEvent.StateReset, () => {
      resetCount += 1;
    });

    store.replaceState({ count: 7 });
    await store.flush();

    expect(changed).toEqual([{ count: 7 }]);
    expect(resetCount).toBe(1);
  });

  it("notifies each stream listener exactly once per event", async () => {
    const store = createStore<Counter>({ count: 0 });
    const names: string[] = [];
    store.openStream((event) => names.push(event.name));

    store.replaceState({ count: 1 });
    await store.flush();

    expect(names).toEqual(["stateChanged", "stateReset"]);
  });

  it("lets an event handler queue a command in reaction to hydration", async () => {
    const store = createStore({ count: 0, tag: "" });

    store.addCommandHandler<string>("tag", (ctx, cmd) => {
      ctx.setState({ ...ctx.state, tag: cmd.data });
    });
    store.addEventHandler(BuiltinEvent.StateReset, (ctx) => {
      ctx.queue(createCommand("tag", "rehydrated"));
    });

    store.replaceState({ count: 5, tag: "" });
    await store.flush();

    expect(store.state).toEqual({ count: 5, tag: "rehydrated" });
  });
});
