import { describe, it, expect, vi } from "vitest";
import {
  createCommand,
  createCommandDef,
  createEvent,
  createStore,
  sealStore,
} from "@naikidev/commiq";
import type { EventDef } from "@naikidev/commiq";
import { createEffects } from "../index";
import type { EffectErrorReport } from "../index";

type TestState = { value: string; writes: string[] };

type Gate = { wait: Promise<void>; open: () => void };

function createGate(): Gate {
  let open: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

async function settle(turns = 20): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}

function setup() {
  const store = createStore<TestState>({ value: "", writes: [] });
  store.addCommandHandler<string>("write", (ctx, cmd) => {
    ctx.setState((prev) => ({
      value: cmd.data,
      writes: [...prev.writes, cmd.data],
    }));
  });
  return { store, sealed: sealStore(store) };
}

type TestStore = ReturnType<typeof setup>["store"];

function publisher<D>(
  store: TestStore,
  eventDef: EventDef<D>,
  commandName: string,
) {
  store.addCommandHandler<D>(commandName, (ctx, cmd) => {
    ctx.emit(eventDef, cmd.data);
  });
  return async (data: D): Promise<void> => {
    store.queue(createCommand(commandName, data));
    await store.flush();
  };
}

describe("createEffects — triggering", () => {
  it("triggers effect on matching event", async () => {
    const { store, sealed } = setup();
    const myEvent = createEvent<string>("myEvent");
    const effects = createEffects(sealed);
    const handler = vi.fn();
    const emit = publisher(store, myEvent, "emitMyEvent");

    effects.on(myEvent, handler);
    await emit("hello");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    effects.destroy();
  });

  it("effect receives a queue function that dispatches commands", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("trigger");
    const effects = createEffects(sealed);
    const emit = publisher(store, trigger, "fire");

    effects.on(trigger, (data, ctx) => {
      ctx.queue(createCommand("write", data));
    });
    await emit("from-effect");

    expect(store.state.value).toBe("from-effect");

    effects.destroy();
  });

  it("effect can dispatch through a command def", async () => {
    const { store, sealed } = setup();
    const writeDef = createCommandDef<string>("write");
    const trigger = createEvent<string>("trigger");
    const effects = createEffects(sealed);
    const emit = publisher(store, trigger, "fire");

    effects.on(trigger, (data, ctx) => {
      ctx.queue(writeDef, data);
    });
    await emit("via-def");

    expect(store.state.value).toBe("via-def");

    effects.destroy();
  });

  it("runs every registration listening to the same event", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("trigger");
    const effects = createEffects(sealed);
    const first = vi.fn();
    const second = vi.fn();
    const emit = publisher(store, trigger, "fire");

    effects.on(trigger, first);
    effects.on(trigger, second);
    await emit("x");

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    effects.destroy();
  });

  it("runs every debounced registration on the same event", async () => {
    vi.useFakeTimers();
    try {
      const { store, sealed } = setup();
      const trigger = createEvent<string>("trigger");
      const effects = createEffects(sealed);
      const first = vi.fn();
      const second = vi.fn();
      const emit = publisher(store, trigger, "fire");

      effects.on(trigger, first, { debounce: 50 });
      effects.on(trigger, second, { debounce: 50 });
      await emit("x");
      await vi.advanceTimersByTimeAsync(60);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);

      effects.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("on() returns an unsubscribe that removes only that registration", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("trigger");
    const effects = createEffects(sealed);
    const removed = vi.fn();
    const kept = vi.fn();
    const emit = publisher(store, trigger, "fire");

    const off = effects.on(trigger, removed);
    effects.on(trigger, kept);
    off();
    off();
    await emit("x");

    expect(removed).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);

    effects.destroy();
  });

  it("exposes live store state on the effect context", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("trigger");
    const effects = createEffects(sealed);
    const gate = createGate();
    const seen: string[] = [];
    const emit = publisher(store, trigger, "fire");

    effects.on(trigger, async (_data, ctx) => {
      seen.push(ctx.state.value);
      await gate.wait;
      seen.push(ctx.state.value);
    });

    store.queue(createCommand("write", "before"));
    await store.flush();
    await emit("x");

    store.queue(createCommand("write", "after"));
    await store.flush();
    gate.open();
    await settle();

    expect(seen).toEqual(["before", "after"]);

    effects.destroy();
  });
});

