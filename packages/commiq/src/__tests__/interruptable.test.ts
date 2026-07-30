import { describe, it, expect, vi } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  BuiltinEvent,
  matchEvent,
} from "../index";
import type { StoreEvent, Command } from "../types";
import { createGate, drain } from "./gate";

describe("interruptable commands", () => {
  it("interruptable handler receives a working signal", async () => {
    const store = createStore({ value: "" });
    let receivedSignal: AbortSignal | undefined;

    store.addCommandHandler("fetch", (ctx) => {
      receivedSignal = ctx.signal;
      ctx.setState({ value: "done" });
    }, { interruptable: true });

    store.queue(createCommand("fetch", undefined));
    await store.flush();

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal!.aborted).toBe(false);
    expect(store.state.value).toBe("done");
  });

  it("non-interruptable handler does not receive signal", async () => {
    const store = createStore({ value: "" });
    let receivedSignal: AbortSignal | undefined = undefined;

    store.addCommandHandler("sync", (ctx) => {
      receivedSignal = ctx.signal;
      ctx.setState({ value: "done" });
    });

    store.queue(createCommand("sync", undefined));
    await store.flush();

    expect(receivedSignal).toBeUndefined();
  });

  it("re-queuing same command aborts running handler", async () => {
    const store = createStore({ value: "" });
    const gate = createGate();
    const interrupted: Array<{ command: Command; phase: string }> = [];

    store.openStream((event: StoreEvent) => {
      if (matchEvent(event, BuiltinEvent.CommandInterrupted)) {
        interrupted.push(event.data);
      }
    });

    store.addCommandHandler("search", async (ctx) => {
      await gate.wait();
      if (!ctx.signal!.aborted) {
        ctx.setState({ value: ctx.state.value + "x" });
      }
    }, { interruptable: true });

    store.queue(createCommand("search", undefined));
    // Queue another while first is running — this triggers abort on first
    await gate.parked();
    store.queue(createCommand("search", undefined));
    await drain(store, gate);

    expect(interrupted.some((e) => e.phase === "running")).toBe(true);
    // Only the second command should complete
    expect(store.state.value).toBe("x");
  });

  it("re-queuing removes queued (not-yet-started) duplicates", async () => {
    const store = createStore({ count: 0 });
    const gate = createGate();
    const interrupted: Array<{ command: Command; phase: string }> = [];

    store.openStream((event: StoreEvent) => {
      if (matchEvent(event, BuiltinEvent.CommandInterrupted)) {
        interrupted.push(event.data);
      }
    });

    // Use a gated blocking handler to ensure queue builds up
    store.addCommandHandler("block", async () => {
      await gate.wait();
    });

    store.addCommandHandler<number>("update", (ctx, cmd) => {
      ctx.setState({ count: cmd.data });
    }, { interruptable: true });

    // Queue a blocking command first, then multiple updates
    store.queue(createCommand("block", undefined));
    store.queue(createCommand("update", 1));
    store.queue(createCommand("update", 2));
    // This should remove the queued "update 1" and "update 2"
    store.queue(createCommand("update", 3));

    await drain(store, gate);

    const queuedInterrupts = interrupted.filter((e) => e.phase === "queued");
    expect(queuedInterrupts).toHaveLength(2);
    expect(store.state.count).toBe(3);
  });

  it("CommandInterrupted event has correct phase for queued commands", async () => {
    const store = createStore({ value: "" });
    const gate = createGate();
    const phases: string[] = [];

    store.openStream((event: StoreEvent) => {
      if (matchEvent(event, BuiltinEvent.CommandInterrupted)) {
        phases.push(event.data.phase);
      }
    });

    store.addCommandHandler("block", async () => {
      await gate.wait();
    });

    store.addCommandHandler("task", (ctx) => {
      ctx.setState({ value: "done" });
    }, { interruptable: true });

    store.queue(createCommand("block", undefined));
    store.queue(createCommand("task", undefined));
    store.queue(createCommand("task", undefined)); // replaces the queued one

    await drain(store, gate);

    expect(phases).toContain("queued");
  });

  it("multiple rapid re-queues: only last one runs", async () => {
    const store = createStore({ value: "" });
    const gate = createGate();
    const handled: number[] = [];

    store.addCommandHandler("block", async () => {
      await gate.wait();
    });

    store.addCommandHandler<number>("rapid", (ctx, cmd) => {
      handled.push(cmd.data);
      ctx.setState({ value: String(cmd.data) });
    }, { interruptable: true });

    store.queue(createCommand("block", undefined));
    store.queue(createCommand("rapid", 1));
    store.queue(createCommand("rapid", 2));
    store.queue(createCommand("rapid", 3));
    store.queue(createCommand("rapid", 4));
    store.queue(createCommand("rapid", 5));

    await drain(store, gate);

    expect(handled).toEqual([5]);
    expect(store.state.value).toBe("5");
  });

  it("non-interruptable handlers are unaffected by interruptable logic", async () => {
    const store = createStore({ values: [] as number[] });

    store.addCommandHandler<number>("append", (ctx, cmd) => {
      ctx.setState({ values: [...ctx.state.values, cmd.data] });
    });

    store.queue(createCommand("append", 1));
    store.queue(createCommand("append", 2));
    store.queue(createCommand("append", 3));
    await store.flush();

    expect(store.state.values).toEqual([1, 2, 3]);
  });

  it("rollbackOnInterrupt reverts the partial write and broadcasts the revert", async () => {
    const store = createStore({ value: "initial" });
    const gate = createGate();
    const changes: string[] = [];
    let valueAtInterrupt: string | undefined;

    store.openStream((event: StoreEvent) => {
      if (matchEvent(event, BuiltinEvent.StateChanged)) {
        changes.push((event.data.next as { value: string }).value);
      }
      if (matchEvent(event, BuiltinEvent.CommandInterrupted)) {
        valueAtInterrupt = store.state.value;
      }
    });

    store.addCommandHandler("slow", async (ctx) => {
      ctx.setState({ value: "partial" });
      await gate.wait();
      if (!ctx.signal!.aborted) {
        ctx.setState({ value: "done" });
      }
    }, { interruptable: true, rollbackOnInterrupt: true });

    store.queue(createCommand("slow", undefined));
    await gate.parked();
    store.queue(createCommand("slow", undefined));
    await drain(store, gate);

    expect(valueAtInterrupt).toBe("initial");
    expect(changes).toEqual(["partial", "initial", "partial", "done"]);
    expect(store.state.value).toBe("done");
  });

  it("rollbackOnInterrupt restores state when handler throws after abort", async () => {
    const store = createStore({ value: "initial" });
    const gate = createGate();
    const states: string[] = [];

    store.openStream((event: StoreEvent) => {
      if (matchEvent(event, BuiltinEvent.CommandInterrupted)) {
        states.push(store.state.value);
      }
    });

    store.addCommandHandler<string>("abortable", async (ctx, cmd) => {
      ctx.setState({ value: cmd.data });
      await Promise.race([
        gate.wait(),
        new Promise<never>((_, reject) => {
          ctx.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
      ]);
    }, { interruptable: true, rollbackOnInterrupt: true });

    store.queue(createCommand("abortable", "first"));
    await gate.parked();
    store.queue(createCommand("abortable", "second"));
    await drain(store, gate);

    expect(states[0]).toBe("initial");
    expect(store.state.value).toBe("second");
  });

  it("without rollbackOnInterrupt, the partial write survives the interrupt", async () => {
    const store = createStore({ value: "initial" });
    const gate = createGate();
    const changes: string[] = [];
    let valueAtInterrupt: string | undefined;

    store.openStream((event: StoreEvent) => {
      if (matchEvent(event, BuiltinEvent.StateChanged)) {
        changes.push((event.data.next as { value: string }).value);
      }
      if (matchEvent(event, BuiltinEvent.CommandInterrupted)) {
        valueAtInterrupt = store.state.value;
      }
    });

    store.addCommandHandler("slow", async (ctx) => {
      ctx.setState({ value: "partial" });
      await gate.wait();
      if (!ctx.signal!.aborted) {
        ctx.setState({ value: "done" });
      }
    }, { interruptable: true });

    store.queue(createCommand("slow", undefined));
    await gate.parked();
    store.queue(createCommand("slow", undefined));
    await drain(store, gate);

    expect(valueAtInterrupt).toBe("partial");
    expect(changes).toEqual(["partial", "partial", "done"]);
    expect(store.state.value).toBe("done");
  });

  it("delivers state changes and emitted events of an aborted handler", async () => {
    const progress = createEvent<string>("progress");
    const store = createStore({ value: "initial" });
    const gate = createGate();
    const observed: string[] = [];

    store.openStream((event: StoreEvent) => {
      if (matchEvent(event, progress)) observed.push(`progress:${event.data}`);
      if (matchEvent(event, BuiltinEvent.StateChanged)) {
        observed.push(`state:${(event.data.next as { value: string }).value}`);
      }
    });

    store.addCommandHandler<string>("stream", async (ctx, cmd) => {
      ctx.setState({ value: cmd.data });
      ctx.emit(progress, cmd.data);
      await gate.wait();
    }, { interruptable: true });

    store.queue(createCommand("stream", "first"));
    await gate.parked();
    store.queue(createCommand("stream", "second"));
    await drain(store, gate);

    expect(observed).toEqual([
      "state:first",
      "progress:first",
      "state:second",
      "progress:second",
    ]);
  });

  it("handler that throws AbortError when aborted emits CommandInterrupted", async () => {
    const store = createStore({ value: "" });
    const gate = createGate();
    const events: string[] = [];

    store.openStream((event: StoreEvent) => {
      if (event.id === BuiltinEvent.CommandInterrupted.id) events.push("interrupted");
      if (event.id === BuiltinEvent.CommandHandlingError.id) events.push("error");
    });

    store.addCommandHandler("abortable", async (ctx) => {
      await Promise.race([
        gate.wait(),
        new Promise<never>((_, reject) => {
          ctx.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
      ]);
      ctx.setState({ value: "done" });
    }, { interruptable: true });

    store.queue(createCommand("abortable", undefined));
    await gate.parked();
    store.queue(createCommand("abortable", undefined));
    await drain(store, gate);

    expect(events).toContain("interrupted");
    expect(events).not.toContain("error");
  });
});
