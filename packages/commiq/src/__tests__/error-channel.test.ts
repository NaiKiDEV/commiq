import { describe, it, expect, vi } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  matchEvent,
  BuiltinEvent,
} from "../index";
import type { StoreErrorReport, StoreEvent } from "../index";

describe("error channel", () => {
  it("isolates a throwing stream listener from the other listeners", async () => {
    const reported: StoreErrorReport[] = [];
    const store = createStore(
      { count: 0 },
      { onError: (report) => reported.push(report) },
    );
    const second = vi.fn();

    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    store.openStream(() => {
      throw new Error("listener blew up");
    });
    store.openStream(second);

    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(store.state).toEqual({ count: 1 });
    expect(second).toHaveBeenCalled();
    expect(reported.length).toBeGreaterThan(0);
    expect(reported[0].source).toBe("streamListener");
    expect(reported[0].event?.name).toBe("commandStarted");
  });

  it("does not let a throwing listener escape replaceState", async () => {
    const reported: StoreErrorReport[] = [];
    const store = createStore(
      { count: 0 },
      { onError: (report) => reported.push(report) },
    );
    const second = vi.fn();

    store.openStream(() => {
      throw new Error("listener blew up");
    });
    store.openStream(second);

    expect(() => store.replaceState({ count: 1 })).not.toThrow();
    await store.flush();

    expect(store.state).toEqual({ count: 1 });
    const names = second.mock.calls.map((c) => c[0].name);
    expect(names).toContain("stateChanged");
    expect(names).toContain("stateReset");
    expect(reported.map((r) => r.source)).toContain("streamListener");
  });

  it("emits unhandledError for a stream listener failure", async () => {
    const store = createStore({ count: 0 }, { onError: () => {} });
    const failures: StoreErrorReport[] = [];

    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: 1 });
    });
    store.addEventHandler(BuiltinEvent.UnhandledError, (_ctx, event) => {
      failures.push(event.data);
    });
    store.openStream((event: StoreEvent) => {
      if (event.name === "commandStarted") throw new Error("listener blew up");
    });

    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(failures).toHaveLength(1);
    expect(failures[0].source).toBe("streamListener");
    expect((failures[0].error as Error).message).toBe("listener blew up");
  });

  it("reports a failing afterCommand extension hook", async () => {
    const reported: StoreErrorReport[] = [];
    const store = createStore(
      { count: 0 },
      { onError: (report) => reported.push(report) },
    )
      .useExtension({
        afterCommand: () => {
          throw new Error("hook blew up");
        },
      })
      .addCommandHandler("inc", (ctx) => {
        ctx.setState({ count: 1 });
      });

    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(store.state).toEqual({ count: 1 });
    expect(reported.map((r) => r.source)).toEqual(["contextExtension"]);
  });

  it("still reports a command handler failure through onError", async () => {
    const reported: StoreErrorReport[] = [];
    const store = createStore(
      { count: 0 },
      { onError: (report) => reported.push(report) },
    );

    store.addCommandHandler("fail", () => {
      throw new Error("command blew up");
    });

    store.queue(createCommand("fail", undefined));
    await store.flush();

    expect(reported).toHaveLength(1);
    expect(reported[0].source).toBe("commandHandler");
    expect(reported[0].command?.name).toBe("fail");
  });

  it("survives an onError reporter that throws", async () => {
    const store = createStore(
      { count: 0 },
      {
        onError: () => {
          throw new Error("reporter blew up");
        },
      },
    );

    store.addCommandHandler("fail", () => {
      throw new Error("command blew up");
    });
    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: 1 });
    });

    store.queue(createCommand("fail", undefined));
    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(store.state).toEqual({ count: 1 });
  });
});

describe("dispatch snapshots", () => {
  it("does not deliver in-flight events to a listener added during dispatch", async () => {
    const store = createStore({ count: 0 });
    const late = vi.fn();

    store.addCommandHandler("inc", (ctx) => {
      ctx.setState({ count: 1 });
    });

    let isAdded = false;
    store.openStream((event: StoreEvent) => {
      if (isAdded || event.name !== "commandStarted") return;
      isAdded = true;
      store.openStream(late);
    });

    store.queue(createCommand("inc", undefined));
    await store.flush();

    const names = late.mock.calls.map((c) => c[0].name);
    expect(names).not.toContain("commandStarted");
    expect(names).toContain("stateChanged");
  });

  it("does not deliver the in-flight event to a handler added during dispatch", async () => {
    const fired = createEvent<string>("fired");
    const store = createStore({ count: 0 });
    const late = vi.fn();

    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(fired, "once");
      ctx.emit(fired, "twice");
    });

    let isAdded = false;
    store.addEventHandler(fired, () => {
      if (isAdded) return;
      isAdded = true;
      store.addEventHandler(fired, late);
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(late).toHaveBeenCalledTimes(1);
    expect(late.mock.calls[0][1].data).toBe("twice");
  });

  it("keeps stream listener notification order stable when one is removed mid-dispatch", async () => {
    const store = createStore({ count: 0 });
    const order: string[] = [];

    const second = (event: StoreEvent) => order.push(`second:${event.name}`);
    const first = (event: StoreEvent) => {
      order.push(`first:${event.name}`);
      store.closeStream(second);
    };

    store.openStream(first);
    store.openStream(second);

    store.replaceState({ count: 1 });
    await store.flush();

    expect(order).toEqual([
      "first:stateChanged",
      "second:stateChanged",
      "first:stateReset",
    ]);
  });
});

describe("event handler failures", () => {
  it("emits eventHandlingError carrying the source event", async () => {
    const fired = createEvent<string>("fired");
    const store = createStore({ count: 0 }, { onError: () => {} });
    const failures: { event: StoreEvent; error: unknown }[] = [];

    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(fired, "payload");
    });
    store.addEventHandler(fired, () => {
      throw new Error("handler blew up");
    });
    store.openStream((event) => {
      if (matchEvent(event, BuiltinEvent.EventHandlingError)) {
        failures.push(event.data);
      }
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(failures).toHaveLength(1);
    expect(failures[0].event.name).toBe("fired");
    expect(failures[0].event.data).toBe("payload");
  });

  it("emits one eventHandlingError per failing handler", async () => {
    const fired = createEvent("fired");
    const store = createStore({ count: 0 }, { onError: () => {} });
    let failureCount = 0;

    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(fired, undefined);
    });
    store.addEventHandler(fired, () => {
      throw new Error("first");
    });
    store.addEventHandler(fired, () => {
      throw new Error("second");
    });
    store.openStream((event) => {
      if (matchEvent(event, BuiltinEvent.EventHandlingError)) failureCount += 1;
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(failureCount).toBe(2);
  });
});