describe("createEffects — concurrency modes", () => {
  it("defaults to parallel mode and overlaps runs", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<number>("trigger");
    const effects = createEffects(sealed);
    const started: number[] = [];
    const finished: number[] = [];
    const gate = createGate();
    const emit = publisher(store, trigger, "fire");

    effects.on(trigger, async (data) => {
      started.push(data);
      await gate.wait;
      finished.push(data);
    });

    await emit(1);
    await emit(2);

    expect(started).toEqual([1, 2]);
    expect(finished).toEqual([]);

    gate.open();
    await settle();

    expect(finished).toEqual([1, 2]);

    effects.destroy();
  });

  it("mode switch aborts the in-flight run", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<number>("trigger");
    const effects = createEffects(sealed);
    const aborted: number[] = [];
    const completed: number[] = [];
    const gate = createGate();
    const emit = publisher(store, trigger, "fire");

    effects.on(
      trigger,
      async (data, ctx) => {
        await gate.wait;
        if (ctx.signal.aborted) {
          aborted.push(data);
          return;
        }
        completed.push(data);
      },
      { mode: "switch" },
    );

    await emit(1);
    await emit(2);
    gate.open();
    await settle();

    expect(aborted).toEqual([1]);
    expect(completed).toEqual([2]);

    effects.destroy();
  });

  it("restartOnNew still maps onto switch", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<number>("trigger");
    const effects = createEffects(sealed);
    const completed: number[] = [];
    const gate = createGate();
    const emit = publisher(store, trigger, "fire");

    effects.on(
      trigger,
      async (data, ctx) => {
        await gate.wait;
        if (ctx.signal.aborted) return;
        completed.push(data);
      },
      { restartOnNew: true },
    );

    await emit(1);
    await emit(2);
    gate.open();
    await settle();

    expect(completed).toEqual([2]);

    effects.destroy();
  });

  it("mode drop ignores triggers while a run is active", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<number>("trigger");
    const effects = createEffects(sealed);
    const started: number[] = [];
    const gate = createGate();
    const emit = publisher(store, trigger, "fire");

    effects.on(
      trigger,
      async (data) => {
        started.push(data);
        await gate.wait;
      },
      { mode: "drop" },
    );

    await emit(1);
    await emit(2);

    expect(started).toEqual([1]);

    gate.open();
    await settle();
    await emit(3);

    expect(started).toEqual([1, 3]);

    effects.destroy();
  });

  it("mode queue serializes runs", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<number>("trigger");
    const effects = createEffects(sealed);
    const order: string[] = [];
    const gates = [createGate(), createGate()];
    let index = 0;
    const emit = publisher(store, trigger, "fire");

    effects.on(
      trigger,
      async (data: number) => {
        const gate = gates[index];
        index += 1;
        order.push(`start:${data}`);
        await gate.wait;
        order.push(`end:${data}`);
      },
      { mode: "queue" },
    );

    await emit(1);
    await emit(2);

    expect(order).toEqual(["start:1"]);

    gates[0].open();
    await settle();

    expect(order).toEqual(["start:1", "end:1", "start:2"]);

    gates[1].open();
    await settle();

    expect(order).toEqual(["start:1", "end:1", "start:2", "end:2"]);

    effects.destroy();
  });
});

describe("createEffects — cancellation", () => {
  it("cancelOn aborts the running effect", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("start");
    const cancel = createEvent("cancel");
    const effects = createEffects(sealed);
    const gate = createGate();
    let wasAborted = false;
    const emitStart = publisher(store, trigger, "startCmd");
    const emitCancel = publisher(store, cancel, "cancelCmd");

    effects.on(
      trigger,
      async (_data, ctx) => {
        await gate.wait;
        wasAborted = ctx.signal.aborted;
      },
      { cancelOn: cancel },
    );

    await emitStart("x");
    await emitCancel(undefined);
    gate.open();
    await settle();

    expect(wasAborted).toBe(true);

    effects.destroy();
  });

  it("cancelOn clears a pending debounce timer", async () => {
    vi.useFakeTimers();
    try {
      const { store, sealed } = setup();
      const trigger = createEvent<string>("start");
      const cancel = createEvent("cancel");
      const effects = createEffects(sealed);
      const handler = vi.fn();
      const emitStart = publisher(store, trigger, "startCmd");
      const emitCancel = publisher(store, cancel, "cancelCmd");

      effects.on(trigger, handler, { debounce: 50, cancelOn: cancel });

      await emitStart("x");
      await emitCancel(undefined);
      await vi.advanceTimersByTimeAsync(120);

      expect(handler).not.toHaveBeenCalled();

      effects.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancelOn does not abort a sibling registration", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("start");
    const cancel = createEvent("cancel");
    const effects = createEffects(sealed);
    const gate = createGate();
    let cancellableAborted = false;
    let siblingAborted = false;
    const emitStart = publisher(store, trigger, "startCmd");
    const emitCancel = publisher(store, cancel, "cancelCmd");

    effects.on(
      trigger,
      async (_data, ctx) => {
        await gate.wait;
        cancellableAborted = ctx.signal.aborted;
      },
      { cancelOn: cancel },
    );
    effects.on(trigger, async (_data, ctx) => {
      await gate.wait;
      siblingAborted = ctx.signal.aborted;
    });

    await emitStart("x");
    await emitCancel(undefined);
    gate.open();
    await settle();

    expect(cancellableAborted).toBe(true);
    expect(siblingAborted).toBe(false);

    effects.destroy();
  });

  it("debounce delays execution, last-wins", async () => {
    vi.useFakeTimers();
    try {
      const { store, sealed } = setup();
      const trigger = createEvent<number>("trigger");
      const effects = createEffects(sealed);
      const handled: number[] = [];
      const emit = publisher(store, trigger, "fire");

      effects.on(
        trigger,
        (data) => {
          handled.push(data);
        },
        { debounce: 50 },
      );

      await emit(1);
      await vi.advanceTimersByTimeAsync(10);
      await emit(2);
      await vi.advanceTimersByTimeAsync(10);
      await emit(3);

      expect(handled).toEqual([]);

      await vi.advanceTimersByTimeAsync(60);

      expect(handled).toEqual([3]);

      effects.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createEffects — dispatch guards", () => {
  it("drops ctx.queue from a cancelled run and reports it", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("start");
    const cancel = createEvent("cancel");
    const reports: EffectErrorReport[] = [];
    const effects = createEffects(sealed);
    const gate = createGate();
    const emitStart = publisher(store, trigger, "startCmd");
    const emitCancel = publisher(store, cancel, "cancelCmd");

    effects.on(
      trigger,
      async (_data, ctx) => {
        await gate.wait;
        ctx.queue(createCommand("write", "stale"));
      },
      {
        cancelOn: cancel,
        onError: (report) => {
          reports.push(report);
        },
      },
    );

    await emitStart("x");
    await emitCancel(undefined);
    gate.open();
    await settle();
    await store.flush();

    expect(store.state.writes).toEqual([]);
    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe("abortedDispatch");
    expect(reports[0].command?.name).toBe("write");
    expect(reports[0].event?.name).toBe("start");

    effects.destroy();
  });

  it("drops ctx.queue after destroy and reports it", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("start");
    const reports: EffectErrorReport[] = [];
    const effects = createEffects(sealed, {
      onError: (report) => {
        reports.push(report);
      },
    });
    const gate = createGate();
    const emit = publisher(store, trigger, "fire");

    effects.on(trigger, async (_data, ctx) => {
      await gate.wait;
      ctx.queue(createCommand("write", "write-after-destroy"));
    });

    await emit("x");
    effects.destroy();
    gate.open();
    await settle();
    await store.flush();

    expect(store.state.writes).toEqual([]);
    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe("destroyedEffects");
  });

  it("returns a discarded command handle for a dropped dispatch", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("start");
    const effects = createEffects(sealed, { onError: () => {} });
    const gate = createGate();
    let status: string | undefined;
    const emit = publisher(store, trigger, "fire");

    effects.on(trigger, async (_data, ctx) => {
      await gate.wait;
      const result = await ctx.queue(createCommand("write", "stale"));
      status = result.status;
    });

    await emit("x");
    effects.destroy();
    gate.open();
    await settle();

    expect(status).toBe("discarded");
  });
});

describe("createEffects — error channel", () => {
  it("reports a non-abort handler error to the registration onError", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("trigger");
    const reports: EffectErrorReport[] = [];
    const effects = createEffects(sealed);
    const emit = publisher(store, trigger, "fire");

    effects.on(
      trigger,
      () => {
        throw new TypeError("real bug");
      },
      {
        onError: (report) => {
          reports.push(report);
        },
      },
    );

    await emit("x");
    await settle();

    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe("effectHandler");
    expect(reports[0].error).toBeInstanceOf(TypeError);
    expect(reports[0].event?.name).toBe("trigger");

    effects.destroy();
  });

  it("reports a rejected async handler to the instance onError", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("trigger");
    const reports: EffectErrorReport[] = [];
    const effects = createEffects(sealed, {
      onError: (report) => {
        reports.push(report);
      },
    });
    const emit = publisher(store, trigger, "fire");

    effects.on(trigger, async () => {
      await Promise.resolve();
      throw new Error("fetch failed");
    });

    await emit("x");
    await settle();

    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe("effectHandler");

    effects.destroy();
  });

  it("a throwing effect does not fail the originating command", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("trigger");
    const effects = createEffects(sealed, { onError: () => {} });

    store.addCommandHandler<string>("fire", (ctx, cmd) => {
      ctx.emit(trigger, cmd.data);
    });
    effects.on(trigger, () => {
      throw new TypeError("real bug");
    });

    const result = await store.queue(createCommand("fire", "x"));
    await settle();

    expect(result.status).toBe("handled");

    effects.destroy();
  });

  it("does not report AbortError rejections", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<number>("trigger");
    const reports: EffectErrorReport[] = [];
    const effects = createEffects(sealed, {
      onError: (report) => {
        reports.push(report);
      },
    });
    const emit = publisher(store, trigger, "fire");

    effects.on(
      trigger,
      (_data, ctx) =>
        new Promise<void>((_resolve, reject) => {
          ctx.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
      { mode: "switch" },
    );

    await emit(1);
    await emit(2);
    effects.destroy();
    await settle();

    expect(reports).toEqual([]);
  });

  it("reports on() after destroy and returns a no-op unsubscribe", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("trigger");
    const reports: EffectErrorReport[] = [];
    const effects = createEffects(sealed, {
      onError: (report) => {
        reports.push(report);
      },
    });
    const handler = vi.fn();
    const emit = publisher(store, trigger, "fire");

    effects.destroy();
    const off = effects.on(trigger, handler);
    await emit("x");

    expect(handler).not.toHaveBeenCalled();
    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe("destroyedEffects");
    expect(() => off()).not.toThrow();
  });
});

describe("createEffects — teardown", () => {
  it("destroy stops pending debounces and future events", async () => {
    vi.useFakeTimers();
    try {
      const { store, sealed } = setup();
      const trigger = createEvent<string>("trigger");
      const effects = createEffects(sealed);
      const handler = vi.fn();
      const emit = publisher(store, trigger, "fire");

      effects.on(trigger, handler, { debounce: 50 });
      await emit("x");
      effects.destroy();
      await vi.advanceTimersByTimeAsync(80);

      expect(handler).not.toHaveBeenCalled();

      await emit("y");
      await vi.advanceTimersByTimeAsync(80);

      expect(handler).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("destroy aborts every concurrent in-flight run", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<number>("trigger");
    const effects = createEffects(sealed);
    const survived: number[] = [];
    const gate = createGate();
    const emit = publisher(store, trigger, "fire");

    effects.on(trigger, async (data, ctx) => {
      await gate.wait;
      if (!ctx.signal.aborted) survived.push(data);
    });

    await emit(1);
    await emit(2);
    effects.destroy();
    gate.open();
    await settle();

    expect(survived).toEqual([]);
  });

  it("destroy is idempotent", async () => {
    const { store, sealed } = setup();
    const trigger = createEvent<string>("trigger");
    const effects = createEffects(sealed);
    const handler = vi.fn();
    const emit = publisher(store, trigger, "fire");

    effects.on(trigger, handler);
    effects.destroy();

    expect(() => effects.destroy()).not.toThrow();

    effects.destroy();
    await emit("x");

    expect(handler).not.toHaveBeenCalled();
  });
});
